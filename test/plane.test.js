import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFeatures, criarClientePlane, buscarWorkspace } from '../plane.js';
import { lerBacklog } from '../coletores.js';

// Por que estes testes existem: desde 30/09/2026 o Plane é a verdade do
// backlog (antes foi o Linear) e o painel só projeta. O que não pode acontecer em silêncio é item
// sumir (sub-issue sem pai visível, issue sem milestone), tag perder o
// motivo, ou falha da API virar quadro vazio.

const issue = (id, extra = {}) => ({
  id,
  identifier: `AST-${id}`,
  title: `título ${id}`,
  url: `https://linear.app/x/issue/AST-${id}`,
  description: '',
  createdAt: `2026-09-29T20:00:${String(id).padStart(2, '0')}.000Z`,
  state: { name: 'Backlog', type: 'backlog' },
  labels: { nodes: [] },
  project: { id: 'P1' },
  projectMilestone: { id: 'M1' },
  parent: null,
  ...extra,
});

const workspace = (issues) => ({
  projetos: [{ id: 'P1', name: 'Projeto Um', url: 'https://linear.app/x/project/um' }],
  milestones: [
    { id: 'M2', name: 'F2 — segunda', sortOrder: 2, project: { id: 'P1' } },
    { id: 'M1', name: 'F1 — primeira', sortOrder: 1, project: { id: 'P1' } },
    { id: 'MX', name: 'de outro projeto', sortOrder: 0, project: { id: 'P2' } },
  ],
  issues,
});

test('módulo vira feature na ordem de criação, só os do projeto', () => {
  const r = montarFeatures(workspace([issue(1)]), 'P1');
  assert.equal(r.nome, 'Projeto Um');
  assert.deepEqual(r.features.map((f) => f.titulo), ['F1 — primeira', 'F2 — segunda']);
});

test('módulo sem item aparece vazio, não some', () => {
  const r = montarFeatures(workspace([issue(1)]), 'P1');
  assert.equal(r.features[1].itens.length, 0);
  assert.equal(r.features[1].estado, 'aberto');
});

test('sub-work item pendura no pai com nível, em qualquer ordem de chegada', () => {
  const r = montarFeatures(workspace([
    issue(3, { parent: { id: 2 } }),
    issue(1),
    issue(2, { parent: { id: 1 } }),
  ]), 'P1');
  const [raiz] = r.features[0].itens;
  assert.equal(raiz.identificador, 'AST-1');
  assert.equal(raiz.filhos[0].identificador, 'AST-2');
  assert.equal(raiz.filhos[0].nivel, 1);
  assert.equal(raiz.filhos[0].filhos[0].nivel, 2);
  assert.equal(r.features[0].itens.length, 1, 'filho não pode aparecer também no topo');
});

test('item sem módulo vai para "Sem módulo" em vez de sumir', () => {
  const r = montarFeatures(workspace([issue(1, { projectMilestone: null })]), 'P1');
  const sem = r.features.find((f) => f.titulo === 'Sem módulo');
  assert.equal(sem.itens[0].identificador, 'AST-1');
});

test('concluída é pronto; cancelada e duplicada não entram', () => {
  const r = montarFeatures(workspace([
    issue(1, { state: { name: 'Done', type: 'completed' } }),
    issue(2, { state: { name: 'Canceled', type: 'canceled' } }),
    issue(3, { state: { name: 'Duplicate', type: 'duplicate' } }),
    issue(4, { state: { name: 'In Progress', type: 'started' } }),
  ]), 'P1');
  const itens = r.features[0].itens;
  assert.deepEqual(itens.map((i) => [i.identificador, i.estado]), [['AST-1', 'pronto'], ['AST-4', 'aberto']]);
  assert.equal(itens[1].estadoRastreador, 'In Progress');
});

test('feature toda concluída é pronto', () => {
  const r = montarFeatures(workspace([issue(1, { state: { name: 'Done', type: 'completed' } })]), 'P1');
  assert.equal(r.features[0].estado, 'pronto');
});

test('label canônica vira tag, com o motivo tirado da descrição', () => {
  const r = montarFeatures(workspace([issue(1, {
    labels: { nodes: [{ name: 'BLOQUEADA' }, { name: 'ASTARGNE' }, { name: 'Bug' }] },
    description: 'Task: rodar X **(BLOQUEADA: exige macOS + Xcode)** e (ASTARGNE)',
  })]), 'P1');
  assert.deepEqual(r.features[0].itens[0].tags, [{ tag: 'ASTARGNE' }, { tag: 'BLOQUEADA', detalhe: 'exige macOS + Xcode' }]);
});

test('tag escrita na descrição sem a label não conta — a label é a verdade', () => {
  const r = montarFeatures(workspace([issue(1, { description: '(ASTARGNE) antigo' })]), 'P1');
  assert.deepEqual(r.features[0].itens[0].tags, []);
});

test('projeto inexistente devolve null', () => {
  assert.equal(montarFeatures(workspace([]), 'NAO'), null);
});

// Plane falso: responde por caminho, com paginação por cursor como a API v1.
function planeFalso(rotas) {
  const vistos = [];
  const consultar = async (caminho) => {
    vistos.push(caminho);
    const [base, qs] = caminho.split('?');
    const cursor = new URLSearchParams(qs).get('cursor');
    const paginas = rotas[base];
    if (!paginas) throw new Error(`rota inesperada ${base}`);
    const i = cursor ? Number(cursor) : 0;
    return { results: paginas[i], next_page_results: i + 1 < paginas.length, next_cursor: String(i + 1) };
  };
  return { consultar, vistos };
}

const wi = (id, extra = {}) => ({
  id, name: `nome ${id}`, sequence_id: Number(id.slice(1)), created_at: `2026-09-30T00:00:0${id.slice(1)}Z`,
  description_html: '<p>x</p>', state: { name: 'Backlog', group: 'backlog' }, labels: [], parent: null, ...extra,
});

test('busca pagina tudo, liga item ao módulo e normaliza estado e identificador', async () => {
  const { consultar, vistos } = planeFalso({
    '/projects/': [[{ id: 'P1', name: 'Um', identifier: 'UM' }]],
    '/projects/P1/work-items/': [[wi('w1')], [wi('w2', { state: { name: 'Cancelled', group: 'cancelled' }, parent: 'w1' })]],
    '/projects/P1/modules/': [[{ id: 'M1', name: 'F1', sort_order: 1000 }]],
    '/projects/P1/modules/M1/module-issues/': [[{ id: 'w1' }]],
  });
  const r = await buscarWorkspace(consultar);
  assert.equal(r.issues.length, 2, 'a segunda página de work items não pode sumir');
  const [w1, w2] = r.issues;
  assert.equal(w1.identifier, 'UM-1');
  assert.equal(w1.projectMilestone.id, 'M1');
  assert.equal(w2.projectMilestone, null);
  assert.equal(w2.state.type, 'canceled', 'o grupo "cancelled" do Plane vira o "canceled" que montarFeatures descarta');
  assert.equal(w2.parent.id, 'w1');
  assert.ok(vistos.some((c) => c.includes('cursor=1')));
  assert.equal(r.milestones[0].sortOrder, 1000, 'a ordem vem do sort_order do Plane');
});

test('erro da API não ecoa a chave', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ detail: 'lin_nada' }) });
  const consultar = criarClientePlane({ chave: 'plane_api_SEGREDO', fetchImpl });
  await assert.rejects(consultar('/projects/'), (erro) => {
    assert.match(erro.message, /HTTP 401/);
    assert.doesNotMatch(erro.message, /SEGREDO/);
    return true;
  });
});

test('a chave vai no cabeçalho X-API-Key', async () => {
  let cabecalhos;
  const fetchImpl = async (_url, opcoes) => { cabecalhos = opcoes.headers; return { ok: true, json: async () => ({ results: [] }) }; };
  await criarClientePlane({ chave: 'plane_api_X', fetchImpl })('/projects/');
  assert.equal(cabecalhos['X-API-Key'], 'plane_api_X');
});

const catalogo = [
  { pasta: 'um', titulo: 'Um', plane: 'P1' },
  { pasta: 'sumido', titulo: 'Sumido', plane: 'P9' },
  { pasta: 'nada', titulo: 'Nada' },
];

test('lerBacklog: falha do Plane vira estado nomeado em cada projeto, nunca lista vazia', async () => {
  const r = await lerBacklog(catalogo, { lerPlane: async () => { throw new Error('Plane recusou a consulta (HTTP 429)'); } });
  assert.deepEqual(r.projetos.map((p) => [p.pasta, p.estado]), [['um', 'erro_plane'], ['sumido', 'erro_plane']]);
  assert.match(r.projetos[0].erro, /429/);
});

test('lerBacklog: projeto invisível para o "painel" é erro nomeado; projeto sem fonte não aparece', async () => {
  const r = await lerBacklog(catalogo, { lerPlane: async () => workspace([issue(1)]) });
  const [um, sumido] = r.projetos;
  assert.equal(r.projetos.length, 2);
  assert.equal(um.estado, 'ok');
  assert.equal(um.fonte, 'plane');
  assert.equal(um.backlog, 'Plane · Projeto Um');
  assert.equal(um.features[0].itens[0].identificador, 'AST-1');
  assert.equal(sumido.estado, 'erro_plane');
  assert.match(sumido.erro, /P9/);
  assert.match(sumido.erro, /painel/);
});

test('descrição hostil não trava o painel (regex com teto)', () => {
  const t = Date.now();
  const r = montarFeatures(workspace([issue(1, {
    labels: { nodes: [{ name: 'DONO' }] }, // nome legado: ainda deve virar ASTARGNE
    description: '(DONO '.repeat(40000),
  })]), 'P1');
  assert.ok(Date.now() - t < 500, `levou ${Date.now() - t} ms`);
  assert.deepEqual(r.features[0].itens[0].tags, [{ tag: 'ASTARGNE' }]);
});

test('cache: dado velho sai na hora e a renovação é uma só, em segundo plano', async () => {
  const { lerWorkspacePlane, limparCachePlane } = await import('../plane.js');
  limparCachePlane();
  let buscas = 0;
  let liberar;
  const consultarLento = async (caminho) => {
    if (caminho.startsWith('/projects/?')) { buscas++; await new Promise((ok) => { liberar = ok; }); }
    return { results: [], next_page_results: false };
  };
  const primeira = lerWorkspacePlane({ agora: 0, consultar: consultarLento });
  liberar();
  const d1 = await primeira;
  const t = Date.now() + 120_000; // bem depois do TTL
  const d2 = await lerWorkspacePlane({ agora: t, consultar: consultarLento });
  const d3 = await lerWorkspacePlane({ agora: t, consultar: consultarLento });
  assert.equal(d2, d1, 'com cache vencido devolve o dado anterior sem esperar');
  assert.equal(d3, d1);
  assert.equal(buscas, 2, 'uma carga inicial + UMA renovação, mesmo com duas chamadas');
  liberar();
  limparCachePlane();
});

test('label legada DONO e tag "(DONO: motivo)" na descrição viram ASTARGNE com o motivo', async () => {
  const r = montarFeatures(workspace([issue(1, { labels: { nodes: [{ name: 'DONO' }] }, description: 'x (DONO: espera o dado)' })]), 'P1');
  assert.deepEqual(r.features[0].itens[0].tags, [{ tag: 'ASTARGNE', detalhe: 'espera o dado' }]);
});

test('label TAREFA DONO vira tag própria com o motivo; o "(TAREFA DONO" não vira ASTARGNE', async () => {
  const r = montarFeatures(workspace([issue(1, { labels: { nodes: [{ name: 'TAREFA DONO' }] }, description: 'x (TAREFA DONO: playtest no celular)' })]), 'P1');
  assert.deepEqual(r.features[0].itens[0].tags, [{ tag: 'TAREFA DONO', detalhe: 'playtest no celular' }]);
});

test('rajada: no máximo 6 GETs abertos por processo, o prazo só conta fora da espera e erro solta a vaga', async () => {
  let abertas = 0; let pico = 0; let n = 0;
  const fetchImpl = async (url, { signal }) => {
    assert.equal(signal.aborted, false, 'o prazo não pode ter corrido na espera');
    abertas++; pico = Math.max(pico, abertas);
    await new Promise(r => setTimeout(r, 15));
    abertas--;
    if (++n % 7 === 0) return { ok: false, status: 502, json: async () => null };
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };
  // Prazo de 40 ms: com 30 chamadas de 15 ms e só 6 vagas, quem espera passaria do prazo se ele contasse na fila.
  const consultar = criarClientePlane({ chave: 'k', fetchImpl, timeoutMs: 40 });
  const r = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => consultar(`/x/${i}`)));
  assert.equal(pico, 6);
  assert.equal(r.filter(x => x.status === 'rejected').length, 4, 'só os 502 falham');
  assert.equal((await Promise.allSettled([consultar('/depois')]))[0].status, 'fulfilled', 'as vagas voltaram');
});
