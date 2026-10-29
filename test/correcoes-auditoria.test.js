// Correções da auditoria de 23-24/10/2026: cada teste pina um mecanismo que a
// auditoria mostrou furado (mutação nomeada no título do caso).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { avaliarCarta, avaliarProntidaoGate, comandoEstaticoSeguro } from '../orquestrador/politica.js';
import { dependenciasDaCarta, criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarDesafios, pendentes } from '../orquestrador/desafio-duas-acoes.js';
import { criarEscritorGatePlane } from '../orquestrador/gate-plane.js';
import { ErroAcesso } from '../orquestrador/sso.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const contrato = {
  versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline',
  tiposTeste: ['unitário'], criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
  comandos: [{ id: 'teste', executavel: 'npm', argumentos: ['test'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true }],
};
const cartaBase = { id: randomUUID(), labels: [{ name: 'READY TO DEV' }], state: { name: 'Todo', group: 'unstarted' }, filhos: [] };

function cartas(...seqs) {
  const porId = new Map();
  for (const seq of seqs) {
    const id = randomUUID();
    porId.set(id, { id, sigla: 'PAINEL', sequence_id: seq, state: { group: seq % 2 === 0 ? 'completed' : 'unstarted', name: seq % 2 === 0 ? 'Done' : 'Todo' } });
  }
  return porId;
}
const idDe = (porId, seq) => [...porId.values()].find(c => c.sequence_id === seq).id;

test('Depende de: em lista <ul><li> lê todas as linhas (mutação: regex de uma linha → PAINEL-33 some)', () => {
  const porId = cartas(32, 33);
  const carta = { description_html: '<p>Depende de:</p><ul><li>PAINEL-32</li><li>PAINEL-33</li></ul>' };
  const deps = dependenciasDaCarta(carta, { blocked_by: [idDe(porId, 32)] }, porId);
  assert.deepEqual(deps.map(d => [d.id, d.estado]), [['PAINEL-32', 'concluida'], ['PAINEL-33', 'não formalizada']]);
});

test('Dependências: X positiva é lida; Dependências: nenhuma segue negativa', () => {
  const porId = cartas(32, 33);
  assert.deepEqual(dependenciasDaCarta({ description_html: '<p>Dependências: PAINEL-33</p>' }, { blocked_by: [] }, porId)
    .map(d => [d.id, d.estado]), [['PAINEL-33', 'não formalizada']]);
  assert.deepEqual(dependenciasDaCarta({ description_html: '<p>Dependências: nenhuma</p>' }, { blocked_by: [] }, porId), []);
});

test('token com hífen que não é sigla lida (UTF-8) não vira dependência; sigla desconhecida bloqueia como não auditável', () => {
  const porId = cartas(32);
  assert.deepEqual(dependenciasDaCarta({ description_html: '<p>Depende de: PAINEL-32 (migrar para UTF-8)</p>' },
    { blocked_by: [idDe(porId, 32)] }, porId).map(d => [d.id, d.estado]), [['PAINEL-32', 'concluida']]);
  const desconhecida = dependenciasDaCarta({ description_html: '<p>Depende de: RAIZ-5</p>' }, { blocked_by: [] }, porId);
  assert.deepEqual(desconhecida.map(d => [d.id, d.estado]), [['descrição', 'não formalizada']]);
});

test('anotação legada (DONO: …) e (ASTARGNE, …) na descrição são decisão humana na política', () => {
  for (const descricao of ['<p>(DONO: decidir provedor)</p>', '<p>(ASTARGNE, com dado)</p>']) {
    assert.match(avaliarCarta({ ...cartaBase, description_html: descricao }, { contrato }).motivos.join(' '), /decisão ou bloqueio humano/);
    assert.match(avaliarProntidaoGate({ ...cartaBase, labels: [], description_html: descricao }, { gate: 'READY TO DEV' }).motivos.join(' '), /decisão ou bloqueio humano/);
  }
  assert.equal(avaliarCarta({ ...cartaBase, description_html: '<p>(DONOR list)</p>' }, { contrato }).elegivel, true);
});

test('label TAREFA DONO trava gate e despacho: é ação do dono, a IA não puxa', () => {
  const tarefa = { ...cartaBase, labels: [{ name: 'TAREFA DONO' }] };
  assert.match(avaliarCarta(tarefa, { contrato }).motivos.join(' '), /TAREFA DONO/);
  assert.match(avaliarProntidaoGate(tarefa, { gate: 'READY TO DEV' }).motivos.join(' '), /TAREFA DONO/);
});

test('lease ativo é motivo e situação "ativo"; vencido não-real é "expirado" (mutação: agora = Date.now sem parênteses)', () => {
  const ativo = { agente: 'Claude', expiraEm: new Date(Date.now() + 60_000).toISOString(), modoReal: true };
  const r = avaliarCarta(cartaBase, { contrato, lease: ativo });
  assert.equal(r.leaseSituacao, 'ativo');
  assert.match(r.motivos.join(' '), /lease ativo de Claude/);
  const vencido = { ...ativo, modoReal: false, expiraEm: new Date(Date.now() - 60_000).toISOString() };
  assert.equal(avaliarCarta(cartaBase, { contrato, lease: vencido }).leaseSituacao, 'expirado');
  assert.equal(avaliarCarta(cartaBase, { contrato, lease: { ...vencido, modoReal: true } }).leaseSituacao, 'revisão');
});

test('estado operacional ilegível impede marcar gate (mutação: erroEstado ignorado em avaliarProntidaoGate)', () => {
  const r = avaliarProntidaoGate({ ...cartaBase, labels: [] }, { gate: 'READY TO DEV', erroEstado: 'lease ou touchpoints' });
  assert.equal(r.pronta, false);
  assert.match(r.motivos.join(' '), /estado operacional ilegível/);
});

test('proibidos valem por substring: deployment.mjs e dockerize.mjs não passam', () => {
  for (const nome of ['scripts/deployment.mjs', 'scripts/dockerize.mjs', 'scripts/sshd-check.mjs', 'scripts/steamworks.mjs']) {
    assert.equal(comandoEstaticoSeguro({ id: 'x', executavel: 'node', argumentos: [nome] }), false, nome);
  }
  assert.equal(comandoEstaticoSeguro({ id: 'x', executavel: 'node', argumentos: ['scripts/portao.mjs'] }), true);
});

test('lease real vencido sem TENTATIVA é órfão: expira e libera, não vira revisão humana eterna', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-orfao-'));
  try {
    const estado = criarEstadoOrquestracao({ diretorio: raiz });
    const cartaId = randomUUID();
    const tentativaId = randomUUID();
    await fs.mkdir(path.join(raiz, 'leases'), { recursive: true });
    await fs.writeFile(path.join(raiz, 'leases', `${cartaId}.json`), JSON.stringify({ cartaId, tentativaId, agente: 'Claude',
      chaveIdempotencia: randomUUID(), modoReal: true, adquiridoEm: new Date().toISOString(), expiraEm: new Date(Date.now() - 1).toISOString() }));
    const r = await estado.reconciliar(cartaId);
    assert.equal(r.situacao, 'expirado');
    assert.equal(await estado.lerLease(cartaId), null);
    const tipos = (await estado.lerHistorico(cartaId)).map(e => `${e.tipo}:${e.resultado}`);
    assert.deepEqual(tipos, ['TENTATIVA:RECUPERADA_SEM_TOUCHPOINT', 'RECUPERACAO:LEASE_EXPIRADO']);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('teto de confirmações conta só pendentes/executando; recusa sem escrita descarta o desafio com 422', async () => {
  const cem = new Map(Array.from({ length: 100 }, (_, i) => [String(i), { estado: 'concluida' }]));
  assert.equal(pendentes(cem), 0);
  let semEscrita = true;
  const confirmacoes = criarDesafios({
    validar: async (entrada) => ({ guardar: entrada, resposta: {} }),
    executar: async () => { const e = new Error('carta mudou; recarregue'); if (semEscrita) e.semEscrita = true; throw e; },
  });
  const identidade = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };
  const p = await confirmacoes.preparar({ carta: randomUUID(), selecoes: {}, versaoCarta: '2026-10-20T08:00:00Z' }, identidade);
  await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, identidade), e => e instanceof ErroAcesso && e.status === 422 && /nada foi gravado/.test(e.message));
  await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, identidade), e => e.status === 404);
  semEscrita = false;
  const q = await confirmacoes.preparar({ carta: randomUUID(), selecoes: {}, versaoCarta: '2026-10-20T08:00:00Z' }, identidade);
  await assert.rejects(confirmacoes.confirmar(q.confirmacaoId, identidade), /carta mudou/);
  await assert.rejects(confirmacoes.confirmar(q.confirmacaoId, identidade), e => e.status === 409);
});

test('carta cancelada (group cancelled, grafia do Plane) fica fora da fila e das contagens', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-cancel-'));
  try {
    const cartaId = randomUUID();
    const consultar = async url => {
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [{ id: cartaId, sequence_id: 7, name: 'Morta', parent: null,
        state: { name: 'Cancelled', group: 'cancelled' }, labels: [{ name: 'READY TO DEV' }], description_html: '<p>Sem dependências.</p>', updated_at: '2026-10-20T08:00:00Z' }] };
      throw Error(`consulta inesperada: ${url}`);
    };
    const servico = criarServicoOrquestracao({ consultar, raiz, estado: criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') }) });
    const dados = await servico.fila();
    assert.equal(dados.itens.length, 0);
    assert.equal(dados.projetos.find(p => p.id === PROJETO).cartas, 0);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('escritor de gate relê as etiquetas antes do PATCH e para se mudaram; 409 no comentário é idempotência', async () => {
  const cartaId = randomUUID();
  const etiquetaA = randomUUID();
  const etiquetaB = randomUUID();
  const etiquetaGate = randomUUID();
  const comentarioId = randomUUID();
  const chamadas = [];
  function escritor({ etiquetasNaReleitura, statusComentario = 201 }) {
    let leituras = 0;
    return criarEscritorGatePlane({ chave: 'k', projetoPermitido: PROJETO, autorEsperado: AUTOR, apiBase: 'http://plane.falso',
      fetchImpl: async (url, opcoes = {}) => {
        chamadas.push(`${opcoes.method ?? 'GET'} ${url.replace('http://plane.falso/api/v1/workspaces/astargne/projects/', '')}`);
        const json = (corpo, status = 200) => ({ ok: status < 300, status, json: async () => corpo });
        if (url.endsWith(`/work-items/${cartaId}/?expand=labels`)) {
          leituras++;
          const nomes = leituras === 1 ? [{ id: etiquetaA, name: 'EMPÍRICA' }] : etiquetasNaReleitura;
          return json({ id: cartaId, updated_at: 'v1', labels: nomes });
        }
        if (url.endsWith('/labels/?per_page=100')) return json({ results: [{ id: etiquetaGate, name: 'READY TO DEV' }], next_page_results: false });
        if (url.endsWith(`/work-items/${cartaId}/comments/`) && opcoes.method === 'POST') return json({ id: comentarioId, actor: { id: AUTOR } }, statusComentario);
        if (url.endsWith(`/comments/${comentarioId}/`)) return json({ id: comentarioId, actor: { id: AUTOR } });
        if (url.endsWith(`/work-items/${cartaId}/`) && opcoes.method === 'PATCH') return json({ id: cartaId });
        throw Error(url);
      } });
  }
  const pedido = { projetoId: PROJETO, cartaId, gate: 'READY TO DEV', html: '<p>x</p>', chaveIdempotencia: randomUUID(), versaoCarta: 'v1' };
  await assert.rejects(escritor({ etiquetasNaReleitura: [{ id: etiquetaA, name: 'EMPÍRICA' }, { id: etiquetaB, name: 'BLOQUEADA' }] })(pedido), /etiquetas mudaram/);
  assert.equal(chamadas.some(c => c.startsWith('PATCH')), false);
  chamadas.length = 0;
  // Releitura inalterada e depois a verificação final: a terceira leitura traz o gate aplicado.
  let vezes = 0;
  const ok = criarEscritorGatePlane({ chave: 'k', projetoPermitido: PROJETO, autorEsperado: AUTOR, apiBase: 'http://plane.falso',
    fetchImpl: async (url, opcoes = {}) => {
      const json = (corpo, status = 200) => ({ ok: status < 300, status, json: async () => corpo });
      if (url.endsWith(`/work-items/${cartaId}/?expand=labels`)) {
        vezes++;
        return json({ id: cartaId, updated_at: 'v1', labels: vezes < 3 ? [{ id: etiquetaA, name: 'EMPÍRICA' }] : [{ id: etiquetaA, name: 'EMPÍRICA' }, { id: etiquetaGate, name: 'READY TO DEV' }] });
      }
      if (url.endsWith('/labels/?per_page=100')) return json({ results: [{ id: etiquetaGate, name: 'READY TO DEV' }], next_page_results: false });
      if (url.endsWith(`/work-items/${cartaId}/comments/`) && opcoes.method === 'POST') return json({ id: comentarioId }, 409);
      if (url.endsWith(`/comments/${comentarioId}/`)) return json({ id: comentarioId, actor: { id: AUTOR } });
      if (url.endsWith(`/work-items/${cartaId}/`) && opcoes.method === 'PATCH') { chamadas.push('PATCH'); return json({ id: cartaId }); }
      throw Error(url);
    } });
  const r = await ok(pedido);
  assert.equal(r.comentarioId, comentarioId);
  assert.deepEqual(chamadas, ['PATCH']);
});
