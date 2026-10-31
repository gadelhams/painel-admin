// Vigília com Plane, escritores e executor falsos: freios, avanço de gate/estado e, desde a
// F3, o play por nave no lugar do toggle (J11–J14, J66). Nenhuma CLI, rede ou Plane real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { codificarGate } from '../orquestrador/gate-plane.js';
import { atividadesDoCaminhoFeliz } from './fixtures/recibo-gate.js';
import { criarVigilia } from '../orquestrador/vigilia.js';
import { PlayHangar } from '../orquestrador/play.js';
import { criarConfirmacoesPlay, criarApiPlay } from '../orquestrador/api-play.js';
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
    if (gate && recibo) comentarios.get(id).push({ id: randomUUID(), actor: AUTOR, created_at: c.updated_at, external_source: 'orquestrador-gate-v1', edited_at: null,
      comment_html: codificarGate({ projetoId: PROJETO, cartaId: id, chaveIdempotencia: randomUUID(), versaoCarta: c.updated_at,
        gate, justificativa: 'Escopo e dependências revisados.', evidencias: ['Sem dependências formais, declarado na carta.'] }) });
    return c;
  }
  const consultar = async url => {
    if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
    if (url.includes('/work-items/?')) return { results: cards.map(c => ({ ...c })) };
    if (url.includes('/relations/')) return { blocked_by: [] };
    const atv = /\/work-items\/([0-9a-f-]{36})\/activities\//.exec(url);
    if (atv) { const c = cards.find(x => x.id === atv[1]); return atividadesDoCaminhoFeliz(c, comentarios.get(c.id) ?? [], AUTOR); }
    const m = /\/work-items\/([0-9a-f-]{36})\/(comments\/)?/.exec(url);
    if (m && m[2]) return { results: comentarios.get(m[1]) ?? [], next_page_results: false };
    if (m) { const c = cards.find(x => x.id === m[1]); return { id: c.id, updated_at: c.updated_at, name: c.name, description_html: c.description_html, labels: c.labels, state: c.state }; }
    throw Error(url);
  };
  const escritas = [];
  const falhas = { estado: false };
  const comentar = (cartaId, html) => { const id = randomUUID(); comentarios.get(cartaId).push({ id, actor: AUTOR, created_at: bump(), comment_html: html,
    external_source: html.includes('GATE/v1 ') ? 'orquestrador-gate-v1' : 'orquestrador-handoff-v1', edited_at: null }); cards.find(c => c.id === cartaId).updated_at = bump(); return id; };
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
  const projetos = [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }];
  const play = new PlayHangar({ diretorio: path.join(raiz, 'estado'), comTrava: estado.comTrava, projetos, agora: relogio });
  const vigilia = criarVigilia({ servico, play, diretorioEstado: path.join(raiz, 'estado'), agora: relogio, projetos });
  const livro = new DiarioVigilia({ diretorio: path.join(raiz, 'estado'), agora: relogio });
  return { raiz, cards, novaCarta, escritas, falhas, servico, vigilia, play, projetos, estado, comentarios, execucoes: () => execucoes,
    diario: async () => (await livro.linhas(PROJETO)).slice(-20).reverse(), tentativasHoje: () => livro.tentativas24h(PROJETO),
    pausas: () => new PausasFrota({ diretorio: path.join(raiz, 'estado'), agora: relogio }).ler(),
    limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}
const ok = async () => ({ resultado: 'concluido', resumo: 'Tudo certo com a tentativa.', evidencia: ['comando testes: código 0', 'VEREDITO: APROVADO'] });

test('J11/J12: play desligado não despacha; ligado persiste em disco; ilegível conta como desligado; sem executor fica ocioso com o motivo', async () => {
  let chamadas = 0;
  const a = await ambiente({ executar: async () => { chamadas++; return ok(); } });
  try {
    a.novaCarta(1);
    assert.deepEqual(await a.vigilia.varrer(), []);
    assert.equal(chamadas, 0);
    await a.play.alternar(PROJETO, true, '1');
    const outro = new PlayHangar({ diretorio: path.join(a.raiz, 'estado'), comTrava: a.estado.comTrava, projetos: a.projetos });
    assert.equal(await outro.ligado(PROJETO), true, 'o play sobrevive a reinício');
    await fs.writeFile(path.join(a.raiz, 'estado', 'play.json'), '{ quebrado');
    assert.equal(await outro.ligado(PROJETO), false, 'play ilegível = desligado (J12)');
    const tela = await outro.estado();
    assert.equal(tela.legivel, false);
    assert.match(tela.observacao, /play ilegível/);
    assert.deepEqual(await a.vigilia.varrer(), [], 'ilegível não despacha');
    assert.equal(chamadas, 0);
    await a.play.alternar(PROJETO, true, '1');
    const semExecutor = criarServicoOrquestracao({ consultar: async () => { throw Error('x'); }, raiz: a.raiz, estado: a.estado, identidadesEscrita: {} });
    const vig = criarVigilia({ servico: semExecutor, play: a.play, diretorioEstado: path.join(a.raiz, 'estado'), projetos: a.projetos });
    const [r] = await vig.varrer();
    assert.match(r.motivoOciosa, /executor desligado/);
  } finally { await a.limpar(); }
});

test('ligada: carta DEV em Todo vai a In Progress, é despachada com a frota e avança para READY TO TEST com recibo; nenhum PERFIL-IA (J10)', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const c = a.novaCarta(1);
    await a.play.alternar(PROJETO, true, '1');
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
    const diario = (await a.diario()).map(e => e.tipo);
    assert.deepEqual(diario, ['AVANCO', 'TENTATIVA', 'ESTADO'], 'ligar é do play: o diário da vigília só tem a tentativa');
    assert.equal((await a.diario()).find(e => e.tipo === 'TENTATIVA').frotaVersao, 1);
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
    await a.play.alternar(PROJETO, true, '1');
    const primeira = a.vigilia.varrer();
    for (let i = 0; i < 400 && !liberar; i++) await new Promise(r => setTimeout(r, 5));
    if (!liberar) assert.fail(`executor não foi alcançado: ${JSON.stringify(await primeira)}`);
    const segunda = criarVigilia({ servico: a.servico, play: a.play, diretorioEstado: path.join(a.raiz, 'estado'), projetos: a.projetos });
    const [bloqueada] = await segunda.varrer();
    assert.equal(bloqueada.motivoOciosa, 'tentativa em curso (lease ativo)');
    liberar();
    const [fim] = await primeira;
    assert.equal(fim.ultimaTentativa.resultado, 'concluido');
    assert.equal((await a.diario()).filter(e => e.tipo === 'TENTATIVA').length, 1);
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
    await a.play.alternar(PROJETO, true, '1');
    assert.equal((await a.vigilia.varrer())[0].ultimaTentativa.resultado, 'rejeitado');
    assert.equal((await a.vigilia.varrer())[0].ultimaTentativa.resultado, 'rejeitado');
    let tipos = (await a.diario()).map(e => e.tipo);
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
    const pausasAgora = await a.pausas();
    assert.ok(Date.parse(pausasAgora.provedores.claude.ate) > tempo, 'a pausa é do provedor, para todos os projetos');
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
    await a.play.alternar(PROJETO, true, '1');
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
      await a.play.alternar(PROJETO, true, '1');
      const [r] = await a.vigilia.varrer();
      assert.match(r.erro ?? r.motivoOciosa ?? '', motivo, `${nome}: ${JSON.stringify(r)}`);
      assert.deepEqual(a.escritas, [], `${nome}: nada escrito no Plane (a carta não foi a In Progress)`);
      assert.equal(a.cards.find(x => x.id === c.id).state.group, 'unstarted');
      assert.equal(await a.estado.lerLease(c.id), null, `${nome}: sem lease`);
      assert.equal(a.execucoes(), 0);
    } finally { await a.limpar(); }
  }
});

test('J-E: frota que pede provedor desligado no contrato não despacha nem prende a vigília em laço', async () => {
  const soClaude = { ...contratoBase, agentes: [contratoBase.agentes[0], { ...contratoBase.agentes[1], disponivel: false }] };
  const a = await ambiente({ executar: ok, contrato: soClaude });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await a.play.alternar(PROJETO, true, '1');
    assert.equal((await a.vigilia.varrer())[0].motivoOciosa, 'nenhuma carta elegível');
    assert.equal(a.execucoes(), 0);
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
    await a.play.alternar(PROJETO, true, '1');
    const [r] = await a.vigilia.varrer();
    assert.equal(r.ultimaTentativa.resultado, 'impedido');
    assert.equal(r.motivoOciosa ?? null, null, JSON.stringify(r));
    const pausas = await a.pausas();
    assert.deepEqual(pausas.provedores, {}, 'nenhum provedor pausado');
    assert.equal(pausas.versao, null);
    assert.equal(await a.tentativasHoje(), 1, 'falha da carta conta no teto');
    assert.equal((await a.servico.fila()).itens.find(x => x.id === c.id).historico.filter(e => e.tipo === 'TENTATIVA').length, 1);
  } finally { await a.limpar(); }
});

test('N3: falha no PATCH de estado depois da reserva vira SEM_INICIO no diário (causa infra) e não gasta tentativa da carta', async () => {
  const a = await ambiente({ executar: ok, contrato: { ...contratoBase, vigilia: { ...contratoBase.vigilia, maxTentativasPorCarta: 1 } } });
  try {
    const c = a.novaCarta(1);
    await a.play.alternar(PROJETO, true, '1');
    a.falhas.estado = true;
    const [r] = await a.vigilia.varrer();
    assert.match(r.motivoOciosa, /PAINEL-1: tentativa sem início \(Plane recusou o PATCH/);
    const diario = (await a.diario());
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

test('J5: sem frota válida a vigília não despacha, com o play ligado — sem cair para o perfilPadrao do contrato', async () => {
  const a = await ambiente({ executar: ok, frota: null });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await a.play.alternar(PROJETO, true, '1');
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota ausente/);
    // Ligada antes de a frota estragar: a varredura para e diz por quê.
    await gravarFrota(path.join(a.raiz, 'estado'), FROTA);
    await a.play.alternar(PROJETO, true, '1');
    for (const [estado, conteudo] of [['ilegivel', '{ quebrado'], ['invalida', JSON.stringify({ formato: 'frota/v1' })]]) {
      await fs.writeFile(path.join(a.raiz, 'estado', 'frota.json'), conteudo);
      const [r] = await a.vigilia.varrer();
      assert.match(r.motivoOciosa, new RegExp(`frota ${estado}: nenhuma vigília`));
    }
    await fs.rm(path.join(a.raiz, 'estado', 'frota.json'));
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota ausente/);
    assert.equal(a.execucoes(), 0);
    assert.deepEqual(a.escritas, []);
  } finally { await a.limpar(); }
});

test('API do play: preparar/confirmar exige sessão e payload fixo; confirma sob a trava; o GET não diz quem ligou (J73); fora do play vira 422', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const confirmacoes = criarConfirmacoesPlay({ play: a.play, atividade: async () => 'job do zelador (cli)' });
    let leituras = 0;
    const negada = criarApiPlay({ autorizar: async () => { throw new ErroAcesso('sem sessão', 401); }, confirmacoes });
    assert.equal((await negada({ method: 'POST' }, '/api/orquestracao/play/preparar', async () => { leituras++; return '{}'; })).status, 401);
    assert.equal(leituras, 0);
    const api = criarApiPlay({ autorizar: async () => identidade, confirmacoes });
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/play/preparar', async () => JSON.stringify({ projeto: PROJETO, ligar: true, extra: 1 }))).status, 422);
    const p = await api({ method: 'POST' }, '/api/orquestracao/play/preparar', async () => JSON.stringify({ projeto: PROJETO, ligar: true }));
    assert.equal(p.status, 200); assert.equal(p.corpo.ligar, true); assert.match(p.corpo.aviso, /sem nova confirmação/);
    assert.equal(await a.play.ligado(PROJETO), false, 'preparar não grava');
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/play/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId, ligar: false }))).status, 422);
    const c = await api({ method: 'POST' }, '/api/orquestracao/play/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId }));
    assert.equal(c.status, 200); assert.equal(c.corpo.situacao, 'ligado');
    const tela = await a.play.estado();
    assert.equal(tela.projetos[0].situacao, 'ligado');
    assert.equal(JSON.stringify(tela).includes('usuarioId'), false, 'o GET aberto não devolve quem ligou');
    const outra = criarApiPlay({ autorizar: async () => ({ usuarioId: '2', sessaoHash: 'b'.repeat(64) }), confirmacoes });
    assert.equal((await outra({ method: 'POST' }, '/api/orquestracao/play/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId }))).status, 403);
    assert.equal((await api({ method: 'POST' }, '/api/orquestracao/play/preparar', async () => JSON.stringify({ projeto: randomUUID(), ligar: true }))).status, 422);
    const d = await api({ method: 'POST' }, '/api/orquestracao/play/preparar', async () => JSON.stringify({ projeto: PROJETO, ligar: false }));
    assert.match(d.corpo.aviso, /Em curso: job do zelador \(cli\)/, 'o desligar diz o que está rodando (J66)');
  } finally { await a.limpar(); }
});

test('J66: play desligado entre a escolha da carta e a reserva — nada reservado nem escrito no Plane', async () => {
  let a;
  a = await ambiente({ executar: ok, aoValidar: async (n) => { if (n === 1) await a.play.alternar(PROJETO, false, '1'); } });
  try {
    const c = a.novaCarta(1);
    await a.play.alternar(PROJETO, true, '1');
    const [r] = await a.vigilia.varrer();
    assert.match(r.motivoOciosa ?? '', /play desligado antes da reserva/, JSON.stringify(r));
    assert.deepEqual(a.escritas, []);
    assert.equal(await a.estado.lerLease(c.id), null);
    assert.equal(a.execucoes(), 0);
  } finally { await a.limpar(); }
});

test('J66: suspenso por divergência é gravado, distinto de desligado, não despacha e só sai religando', async () => {
  const a = await ambiente({ executar: ok });
  try {
    a.novaCarta(1);
    await a.play.alternar(PROJETO, true, '1');
    await a.play.suspender(PROJETO, 'divergência na verificação de PAINEL-1');
    const tela = await a.play.estado();
    assert.equal(tela.projetos[0].situacao, 'suspenso');
    assert.match(tela.projetos[0].suspenso.motivo, /divergência/);
    assert.deepEqual(await a.vigilia.varrer(), []);
    await a.play.alternar(PROJETO, true, '1');
    assert.equal((await a.play.estado()).projetos[0].situacao, 'ligado');
  } finally { await a.limpar(); }
});

test('J13/P2: a migração renomeia o toggle antigo (ilegível também), anota, não liga nada, roda uma vez e o .jsonl fica para o teto', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const pasta = path.join(a.raiz, 'estado', 'vigilia');
    await fs.mkdir(pasta, { recursive: true });
    const outro = randomUUID();
    await fs.writeFile(path.join(pasta, `${PROJETO}.json`), JSON.stringify({ ligada: true, ligadaPor: '1' }));
    await fs.writeFile(path.join(pasta, `${outro}.json`), '{ ruim');
    await fs.writeFile(path.join(pasta, `${PROJETO}.jsonl`), `${JSON.stringify({ quando: '2026-10-24T09:00:00Z', tipo: 'TENTATIVA', resultado: 'rejeitado' })}\n`);
    const r = await a.play.migrar();
    assert.equal(r.feita, true);
    assert.deepEqual(r.migrados.map(m => m.estavaLigada).sort(), [true, 'ilegivel'].sort());
    assert.equal(await a.play.ligado(PROJETO), false, 'nada é ligado sozinho');
    const nomes = (await fs.readdir(pasta)).sort();
    assert.ok(nomes.includes(`${PROJETO}.json.migrado-2026-10-24`) && nomes.includes(`${PROJETO}.jsonl`), nomes.join(', '));
    assert.equal(nomes.some(n => n.endsWith('.json')), false, 'nenhum toggle antigo fica legível');
    assert.equal(await a.tentativasHoje(), 1, 'o diário antigo continua no teto diário');
    assert.equal((await a.play.migrar()).feita, false, 'arquivo-marca: só uma vez');
    const historico = await fs.readFile(path.join(a.raiz, 'estado', 'play-historico.jsonl'), 'utf8');
    assert.equal(historico.trim().split('\n').filter(l => l.includes('MIGRACAO_VIGILIA')).length, 2);
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

test('R1: carta parada duas vezes pela frota em 24 h sai da varredura até a janela passar; outra carta segue', async () => {
  let tempo = Date.parse('2026-10-24T10:00:00Z');
  let modo = 'limite';
  const a = await ambiente({ agora: () => tempo, executar: async () => modo === 'limite'
    ? { resultado: 'impedido', causa: { tipo: 'limite', provedor: 'claude' }, resumo: 'limite de uso', evidencia: ['limite de uso do provedor claude'] }
    : ok() });
  try {
    a.novaCarta(1, { grupo: 'started', nome: 'In Progress' });
    await a.play.alternar(PROJETO, true, '1');
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota pausada até/);
    tempo += 61 * 60_000;
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /frota pausada até/);
    tempo += 61 * 60_000;
    const [presa] = await a.vigilia.varrer();
    assert.match(presa.motivoOciosa, /PAINEL-1: parada 2 vezes pela frota em 24 h/);
    assert.equal(a.execucoes(), 2, 'a terceira volta não despacha a mesma carta');
    // Outra carta do projeto não fica presa pela primeira.
    a.novaCarta(2, { grupo: 'started', nome: 'In Progress' });
    modo = 'ok';
    assert.equal((await a.vigilia.varrer())[0].proximaCarta, 'PAINEL-2');
    tempo += 24 * 60 * 60_000;
    assert.equal((await a.vigilia.varrer())[0].proximaCarta, 'PAINEL-1', 'passadas 24 h a carta volta');
  } finally { await a.limpar(); }
});
