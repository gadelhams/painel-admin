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
});

// Plane falso com cards mutáveis; escritores falsos mudam o card como o Plane faria.
async function ambiente({ executar, contrato = contratoBase, agora }) {
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
  const comentar = (cartaId, html) => { const id = randomUUID(); comentarios.get(cartaId).push({ id, actor: AUTOR, created_at: bump(), comment_html: html }); cards.find(c => c.id === cartaId).updated_at = bump(); return id; };
  const identidadesEscrita = { [PROJETO]: { autorEscrita: AUTOR,
    escritorPerfil: async ({ cartaId, html }) => { escritas.push('perfil'); return comentar(cartaId, html); },
    escritorHandoff: async ({ cartaId, html }) => { escritas.push('handoff'); return comentar(cartaId, html); },
    escritorGate: async ({ cartaId, gate, html, remover }) => {
      escritas.push(`gate:${remover ? `${remover}->` : ''}${gate}`);
      const c = cards.find(x => x.id === cartaId);
      c.labels = [...c.labels.filter(l => l.name !== remover), { id: `label-${gate}`, name: gate }];
      return { comentarioId: comentar(cartaId, html) };
    },
    escritorEstado: async ({ cartaId, grupo, removerEtiqueta }) => {
      escritas.push(`estado:${grupo}${removerEtiqueta ? `-${removerEtiqueta}` : ''}`);
      const c = cards.find(x => x.id === cartaId);
      c.state = grupo === 'started' ? { name: 'In Progress', group: 'started' } : { name: 'Done', group: 'completed' };
      if (removerEtiqueta) c.labels = c.labels.filter(l => l.name !== removerEtiqueta);
      c.updated_at = bump();
      return { estadoId: 'x', estadoNome: c.state.name, versaoCarta: c.updated_at };
    } } };
  const executor = { validar: async () => {}, executar };
  const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado'), agora: relogio });
  const servico = criarServicoOrquestracao({ consultar, raiz, estado, identidadesEscrita, executor, execucaoHabilitada: true, agora: relogio });
  const vigilia = criarVigilia({ servico, diretorioEstado: path.join(raiz, 'estado'), agora: relogio,
    projetos: [{ pasta: 'painel-admin', titulo: 'Painel', plane: PROJETO }] });
  return { raiz, cards, novaCarta, escritas, servico, vigilia, estado, limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
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

test('ligada: carta DEV em Todo vai a In Progress, recebe perfil padrão, é despachada e avança para READY TO TEST com recibo', async () => {
  const a = await ambiente({ executar: ok });
  try {
    const c = a.novaCarta(1);
    await a.vigilia.alternar(PROJETO, true, '1');
    const [r] = await a.vigilia.varrer();
    assert.equal(r.ultimaTentativa.resultado, 'concluido', JSON.stringify(r));
    assert.deepEqual(a.escritas, ['estado:started', 'perfil', 'handoff', 'handoff', 'gate:READY TO DEV->READY TO TEST']);
    const atual = a.cards.find(x => x.id === c.id);
    assert.deepEqual(atual.labels.map(l => l.name), ['READY TO TEST']);
    assert.equal(atual.state.group, 'started');
    const item = (await a.servico.fila()).itens.find(x => x.id === c.id);
    assert.equal(item.gate, 'READY TO TEST');
    assert.equal(item.provenienciaGate, 'verificada', 'o recibo da troca vale como proveniência do novo gate');
    assert.equal(item.elegivel, true);
    const diario = (await a.vigilia.estadoDaVigilia()).projetos[0].diario.map(e => e.tipo);
    assert.deepEqual(diario, ['AVANCO', 'TENTATIVA', 'PERFIL', 'ESTADO', 'LIGADA']);
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

test('duas rejeições esgotam a carta; o teto diário segura e volta depois de 24 h; limite de uso pausa', async () => {
  let tempo = Date.parse('2026-10-24T10:00:00Z');
  let modo = 'rejeitar';
  const a = await ambiente({ agora: () => tempo, executar: async () => modo === 'rejeitar'
    ? { resultado: 'rejeitado', resumo: 'Comando falhou nesta tentativa.', evidencia: ['comando testes: código 1'] }
    : modo === 'limite' ? { resultado: 'impedido', resumo: 'Tentativa impedida: limite de uso do provedor claude no papel orquestracao.', evidencia: ['limite de uso do provedor claude'] }
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
    assert.match(pausa.motivoOciosa, /pausada até .*limite de uso/);
    assert.equal((await a.vigilia.estadoDaVigilia()).projetos[0].pausadaAte !== null, true);
    assert.match((await a.vigilia.varrer())[0].motivoOciosa, /pausada até/);
    tempo += 61 * 60_000;
    modo = 'ok';
    const [depois] = await a.vigilia.varrer();
    assert.equal(depois.motivoOciosa, 'nenhuma carta elegível', 'carta 2 esgotou com a 2ª tentativa (limite contou) e a 1 estava esgotada');
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
