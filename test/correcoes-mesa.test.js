// Correções da varredura pré-aceite da mesa de decisão (validador de invariantes, 31/10/2026): substituição com
// "$" na descrição, marcador por nó de texto, lista fechada relida na escrita e na retomada, CKBL fora, digital,
// janela das atividades, retomada recalculada, abandonar pendência, rótulo pela fase, chave por operação, redirect
// e o filtro de segredo com o ambiente real. Plane sempre falso; nada de LLM nem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { validarProsa, codificarDecisao } from '../decisao/protocolo-decisao.js';
import { calcularDelta, corpoDoPatch, resolver, verificar, digital } from '../decisao/efeitos.js';
import { cartaDaMesa, projetosDaMesa } from '../decisao/permissao.js';
import { textoDeHtml } from '../decisao/texto-html.js';
import { criarLeitorCarta } from '../decisao/leitor-carta.js';
import { criarEscritorDecisaoPlane } from '../decisao/escritor-decisao-plane.js';
import { criarDiarioDecisao } from '../decisao/diario-decisao.js';
import { criarAplicacaoDecisao } from '../decisao/aplicacao-decisao.js';
import { criarServicoDecisao } from '../decisao/servico-decisao.js';
import * as apiDecisao from '../decisao/api-decisao.js';
import { criarEstadoOrquestracao } from '../orquestrador/fila.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { criarEscritorHandoffPlane } from '../orquestrador/escritor-handoff-plane.js';
import { criarEscritorGatePlane } from '../orquestrador/escritor-gate-plane.js';
import { criarEscritorEstadoPlane } from '../orquestrador/estado-plane.js';
import { criarEscritorZelador } from '../orquestrador/escritor-zelador-plane.js';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { PROJETOS } from '../projetos.js';
import { criarPlaneFalso, ADMIN, GUEST_KEY, PROJ, CARTA, OUTRO_ATOR } from './plane-mesa-falso.js';
import { montarComFalsos, cabecalhosDaBorda } from './painel-falso.js';

const CHAVE_ADMIN = 'plane_api_adminadminadmin0002';
const DONO = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };
const PEDIDO = { carta: 'PAINEL-53', decisao: 'Usar a fonte A', motivo: 'é a única com licença.', efeitos: { destravar: true, produto: 'manter', estado: 'Done' } };
const ROTA_CARTA = `GET /workspaces/astargne/projects/${PROJ}/work-items/${CARTA}/`;
const ROTA_COMENTARIO = `POST /workspaces/astargne/projects/${PROJ}/work-items/${CARTA}/comments/`;
const ROTA_PATCH = `PATCH /workspaces/astargne/projects/${PROJ}/work-items/`;
const ROTA_LABELS = `GET /workspaces/astargne/projects/${PROJ}/labels/`;
const L = (id, name) => ({ id, name });
const ID_A = '11111111-1111-4111-8111-111111111111';

async function arquivoChave(conteudo = CHAVE_ADMIN) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mesa-chave-'));
  const arquivo = path.join(dir, 'painel-admin.token');
  await fs.writeFile(arquivo, `${conteudo}\n`, { mode: 0o600 });
  return { dir, arquivo };
}

async function montarMesa({ plane = criarPlaneFalso(), agora = () => Date.parse('2026-10-31T12:00:00Z'), ambiente = {} } = {}) {
  const { dir, arquivo } = await arquivoChave();
  const estado = criarEstadoOrquestracao({ diretorio: path.join(dir, 'orquestracao') });
  const leitor = criarLeitorCarta({ chave: GUEST_KEY, fetchImpl: plane.fetchImpl });
  const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: projetosDaMesa().map(p => p.projetoId),
    arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
  const diario = criarDiarioDecisao({ diretorio: path.join(dir, 'c3po'), agora });
  const aplicacao = criarAplicacaoDecisao({ leitor, escritor, diario, comTrava: estado.comTrava, lerLease: estado.lerLease, agora });
  const servico = criarServicoDecisao({ leitor, escritor, diario, aplicacao, agora, ambiente });
  const linhas = async () => { try { return lerJsonl(await fs.readFile(diario.arquivo, 'utf8')).linhas; } catch { return []; } };
  const abandono = apiDecisao.criarConfirmacoesAbandono ? apiDecisao.criarConfirmacoesAbandono({ servico, aplicacao, agora }) : null;
  return { plane, dir, arquivo, estado, leitor, escritor, diario, aplicacao, servico, linhas, abandono,
    gravar: apiDecisao.criarConfirmacoesDecisao({ servico, aplicacao, agora }), retomar: apiDecisao.criarConfirmacoesRetomada({ servico, aplicacao, agora }),
    limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}

// Uma decisão que para em COMENTARIO_GRAVADO: a releitura depois do comentário cai.
async function pararDepoisDoComentario(m) {
  const p = await m.gravar.preparar(PEDIDO, DONO);
  let n = 0;
  m.plane.antes[ROTA_LABELS] = () => { n += 1; if (n === 2) throw Object.assign(new Error('rede'), { name: 'TypeError' }); };
  await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO));
  delete m.plane.antes[ROTA_LABELS];
  const [pendente] = await m.servico.pendentes();
  assert.equal(pendente.etapa, 'comentario-gravado');
  return pendente;
}

function delta(desc, decisao) {
  const prosa = validarProsa({ decisao, motivo: '' });
  const r = { carta: { labels: [L(ID_A, 'ASTARGNE')], state: { id: 's', name: 'Todo' }, description_html: desc }, labels: [L(ID_A, 'ASTARGNE')], estados: [] };
  const d = calcularDelta(r, { destravar: true, produto: 'manter', estado: null }, { decisao: prosa.decisao, quando: Date.parse('2026-10-31T12:00:00Z') });
  const p = corpoDoPatch(r, d, resolver(r, d));
  const depois = { carta: { ...r.carta, labels: [], description_html: p.corpo.description_html ?? desc } };
  return { d, corpo: p.corpo, depois: depois.carta.description_html, resultado: verificar(depois, d, p.labelsEsperadas).resultado };
}

// ---------- A1.1 e A1.2: o marcador ----------

test('A1.1: "$\'", "$&" e "$`" na decisão entram literais no marcador, sem trazer o marcador velho nem o prefixo de volta', () => {
  for (const [decisao, esperado] of [["Fica a opção $' sem mais", 'Fica a opção $&#39; sem mais'], ['Custa US$& por mês', 'Custa US$&amp; por mês'],
    ['Rodar com o prefixo $` ativo', 'Rodar com o prefixo $` ativo'], ['Grupo $1 e $<n>', 'Grupo $1 e $&lt;n&gt;']]) {
    const r = delta('<p>Intro.</p><p>(ASTARGNE: decidir A ou B)</p><p>Fim.</p>', decisao);
    assert.equal(r.depois, `<p>Intro.</p><p>(decidido em 31/10: ${esperado})</p><p>Fim.</p>`, decisao);
    assert.equal(r.resultado, 'aplicado', decisao);
  }
});

test('A1.2: o marcador vive num nó de texto — não atravessa HTML, aceita parênteses aninhados e texto longo; dois marcadores recusam', () => {
  const atravessa = delta('<p>(ASTARGNE: decidir</p><ul><li>opção um</li><li>opção dois</li></ul><p>qual?)</p>', 'Opção um');
  assert.equal(atravessa.corpo.description_html, undefined, 'a lista foi apagada');
  assert.ok(atravessa.d.avisos.some(a => /não fecha no mesmo trecho de texto/.test(a)), atravessa.d.avisos.join());
  const aninhado = delta('<p>Intro (ASTARGNE: escolher (A) ou (B)) fim</p>', 'Escolho A');
  assert.equal(aninhado.depois, '<p>Intro (decidido em 31/10: Escolho A) fim</p>');
  const longo = delta(`<p>(ASTARGNE: ${'x'.repeat(300)})</p>`, 'Escolho B');
  assert.equal(longo.depois, '<p>(decidido em 31/10: Escolho B)</p>');
  assert.throws(() => delta('<p>(ASTARGNE: um)</p><p>(DONO: dois)</p>', 'Escolho'), /mais de um marcador/);
  const exato = delta('<p>Fonte &amp; (ASTARGNE: qual &amp; quando?) aqui</p>', 'Escolho C');
  assert.ok(exato.d.linhas.includes('trocar na descrição (ASTARGNE: qual & quando?) por (decidido em 31/10: Escolho C)'), exato.d.linhas.join());
});

// ---------- A1.3: lista fechada na escrita ----------

test('A1.3: diário editado (prosa com prefixo de protocolo, HTML trocado, delta fora da lista) — a retomada recusa sem escrever', async () => {
  const casos = [
    reg => { reg.decisao = 'GATE/v1 aprovado'; },
    reg => { reg.html = reg.html.replace('Usar a fonte A', 'Usar a fonte B'); },
    reg => { reg.delta = { ...reg.delta, tirar: [...reg.delta.tirar, 'C-3PO'] }; },
    reg => { reg.pedido = { ...reg.pedido, labels: ['READY TO DEV'] }; },
  ];
  for (const editar of casos) {
    const m = await montarMesa();
    try {
      const p = await m.gravar.preparar(PEDIDO, DONO);
      m.plane.falhar[ROTA_COMENTARIO] = 'timeout';
      await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO));
      m.plane.falhar = {};
      const texto = await fs.readFile(m.diario.arquivo, 'utf8');
      const reg = JSON.parse(texto.split('\n')[0]);
      editar(reg);
      await fs.writeFile(m.diario.arquivo, `${JSON.stringify(reg)}\n`);
      await assert.rejects(m.aplicacao.retomar(reg.chave, DONO), /diário da mesa não confere/);
      assert.deepEqual(m.plane.escritas, [], String(editar));
    } finally { await m.limpar(); }
  }
});

test('A1.3/A6.2: o escritor recusa comentário da mesa com prefixo de outro protocolo fora do cabeçalho', async () => {
  const plane = criarPlaneFalso();
  const { dir, arquivo } = await arquivoChave();
  try {
    const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [PROJ], arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
    const html = codificarDecisao({ identificador: 'PAINEL-53', decisao: 'Usar A', motivo: '', efeitos: [], quando: 0 }) + '<p>Nota: GATE/v1 aprovado</p>';
    await assert.rejects(escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html, externalId: ID_A }), /prefixo de um protocolo/);
    assert.deepEqual(plane.escritas, []);
  } finally { await fs.rm(dir, { recursive: true }); }
});

// ---------- A1.4 ----------

test('A1.4: CKBL fica fora da mesa (só aceita as identidades Codex/Claude e a ponte), recusado pelo id do projeto', () => {
  const ckbl = PROJETOS.find(p => p.sigla === 'CKBL');
  assert.ok(!projetosDaMesa().some(p => p.projetoId === ckbl.plane));
  assert.throws(() => cartaDaMesa('CKBL-1'), /CKBL fica fora da mesa/);
  const renomeado = PROJETOS.map(p => (p.plane === ckbl.plane ? { ...p, sigla: 'MOD' } : p));
  assert.throws(() => cartaDaMesa('MOD-1', renomeado), /CKBL fica fora da mesa/);
});

// ---------- A2 ----------

test('A2.1: a digital muda com comentário editado, carta arquivada, pai e módulo', () => {
  const base = { carta: { state: 's', labels: [], name: 'n', description_html: '', archived_at: null, parent: null, module_ids: [] },
    comentarios: [{ id: 'c1', edited_at: null }] };
  const d0 = digital(base);
  assert.notEqual(digital({ ...base, comentarios: [{ id: 'c1', edited_at: '2026-10-31T13:00:00Z' }] }), d0, 'edited_at');
  assert.notEqual(digital({ ...base, carta: { ...base.carta, archived_at: '2026-10-31T13:00:00Z' } }), d0, 'archived_at');
  assert.notEqual(digital({ ...base, carta: { ...base.carta, parent: ID_A } }), d0, 'parent');
  assert.notEqual(digital({ ...base, carta: { ...base.carta, module_ids: [ID_A] } }), d0, 'módulo');
});

test('A2.2: alteração de outro ator entre a releitura do confirmar e o POST do comentário marca divergente', async () => {
  let t = Date.parse('2026-10-31T12:00:00Z');
  const m = await montarMesa({ agora: () => (t += 1_000) });
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    m.plane.antes[ROTA_COMENTARIO] = (pl) => {
      if (!pl.atividades.length) pl.atividades.push({ id: 'a1', field: 'priority', actor: OUTRO_ATOR, created_at: new Date(t).toISOString() });
    };
    const r = await m.gravar.confirmar(p.confirmacaoId, DONO);
    assert.equal(r.resultado, 'divergente');
    assert.ok(r.notas.some(n => /1 alteração de outro ator/.test(n)), r.notas.join());
  } finally { await m.limpar(); }
});

// ---------- A3.1: retomada recalculada ----------

test('A3.1: retomada de COMENTARIO_GRAVADO com a carta mudada não aplica o delta velho; preparar diz o recalculado', async () => {
  const m = await montarMesa();
  try {
    const pendente = await pararDepoisDoComentario(m);
    const igual = await m.retomar.preparar({ chave: pendente.chave }, DONO);
    assert.deepEqual(igual.mudancas, ['tirar a label ASTARGNE', 'trocar na descrição (ASTARGNE: qual das duas?) por (decidido em 31/10: Usar a fonte A)', 'estado: Todo → Done']);
    m.plane.carta.labels.push(m.plane.L.BLOQUEADA.id);
    await assert.rejects(m.retomar.preparar({ chave: pendente.chave }, DONO), (e) => e.status === 409 && /a carta mudou desde a decisão/.test(e.message) && /abandone/.test(e.message));
    await assert.rejects(m.retomar.confirmar(igual.confirmacaoId, DONO), /a carta mudou desde a decisão/);
    assert.ok(!m.plane.escritas.some(e => e.tipo === 'patch'), 'aplicou o delta velho');
  } finally { await m.limpar(); }
});

test('A3.1: PATCH que chegou antes da queda conta como aplicado na retomada (falta só o recibo)', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    let posts = 0;
    m.plane.antes[ROTA_COMENTARIO] = () => { posts += 1; if (posts === 2) throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO));
    delete m.plane.antes[ROTA_COMENTARIO];
    const [pendente] = await m.servico.pendentes();
    const prep = await m.retomar.preparar({ chave: pendente.chave }, DONO);
    assert.match(prep.mudancas.join(), /já estão na carta/);
    const r = await m.retomar.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'aplicado');
  } finally { await m.limpar(); }
});

test('A3.1: pendência velha (mais de 24 h) não se retoma: abandone', async () => {
  let t = Date.parse('2026-10-31T12:00:00Z');
  const m = await montarMesa({ agora: () => t });
  try {
    const pendente = await pararDepoisDoComentario(m);
    t += 25 * 3_600_000;
    await assert.rejects(m.retomar.preparar({ chave: pendente.chave }, DONO), /mais de 24 h/);
  } finally { await m.limpar(); }
});

// ---------- A3.2: abandonar ----------

test('A3.2: abandonar pendência (SSO + duas ações) grava DECISAO_ABANDONADA, recibo "abandonada" na carta e libera a carta', async () => {
  const m = await montarMesa();
  try {
    assert.ok(m.abandono, 'sem as duas ações de abandono');
    const pendente = await pararDepoisDoComentario(m);
    const prep = await m.abandono.preparar({ chave: pendente.chave }, DONO);
    assert.match(prep.aviso, /abandonar/i);
    const r = await m.abandono.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'abandonada');
    const fim = (await m.linhas()).at(-1);
    assert.deepEqual([fim.tipo, fim.quem], ['DECISAO_ABANDONADA', '1']);
    assert.match(m.plane.escritas.at(-1).html, /DECISAO-APLICACAO\/v1[\s\S]*Resultado: abandonada/);
    assert.deepEqual(await m.servico.pendentes(), []);
    await m.gravar.preparar({ ...PEDIDO, efeitos: { destravar: true, produto: 'manter', estado: null } }, DONO);
  } finally { await m.limpar(); }
});

test('A3.2: carta 404 ou projeto congelado: abandonar ainda fecha a pendência, só no diário', async () => {
  const m = await montarMesa();
  try {
    const pendente = await pararDepoisDoComentario(m);
    m.plane.falhar[ROTA_CARTA] = 404;
    m.plane.falhar[ROTA_COMENTARIO] = 404;
    await assert.rejects(m.retomar.preparar({ chave: pendente.chave }, DONO));
    const prep = await m.abandono.preparar({ chave: pendente.chave }, DONO);
    const r = await m.abandono.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'abandonada');
    assert.ok(r.notas.some(n => /recibo de abandono não gravado no Plane/.test(n)), r.notas.join());
    assert.deepEqual(await m.servico.pendentes(), []);
  } finally { await m.limpar(); }
});

// ---------- A3.3 e A3.4 ----------

test('A3.3: falha depois do comentário de intenção é "resultado incerto", nunca "nada foi gravado" (inclusive semEscrita)', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    m.plane.antes[ROTA_COMENTARIO] = (pl) => { pl.falhar[ROTA_CARTA] = 404; };
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO), (e) => /resultado incerto/.test(e.message) && !/nada foi gravado/.test(e.message) && !e.semEscrita);
  } finally { await m.limpar(); }
  // Escritor de mentira cujo recibo recusa "sem escrita" depois do PATCH.
  const n = await montarMesa();
  try {
    const p = await n.gravar.preparar(PEDIDO, DONO);
    const real = n.escritor;
    let comentarios = 0;
    const recusaRecibo = async (args) => {
      comentarios += 1;
      if (comentarios === 2) throw Object.assign(new Error('chave do Painel Admin ausente'), { semEscrita: true });
      return real.comentar(args);
    };
    const sessaoFalsa = async (o) => { const s = await real.abrir(o); return { ...s, comentar: recusaRecibo }; };
    const falso = { ...real, comentar: recusaRecibo, abrir: sessaoFalsa };
    const aplicacao = criarAplicacaoDecisao({ leitor: n.leitor, escritor: falso, diario: n.diario, comTrava: n.estado.comTrava, lerLease: n.estado.lerLease,
      agora: () => Date.parse('2026-10-31T12:00:00Z') });
    const confirmacoes = apiDecisao.criarConfirmacoesDecisao({ servico: n.servico, aplicacao, agora: () => Date.parse('2026-10-31T12:00:00Z') });
    const p2 = await confirmacoes.preparar(PEDIDO, DONO);
    await assert.rejects(confirmacoes.confirmar(p2.confirmacaoId, DONO), (e) => !/nada foi gravado/.test(e.message) && /incerto/.test(e.message));
    void p;
  } finally { await n.limpar(); }
});

test('A3.4: recibo já gravado manda no resultado; a retomada registra quem retomou', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    let posts = 0;
    // O recibo chega ao Plane (dizendo "divergente") mas a resposta não volta.
    m.plane.antes[ROTA_COMENTARIO] = (pl, opcoes) => {
      posts += 1;
      if (posts !== 2) return;
      const corpo = JSON.parse(opcoes.body);
      pl.comentarios.push({ id: '44444444-4444-4444-8444-444444444444', issue: CARTA, actor: ADMIN, created_by: ADMIN, edited_at: null, ...corpo,
        comment_html: corpo.comment_html.replace('Resultado: aplicado', 'Resultado: divergente') });
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    };
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO));
    delete m.plane.antes[ROTA_COMENTARIO];
    const [pendente] = await m.servico.pendentes();
    const prep = await m.retomar.preparar({ chave: pendente.chave }, DONO);
    const r = await m.retomar.confirmar(prep.confirmacaoId, { ...DONO, usuarioId: '1' });
    assert.equal(r.resultado, 'divergente', 'o resultado novo contradiz o recibo já gravado');
    const fim = (await m.linhas()).at(-1);
    assert.deepEqual([fim.tipo, fim.resultado, fim.quem, fim.retomada], ['DECISAO_CONCLUIDA', 'divergente', '1', true]);
  } finally { await m.limpar(); }
});

test('A3.4: diário da mesa corrompido é falha LOCAL, não "Plane"', async () => {
  const plane = criarPlaneFalso();
  const { arquivo, dir } = await arquivoChave();
  const { painel, diretorio, limpar } = await montarComFalsos({ ambiente: { ORQ_OWNER_USER_ID: '1', PLANE_API_KEY: GUEST_KEY, PLANE_ADMIN_ACTOR_ID: ADMIN },
    externos: { fetchPlane: plane.fetchImpl, arquivoChaveAdmin: arquivo } });
  try {
    await fs.mkdir(path.join(diretorio, 'c3po'), { recursive: true });
    await fs.writeFile(path.join(diretorio, 'c3po', 'decisoes.jsonl'), '{"tipo":"DECISAO_PENDENTE"\n{"tipo":"x"}\n');
    const req = Object.assign(Readable.from([]), { method: 'GET', url: '/api/decisao/carta?carta=PAINEL-53', headers: cabecalhosDaBorda({ sessao: false }) });
    let texto = '';
    const res = { status: null, setHeader() {}, writeHead(s) { this.status = s; }, write(t) { texto += t; }, end(t) { if (t) texto += t; } };
    await painel.atender(req, res);
    assert.equal(res.status, 503);
    assert.match(JSON.parse(texto).erro, /diário local da mesa/);
  } finally { await limpar(); await fs.rm(dir, { recursive: true }); }
});

// ---------- A4 ----------

test('A4.1: uma cópia da chave por operação — trocar o arquivo no meio do confirmar não muda a chave das escritas', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    let trocou = false;
    m.plane.antes[ROTA_CARTA] = async () => { if (!trocou) { trocou = true; await fs.writeFile(m.arquivo, 'plane_api_outraoutraoutra0003\n'); } };
    const r = await m.gravar.confirmar(p.confirmacaoId, DONO);
    assert.equal(r.resultado, 'aplicado');
    assert.equal(m.plane.escritas.length, 3);
  } finally { await m.limpar(); }
});

test('A4.2: todo escritor com chave recusa redirecionamento (handoff, gate, estado, zelador, mesa)', async () => {
  const opcoes = [];
  const parar = async (url, o) => { opcoes.push({ url, redirect: o.redirect }); throw new Error('parar'); };
  const P = PROJ;
  const ext = ID_A;
  const tentativas = [
    () => criarEscritorHandoffPlane({ chave: 'k'.repeat(20), projetoPermitido: P, autorEsperado: ADMIN, fetchImpl: parar })({ projetoId: P, cartaId: CARTA, html: '<p>x</p>', chaveIdempotencia: ext }),
    () => criarEscritorGatePlane({ chave: 'k'.repeat(20), projetoPermitido: P, autorEsperado: ADMIN, fetchImpl: parar })({ projetoId: P, cartaId: CARTA, gate: 'READY TO DEV', html: '<p>x</p>', chaveIdempotencia: ext, versaoCarta: 'v' }),
    () => criarEscritorEstadoPlane({ chave: 'k'.repeat(20), projetoPermitido: P, autorEsperado: ADMIN, fetchImpl: parar })({ projetoId: P, cartaId: CARTA, grupo: 'completed', versaoCarta: 'v' }),
    () => criarEscritorZelador({ escopoPermitido: async () => true, ator: ZELADOR_ATOR, fetchImpl: parar, lerChave: async () => 'z'.repeat(20) })
      .comentar({ projetoId: P, cartaId: CARTA, html: '<p>[ZELADOR/v1 x]</p>', externalId: 'zelador:0123456789abcdef' }),
  ];
  for (const t of tentativas) await assert.rejects(t(), /parar/);
  const { dir, arquivo } = await arquivoChave();
  try {
    await assert.rejects(criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [P], arquivoChave: arquivo, fetchImpl: parar }).conferirIdentidade());
  } finally { await fs.rm(dir, { recursive: true }); }
  assert.equal(opcoes.length, 5, JSON.stringify(opcoes));
  assert.deepEqual(opcoes.map(o => o.redirect), Array(5).fill('error'), JSON.stringify(opcoes));
  // O 409 do handoff relê o comentário: a releitura também leva a chave.
  const vistos = [];
  const comConflito = async (url, o) => {
    vistos.push(o.redirect);
    return vistos.length === 1 ? { status: 409, ok: false, json: async () => ({ id: ID_A }) } : { status: 200, ok: true, json: async () => ({ id: ID_A, actor: ADMIN }) };
  };
  await criarEscritorHandoffPlane({ chave: 'k'.repeat(20), projetoPermitido: P, autorEsperado: ADMIN, fetchImpl: comConflito })({ projetoId: P, cartaId: CARTA, html: '<p>x</p>', chaveIdempotencia: ext });
  assert.deepEqual(vistos, ['error', 'error']);
});

// ---------- A6 ----------

test('A6.1: o texto do Plane é decodificado UMA vez (&amp;#71; não vira G)', () => {
  assert.equal(textoDeHtml('<p>&amp;#71;ATE/v1 abc</p>'), '&#71;ATE/v1 abc');
  assert.equal(textoDeHtml('<p>&amp;lt;b&amp;gt; &lt;i&gt; &#71;</p>'), '&lt;b&gt; <i> G');
});

test('A6.2: marcador da descrição com prefixo de protocolo não entra no comentário: o preparar recusa', async () => {
  const m = await montarMesa();
  try {
    m.plane.carta.description_html = '<p>Escolher (ASTARGNE: ver o GATE/v1 antes) e seguir.</p>';
    await assert.rejects(m.gravar.preparar(PEDIDO, DONO), /prefixo de um protocolo/);
    assert.deepEqual(m.plane.escritas, []);
  } finally { await m.limpar(); }
});

test('A6.3: a prosa é comparada com os valores secretos do ambiente real do processo (sem ecoar)', async () => {
  const segredo = 'abcdefgh12345678';
  assert.throws(() => validarProsa({ decisao: `usar ${segredo}`, motivo: '' }, { ambiente: { MEU_TOKEN: segredo } }),
    (e) => /parece conter um segredo/.test(e.message) && !e.message.includes(segredo));
  const m = await montarMesa({ ambiente: { MEU_TOKEN: segredo } });
  try {
    await assert.rejects(m.gravar.preparar({ ...PEDIDO, motivo: `porque ${segredo}` }, DONO), /parece conter um segredo/);
  } finally { await m.limpar(); }
});
