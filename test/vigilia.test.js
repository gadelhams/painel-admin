// Vigília com Plane, escritores e executor falsos: freios, avanço de gate/estado e a
// fronteira de ligar/desligar. Nenhuma CLI, rede ou Plane real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { codificarGate } from '../orquestrador/gate-plane.js';
import { criarVigilia } from '../orquestrador/vigilia.js';
import { criarConfirmacoesVigilia, criarApiVigilia } from '../orquestrador/api-vigilia.js';
import { validarContrato, configuracaoVigilia } from '../orquestrador/politica.js';
import { criarEscritorEstadoPlane } from '../orquestrador/estado-plane.js';
import { ErroAcesso } from '../orquestrador/sso.js';
import { gravarFrota, conteudoFrota, tupla } from './fixtures/frota/frota.js';
import { avisosDoContrato } from '../orquestrador/politica.js';
import { PausasFrota } from '../orquestrador/frota-pausas.js';
import { DiarioVigilia } from '../orquestrador/vigilia-diario.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const PERFIL_PADRAO = {
  orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
  codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
  validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
};
const contratoBase = {
  versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'],
  criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
  comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }, { id: 'portao', executavel: 'node', argumentos: ['scripts/portao.mjs'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true },
    { id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }],
  vigilia: { perfilPadrao: PERFIL_PADRAO, maxTentativasPorCarta: 2, tetoPorDia: 3 },
};
const identidade = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };

test('contrato: bloco vigilia valida perfil, limites e comando; defaults aplicados', () => {
  assert.deepEqual(validarContrato(contratoBase, PROJETO), []);
  const cfg = configuracaoVigilia(contratoBase);
  assert.equal(cfg.maxTentativasPorCarta, 2); assert.equal(cfg.tetoPorDia, 3); assert.equal(cfg.pausaPorLimiteMinutos, 60); assert.equal(cfg.comando, 'testes');
  assert.match(validarContrato({ ...contratoBase, vigilia: { perfilPadrao: { ...PERFIL_PADRAO, validacao: { provedor: 'claude', modelo: 'inventado', esforco: 'max' } } } }, PROJETO).join(' '), /perfilPadrao/);
  assert.match(validarContrato({ ...contratoBase, vigilia: { ...contratoBase.vigilia, tetoPorDia: 0 } }, PROJETO).join(' '), /tetoPorDia/);
  assert.match(validarContrato({ ...contratoBase, vigilia: { ...contratoBase.vigilia, comando: 'deploy' } }, PROJETO).join(' '), /comando/);
  assert.equal(configuracaoVigilia({ ...contratoBase, vigilia: undefined }), null);
  // F2 (29/10/2026): perfilPadrao é opcional e ignorado; a frota manda.
  assert.equal(configuracaoVigilia(contratoBase).perfilPadrao, undefined);
  assert.deepEqual(validarContrato({ ...contratoBase, vigilia: { tetoPorDia: 3 } }, PROJETO), []);
  assert.match(avisosDoContrato(contratoBase).join(' '), /perfilPadrao ignorado: a frota manda/);
});

// Plane falso com cards mutáveis; escritores falsos mudam o card como o Plane faria.
// A frota da vigília repete o antigo perfilPadrão, para que só a fonte mude.
const FROTA = conteudoFrota({ orquestracao: tupla('claude'), codificacao_testes: tupla('openai'), validacao: tupla('claude') });
async function ambiente({ executar, contrato = contratoBase, agora, frota = FROTA, aoValidar = null }) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-vigilia-'));
  await fs.mkdir(path.join(raiz, 'painel-admin'));
  await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify(contrato));
  const relogio = agora ?? (() => Date.parse('2026-10-24T10:00:00Z'));
  let versao = 0;
  const bump = () => `2026-10-24T10:${String(++versao).padStart(2, '0')}:00Z`;
  const cards = [];
  const comentarios = new Map();
  function novaCarta(seq, { gate = 'READY TO DEV', grupo = 'unstarted', nome = 'Todo', recibo = true } = {}) {
    const id = randomUUID();
    const c = { id, sequence_id: seq, name: `Carta ${seq}`, parent: null, state: { name: nome, group: grupo },
      labels: gate ? [{ id: `label-${gate}`, name: gate }] : [], description_html: '<p>Sem dependências.</p>', updated_at: bump() };
    cards.push(c); comentarios.set(id, []);
    if (gate && recibo) comentarios.get(id).push({ id: randomUUID(), actor: AUTOR, created_at: c.updated_at,
      comment_html: codificarGate({ projetoId: PROJETO, cartaId: id, chaveIdempotencia: randomUUID(), versaoCarta: c.updated_at,
        gate, justificativa: 'Escopo e dependências revisados.', evidencias: ['Sem dependências formais, declarado na carta.'] }) });
    return c;
  }
  const consultar = async url => {
    if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
    if (url.includes('/work-items/?')) return { results: cards.map(c => ({ ...c })) };
    if (url.includes('/relations/')) return { blocked_by: [] };
    const m = /\/work-items\/([0-9a-f-]{36})\/(comments\/)?/.exec(url);
    if (m && m[2]) return { results: comentarios.get(m[1]) ?? [], next_page_results: false };
    if (m) { const c = cards.find(x => x.id === m[1]); return { id: c.id, updated_at: c.updated_at, name: c.name, description_html: c.description_html, labels: c.labels, state: c.state }; }
    throw Error(url);
  };
  const escritas = [];
  const falhas = { estado: false };
  const comentar = (cartaId, html) => { const id = randomUUID(); comentarios.get(cartaId).push({ id, actor: AUTOR, created_at: bump(), comment_html: html }); cards.find(c => c.id === cartaId).updated_at = bump(); return id; };
  const identidadesEscrita = { [PROJETO]: { autorEscrita: AUTOR,
    escritorHandoff: async ({ cartaId, html }) => { escritas.push('handoff'); return comentar(cartaId, html); },
    escritorGate: async ({ cartaId, gate, html, remover }) => {
      escritas.push(`gate:${remover ? `${remover}->` : ''}${gate}`);
      const c = cards.find(x => x.id === cartaId);
      c.labels = [...c.labels.filter(l => l.name !== remover), { id: `label-${gate}`, name: gate }];
      return { comentarioId: comentar(cartaId, html) };
    },
    escritorEstado: async ({ cartaId, grupo, removerEtiqueta }) => {
      if (falhas.estado) throw new Error('Plane recusou o PATCH de estado (HTTP 502)');
      escritas.push(`estado:${grupo}${removerEtiqueta ? `-${removerEtiqueta}` : ''}`);
      const c = cards.find(x => x.id === cartaId);
      c.state = grupo === 'started' ? { name: 'In Progress', group: 'started' } : { name: 'Done', group: 'completed' };
      if (removerEtiqueta) c.labels = c.labels.filter(l => l.name !== removerEtiqueta);
      c.updated_at = bump();
      return { estadoId: 'x', estadoNome: c.state.name, versaoCarta: c.updated_at };
    } } };
  let execucoes = 0;
  let validacoes = 0;
  const executor = { validar: async () => { validacoes++; if (aoValidar) await aoValidar(validacoes, raiz); }, executar: async (...args) => { execucoes++; return executar(...args); } };
  if (frota) await gravarFrota(path.join(raiz, 'estado'), frota);
  const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado'), agora: relogio });
  const servico = criarServicoOrquestracao({ consultar, raiz, estado, identidadesEscrita, executor, execucaoHabilitada: true, agora: relogio });
  const vigilia = criarVigilia({ servico, diretorioEstado: path.join(raiz, 'estado'), agora: relogio,
    projetos: [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }] });
  return { raiz, cards, novaCarta, escritas, falhas, servico, vigilia, estado, comentarios, execucoes: () => execucoes, limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}
const ok = async () => ({ resultado: 'concluido', resumo: 'Tudo certo com a tentativa.', evidencia: ['comando testes: código 0', 'VEREDITO: APROVADO'] });

test('desligada não despacha; ligar exige executor disponível; o estado persiste em disco', async () => {
  let chamadas = 0;
  const a = await ambiente({ executar: async () => { chamadas++; return ok(); } });
  try {
    a.novaCarta(1);
    assert.deepEqual(await a.vigilia.varrer(), []);
    assert.equal(chamadas, 0);
    const antes = await a.vigilia.estadoDaVigilia();
    assert.equal(antes.projetos[0].ligada, false);
    assert.deepEqual(antes.projetos[0].impedimentos, []);
    await a.vigilia.alternar(PROJETO, true, '1');
    const outra = criarVigilia({ servico: a.servico, diretorioEstado: path.join(a.raiz, 'estado'), projetos: [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }] });
    assert.equal((await outra.estadoDaVigilia()).projetos[0].ligada, true, 'toggle sobrevive a reinício');
    const semExecutor = criarServicoOrquestracao({ consultar: async () => { throw Error('x'); }, raiz: a.raiz, estado: a.estado, identidadesEscrita: {} });
    const desligada = criarVigilia({ servico: semExecutor, diretorioEstado: path.join(a.raiz, 'estado2'), projetos: [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }] });
    await assert.rejects(desligada.validarAlternancia(PROJETO, true), /executor desligado/);
  } finally { await a.limpar(); }
});

test('ligada: carta DEV em Todo vai a In Progress, é despachada com a frota e avança para READY TO TEST com recibo; nenhum PERFIL-IA (J10)', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const c = a.novaCarta(1);
    await a.vigilia.alternar(PROJETO, true, '1');
    const [r] = await a.vigilia.varrer();
    assert.equal(r.ultimaTentativa.resultado, 'concluido', JSON.stringify(r));
    assert.deepEqual(a.escritas, ['estado:started', 'handoff', 'handoff', 'gate:READY TO DEV->READY TO TEST']);
    assert.equal([...a.comentarios.values()].flat().filter(x => /PERFIL-IA/.test(x.comment_html)).length, 0, 'a vigília não grava perfil em carta nenhuma');
    const atual = a.cards.find(x => x.id === c.id);
    assert.deepEqual(atual.labels.map(l => l.name), ['READY TO TEST']);
    assert.equal(atual.state.group, 'started');
    const item = (await a.servico.fila()).itens.find(x => x.id === c.id);
    assert.equal(item.gate, 'READY TO TEST');
    assert.equal(item.provenienciaGate, 'verificada', 'o recibo da troca vale como proveniência do novo gate');
    assert.equal(item.elegivel, true);
    const diario = (await a.vigilia.estadoDaVigilia()).projetos[0].diario.map(e => e.tipo);
    assert.deepEqual(diario, ['AVANCO', 'TENTATIVA', 'ESTADO', 'LIGADA']);
    assert.equal((await a.vigilia.estadoDaVigilia()).projetos[0].diario.find(e => e.tipo === 'TENTATIVA').frotaVersao, 1);
    // Segunda varredura: a mesma carta, agora em READY TO TEST, é testada e vai a Done.
    const [s] = await a.vigilia.varrer();
    assert.equal(s.ultimaTentativa.resultado, 'concluido');
    assert.equal(a.escritas.at(-1), 'estado:completed-READY TO TEST');
    assert.equal(a.cards.find(x => x.id === c.id).state.group, 'completed');
    assert.equal((await a.vigilia.varrer())[0].motivoOciosa, 'nenhuma carta elegível');
  } finally { await a.limpar(); }
});

test('uma tentativa por vez: lease ativo em outra carta do projeto segura a varredura', async () => {
  let liberar;
  const a = await ambiente({ executar: async () => { await new Promise(r => { liberar = r; }); return ok(); } });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' }); a.novaCarta(2, { grupo: 'started', nome: 'In Progress' });
    await a.vigilia.alternar(PROJETO, true, '1');
    const primeira = a.vigilia.varrer();
    for (let i = 0; i < 400 && !liberar; i++) await new Promise(r => setTimeout(r, 5));
    if (!liberar) assert.fail(`executor não foi alcançado: ${JSON.stringify(await primeira)}`);
    const segunda = criarVigilia({ servico: a.servico, diretorioEstado: path.join(a.raiz, 'estado'), projetos: [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }] });
    const [bloqueada] = await segunda.varrer();
    assert.equal(bloqueada.motivoOciosa, 'tentativa em curso (lease ativo)');
    liberar();
    const [fim] = await primeira;
    assert.equal(fim.ultimaTentativa.resultado, 'concluido');
    assert.equal((await a.vigilia.estadoDaVigilia()).projetos[0].diario.filter(e => e.tipo === 'TENTATIVA').length, 1);
  } finally { await a.limpar(); }
});

test('duas rejeições esgotam a carta; o teto diário segura e volta depois de 24 h; limite de uso pausa o provedor e não gasta tentativa (J6)', async () => {
  let tempo = Date.parse('2026-10-24T10:00:00Z');
  let modo = 'rejeitar';
  const a = await ambiente({ agora: () => tempo, executar: async () => modo === 'rejeitar'
    ? { resultado: 'rejeitado', resumo: 'Comando falhou nesta tentativa.', evidencia: ['comando testes: código 1'] }
    : modo === 'limite' ? { resultado: 'impedido', causa: { tipo: 'limite', provedor: 'claude' }, resumo: 'Tentativa impedida: limite de uso do provedor claude no papel orquestracao.', evidencia: ['limite de uso do provedor claude'] }
      : ok() });
  try {
    const c1 = a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    a.novaCarta(2, { grupo: 'started', nome: 'In Progress' });
    await a.vigilia.alternar(PROJETO, true, '1');
    assert.equal((await a.vigilia.varrer())[0].ultimaTentativa.resultado, 'rejeitado');
    assert.equal((await a.vigilia.varrer())[0].ultimaTentativa.resultado, 'rejeitado');
    let tipos = (await a.vigilia.estadoDaVigilia()).projetos[0].diario.map(e => e.tipo);
    assert.equal(tipos.filter(t => t === 'ESGOTADA').length, 1, 'carta 1 esgotada após 2 tentativas');
    assert.equal((await a.servico.fila()).itens.find(x => x.id === c1.id).historico.filter(e => e.tipo === 'TENTATIVA').length, 2);
    // Terceira tentativa do dia vai para a carta 2; a quarta bate no teto (3/dia).
    const terceira = await a.vigilia.varrer();
    assert.equal(terceira[0].proximaCarta, 'PAINEL-2');
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /teto diário atingido \(3\/3\)/);
    tempo += 24 * 60 * 60_000 + 1000;
    modo = 'limite';
    const [pausa] = await a.vigilia.varrer();
    assert.match(pausa.motivoOciosa, /frota pausada até .*limite de uso de claude/);
    const estadoPausa = await a.vigilia.estadoDaVigilia();
    assert.ok(Date.parse(estadoPausa.pausasFrota.provedores.claude.ate) > tempo, 'a pausa é do provedor, para todos os projetos');
    assert.equal('pausadaAte' in estadoPausa.projetos[0], false, 'a pausa por projeto saiu (J-L6)');
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /provedor claude pausado até/);
    tempo += 61 * 60_000;
    modo = 'ok';
    const [depois] = await a.vigilia.varrer();
    // Reescrito na F2: o limite de uso não gasta tentativa da carta (J6); a carta 2 tinha 1 e roda de novo.
    assert.equal(depois.proximaCarta, 'PAINEL-2');
    assert.equal(depois.ultimaTentativa.resultado, 'concluido');
  } finally { await a.limpar(); }
});

test('J6: impedido de CLI pausa a versão da frota sem gastar tentativa; outra versão retoma', async () => {
  let modo = 'rejeitar';
  const a = await ambiente({ executar: async () => modo === 'cli'
    ? { resultado: 'impedido', causa: { tipo: 'cli', provedor: 'openai' }, resumo: 'CLI codex do papel codificacao_testes terminou sem resposta.', evidencia: ['codex: código 1'] }
    : modo === 'rejeitar' ? { resultado: 'rejeitado', resumo: 'Comando falhou nesta tentativa.', evidencia: ['comando testes: código 1'] }
      : ok() });
  try {
    const c = a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await a.vigilia.alternar(PROJETO, true, '1');
    assert.equal((await a.vigilia.varrer())[0].ultimaTentativa.resultado, 'rejeitado');
    modo = 'cli';
    const [r] = await a.vigilia.varrer();
    assert.equal(r.ultimaTentativa.resultado, 'impedido');
    assert.match(r.motivoOciosa, /frota v1 pausada: CLI ou modelo impedido/);
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota v1 pausada/);
    assert.equal(a.execucoes(), 2, 'a frota pausada não despacha de novo');
    await gravarFrota(path.join(a.raiz, 'estado'), FROTA);
    modo = 'ok';
    // Teto de 2 por carta: a rejeição contou, o impedido de CLI não; sobra uma tentativa.
    const [retomada] = await a.vigilia.varrer();
    assert.equal(retomada.ultimaTentativa?.resultado, 'concluido', JSON.stringify(retomada));
    const item = (await a.servico.fila()).itens.find(x => x.id === c.id);
    assert.equal(item.historico.filter(e => e.tipo === 'TENTATIVA').length, 3);
  } finally { await a.limpar(); }
});

test('J-A: pausa ou frota trocada antes da reserva — a vigília não escreve no Plane nem reserva', async () => {
  for (const [nome, mexer, motivo] of [
    ['pausa do provedor', raiz => new PausasFrota({ diretorio: path.join(raiz, 'estado') }).pausarProvedor('claude', 30, 'limite de uso do provedor'), /provedor claude pausado/],
    ['frota trocada', raiz => gravarFrota(path.join(raiz, 'estado'), conteudoFrota({ orquestracao: tupla('claude', 'high'), codificacao_testes: tupla('openai'), validacao: tupla('claude') })), /frota mudou antes da reserva/],
  ]) {
    const a = await ambiente({ executar: ok, aoValidar: async (n, raiz) => { if (n === 1) await mexer(raiz); } });
    try {
      const c = a.novaCarta(1);
      await a.vigilia.alternar(PROJETO, true, '1');
      const [r] = await a.vigilia.varrer();
      assert.match(r.erro ?? r.motivoOciosa ?? '', motivo, `${nome}: ${JSON.stringify(r)}`);
      assert.deepEqual(a.escritas, [], `${nome}: nada escrito no Plane (a carta não foi a In Progress)`);
      assert.equal(a.cards.find(x => x.id === c.id).state.group, 'unstarted');
      assert.equal(await a.estado.lerLease(c.id), null, `${nome}: sem lease`);
      assert.equal(a.execucoes(), 0);
    } finally { await a.limpar(); }
  }
});

test('J-E: frota que pede provedor desligado no contrato não deixa ligar nem prende a vigília em laço', async () => {
  const soClaude = { ...contratoBase, agentes: [contratoBase.agentes[0], { ...contratoBase.agentes[1], disponivel: false }] };
  const a = await ambiente({ executar: ok, contrato: soClaude });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await assert.rejects(a.vigilia.validarAlternancia(PROJETO, true), /frota pede openai que o contrato desligou/);
    const item = (await a.servico.fila()).itens[0];
    assert.equal(item.elegivel, false);
    assert.match(item.motivos.join(' '), /frota pede openai que o contrato desligou/);
  } finally { await a.limpar(); }
});

test('J-D: impedido da carta cujo resumo cita "429" não pausa nada e conta tentativa', async () => {
  const a = await ambiente({ executar: async () => ({ resultado: 'impedido', causa: { tipo: 'carta', provedor: 'claude' },
    resumo: 'Tentativa impedida: o modelo escreveu "HTTP 429 too many requests, usage limit" ao citar o log do app.', evidencia: ['rate limit no texto do modelo'] }) });
  try {
    const c = a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await a.vigilia.alternar(PROJETO, true, '1');
    const [r] = await a.vigilia.varrer();
    assert.equal(r.ultimaTentativa.resultado, 'impedido');
    assert.equal(r.motivoOciosa ?? null, null, JSON.stringify(r));
    const estado = await a.vigilia.estadoDaVigilia();
    assert.deepEqual(estado.pausasFrota.provedores, {}, 'nenhum provedor pausado');
    assert.equal(estado.pausasFrota.versao, null);
    assert.equal(await a.vigilia.estadoDaVigilia().then(e => e.projetos[0].tentativasHoje), 1, 'falha da carta conta no teto');
    assert.equal((await a.servico.fila()).itens.find(x => x.id === c.id).historico.filter(e => e.tipo === 'TENTATIVA').length, 1);
  } finally { await a.limpar(); }
});

test('N3: falha no PATCH de estado depois da reserva vira SEM_INICIO no diário (causa infra) e não gasta tentativa da carta', async () => {
  const a = await ambiente({ executar: ok, contrato: { ...contratoBase, vigilia: { ...contratoBase.vigilia, maxTentativasPorCarta: 1 } } });
  try {
    const c = a.novaCarta(1);
    await a.vigilia.alternar(PROJETO, true, '1');
    a.falhas.estado = true;
    const [r] = await a.vigilia.varrer();
    assert.match(r.motivoOciosa, /PAINEL-1: tentativa sem início \(Plane recusou o PATCH/);
    const diario = (await a.vigilia.estadoDaVigilia()).projetos[0].diario;
    const t = diario.find(e => e.tipo === 'TENTATIVA');
    assert.equal(t.resultado, 'SEM_INICIO');
    assert.equal(t.causa, 'infra');
    assert.match(t.motivo, /PATCH de estado/);
    assert.equal(a.execucoes(), 0);
    assert.equal(await a.estado.lerLease(c.id), null);
    a.falhas.estado = false;
    const [depois] = await a.vigilia.varrer();
    assert.equal(depois.ultimaTentativa?.resultado, 'concluido', `a única tentativa da carta continua disponível: ${JSON.stringify(depois)}`);
  } finally { await a.limpar(); }
});

test('J-L1: tentativa parada pela frota não conta para o teto diário', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vig-teto-'));
  const livro = new DiarioVigilia({ diretorio: dir, agora: () => Date.parse('2026-10-29T12:00:00Z') });
  await livro.anotar('p', { tipo: 'TENTATIVA', resultado: 'impedido', causa: 'cli' });
  await livro.anotar('p', { tipo: 'TENTATIVA', resultado: 'impedido', causa: 'limite' });
  await livro.anotar('p', { tipo: 'TENTATIVA', resultado: 'impedido', causa: 'carta' });
  await livro.anotar('p', { tipo: 'TENTATIVA', resultado: 'rejeitado' });
  assert.equal(await livro.tentativas24h('p'), 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('J5: sem frota válida a vigília não liga e, ligada, não despacha — sem cair para o perfilPadrao do contrato', async () => {
  const a = await ambiente({ executar: ok, frota: null });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await assert.rejects(a.vigilia.validarAlternancia(PROJETO, true), /frota ausente/);
    // Ligada antes de a frota estragar: a varredura para e diz por quê.
    await gravarFrota(path.join(a.raiz, 'estado'), FROTA);
    await a.vigilia.alternar(PROJETO, true, '1');
    for (const [estado, conteudo] of [['ilegivel', '{ quebrado'], ['invalida', JSON.stringify({ formato: 'frota/v1' })]]) {
      await fs.writeFile(path.join(a.raiz, 'estado', 'frota.json'), conteudo);
      const [r] = await a.vigilia.varrer();
      assert.match(r.motivoOciosa, new RegExp(`frota ${estado}: nenhuma vigília`));
      assert.match((await a.vigilia.estadoDaVigilia()).projetos[0].impedimentos.join(' '), new RegExp(`frota ${estado}`));
    }
    await fs.rm(path.join(a.raiz, 'estado', 'frota.json'));
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota ausente/);
    assert.equal(a.execucoes(), 0);
    assert.deepEqual(a.escritas, []);
  } finally { await a.limpar(); }
});

test('API: preparar/confirmar exige sessão, payload fixo, e confirma a alternância; recusa vira 422 sem gravar', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const confirmacoes = criarConfirmacoesVigilia({ vigilia: a.vigilia });
    let leituras = 0;
    const negada = criarApiVigilia({ autorizar: async () => { throw new ErroAcesso('sem sessão', 401); }, confirmacoes });
    assert.equal((await negada({ method: 'POST' }, '/api/orquestracao/vigilia/preparar', async () => { leituras++; return '{}'; })).status, 401);
    assert.equal(leituras, 0);
    const api = criarApiVigilia({ autorizar: async () => identidade, confirmacoes });
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/vigilia/preparar', async () => JSON.stringify({ projeto: PROJETO, ligar: true, extra: 1 }))).status, 422);
    const p = await api({ method: 'POST' }, '/api/orquestracao/vigilia/preparar', async () => JSON.stringify({ projeto: PROJETO, ligar: true }));
    assert.equal(p.status, 200); assert.equal(p.corpo.ligar, true); assert.match(p.corpo.aviso, /sem nova confirmação/);
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/vigilia/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId, ligar: false }))).status, 422);
    const c = await api({ method: 'POST' }, '/api/orquestracao/vigilia/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId }));
    assert.equal(c.status, 200); assert.equal(c.corpo.ligada, true);
    assert.equal((await a.vigilia.estadoDaVigilia()).projetos[0].ligadaPor, '1');
    const outra = criarApiVigilia({ autorizar: async () => ({ usuarioId: '2', sessaoHash: 'b'.repeat(64) }), confirmacoes });
    assert.equal((await outra({ method: 'POST' }, '/api/orquestracao/vigilia/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId }))).status, 403);
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/vigilia/preparar', async () => JSON.stringify({ projeto: randomUUID(), ligar: true }))).status, 422);
  } finally { await a.limpar(); }
});

test('escritor de estado acha o estado pelo grupo, confere versão, aplica, tira a etiqueta e verifica', async () => {
  const cartaId = randomUUID();
  const chamadas = [];
  const TODO = randomUUID(); const DONE = randomUUID(); const IP = randomUUID();
  let estado = TODO;
  let labels = [{ id: 'l1', name: 'READY TO TEST' }, { id: 'l2', name: 'EMPÍRICA' }];
  const escritor = criarEscritorEstadoPlane({ chave: 'k', projetoPermitido: PROJETO, autorEsperado: AUTOR, apiBase: 'http://plane.falso',
    fetchImpl: async (url, opcoes = {}) => {
      chamadas.push(`${opcoes.method ?? 'GET'} ${url.split('/projects/')[1]}`);
      const json = corpo => ({ ok: true, status: 200, json: async () => corpo });
      if (url.endsWith('/states/?per_page=100')) return json({ results: [{ id: TODO, name: 'Todo', group: 'unstarted' }, { id: DONE, name: 'Done', group: 'completed' }, { id: IP, name: 'In Progress', group: 'started' }] });
      if (url.endsWith(`/work-items/${cartaId}/?expand=labels`)) return json({ id: cartaId, updated_at: 'v1', state: estado, labels });
      if (opcoes.method === 'PATCH') { const corpo = JSON.parse(opcoes.body); estado = corpo.state; if (corpo.labels) labels = labels.filter(l => corpo.labels.includes(l.id)); return json({ id: cartaId }); }
      throw Error(url);
    } });
  const r = await escritor({ projetoId: PROJETO, cartaId, grupo: 'completed', versaoCarta: 'v1', removerEtiqueta: 'READY TO TEST' });
  assert.equal(r.estadoNome, 'Done');
  assert.deepEqual(labels.map(l => l.name), ['EMPÍRICA']);
  assert.equal(chamadas.filter(c => c.startsWith('PATCH')).length, 1);
  await assert.rejects(escritor({ projetoId: PROJETO, cartaId, grupo: 'started', versaoCarta: 'v0' }), /carta mudou/);
  await assert.rejects(escritor({ projetoId: randomUUID(), cartaId, grupo: 'started', versaoCarta: 'v1' }), /fora do escopo/);
});
