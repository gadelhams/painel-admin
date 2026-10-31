// F4a da frota (PAINEL-54): uma tentativa por vez no disco (J51), recibo GATE/v1 endurecido (J54, J55, J74), origem no HANDOFF (J70),
// `instalarEm` (item 7) e a reserva de carta vista pela vigília e pelo despacho (item 9). Plane, executor e CLIs falsos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { criarEstadoOrquestracao, grupoVivo } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { lerGatesDoCanal, codificarGate } from '../orquestrador/gate-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { handoffsDoCanal } from '../orquestrador/handoff-plane.js';
import { DependenciasWorktree } from '../orquestrador/dependencias-worktree.js';
import { ProcessoCli } from '../orquestrador/processo-cli.js';
import { validarContrato } from '../orquestrador/politica.js';
import { PassoVigilia } from '../orquestrador/passo-vigilia.js';
import { ReservasCarta } from '../orquestrador/reservas.js';
import { gravarFrota, conteudoFrota, tupla } from './fixtures/frota/frota.js';
import { reciboGate, etiqueta, atividadeEtiqueta } from './fixtures/recibo-gate.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const DONO_PLANE = '99999999-9999-4999-8999-999999999999';
const T0 = '2026-10-31T10:00:00Z';
const depois = s => new Date(Date.parse(T0) + s * 1000).toISOString();
const contrato = {
  versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'], criteriosAceite: ['passou'],
  acoesProibidas: ['deploy'], comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }],
  agentes: [{ id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }],
  vigilia: { maxTentativasPorCarta: 2, tetoPorDia: 6 },
};
const FROTA = conteudoFrota({ orquestracao: tupla('openai'), codificacao_testes: tupla('openai'), validacao: tupla('openai') });

// Um projeto com N cartas READY TO DEV, cada uma com recibo e atividade do autor (caminho feliz),
// e um executor que só termina quando o teste solta (`soltar`).
async function cenario({ cartas = 2, reservada = null } = {}) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-f4a-'));
  await fs.mkdir(path.join(raiz, 'painel-admin'));
  await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify(contrato));
  const cards = Array.from({ length: cartas }, (_, i) => ({ id: randomUUID(), sequence_id: 10 + i, name: `Carta ${i}`, parent: null,
    state: { name: 'In Progress', group: 'started' }, labels: [etiqueta('READY TO DEV')], description_html: '<p>Sem dependências.</p>', updated_at: T0 }));
  const comentarios = new Map(cards.map(c => [c.id, [reciboGate({ autor: AUTOR, quando: T0, projetoId: PROJETO, cartaId: c.id,
    chaveIdempotencia: randomUUID(), versaoCarta: T0, gate: 'READY TO DEV', justificativa: 'Escopo e dependências revisados.', evidencias: ['Sem dependências formais.'] })]]));
  const atividades = new Map(cards.map(c => [c.id, [atividadeEtiqueta({ nome: 'READY TO DEV', autor: AUTOR, quando: depois(1) })]]));
  const consultar = async url => {
    if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
    if (url.includes('/work-items/?')) return { results: cards.map(c => ({ ...c })) };
    if (url.includes('/relations/')) return { blocked_by: [] };
    const m = /\/work-items\/([0-9a-f-]{36})\/(comments|activities)?/.exec(url);
    if (m?.[2] === 'comments') return { results: comentarios.get(m[1]), next_page_results: false };
    if (m?.[2] === 'activities') { const a = atividades.get(m[1]); if (a === null) throw new Error('HTTP 500'); return a; }
    if (m) return { ...cards.find(c => c.id === m[1]) };
    throw new Error(url);
  };
  let soltar;
  const pendente = new Promise(r => { soltar = r; });
  const executados = [];
  const executor = { validar: async () => {}, executar: async (pedido) => {
    executados.push(pedido.carta);
    pedido.aoProcesso?.(process.pid);
    await pendente;
    return { resultado: 'concluido', resumo: 'Tentativa terminou com a suíte verde.', evidencia: ['comando testes: código 0'] };
  } };
  const handoffs = [];
  const identidadesEscrita = { [PROJETO]: { autorEscrita: AUTOR,
    escritorHandoff: async ({ cartaId, html }) => { const id = randomUUID(); handoffs.push(html);
      comentarios.get(cartaId).push({ id, actor: AUTOR, created_at: depois(5), comment_html: html, external_source: 'orquestrador-handoff-v1' }); return id; },
    escritorGate: async () => ({ comentarioId: randomUUID() }),
    escritorEstado: async () => ({ estadoNome: 'In Progress', versaoCarta: T0 }) } };
  const reservas = new ReservasCarta({ diretorioEstado: raiz });
  const cartaReservada = reservada ?? (id => reservas.ocupadaPorOutro(id));
  const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'orquestracao'), cartaReservada });
  const frota = await gravarFrota(path.join(raiz, 'orquestracao'), FROTA);
  const servico = criarServicoOrquestracao({ consultar, raiz, estado, identidadesEscrita, executor, execucaoHabilitada: true, cartaReservada });
  const pedido = (c, origemDespacho = 'dono') => ({ cartaId: c.id, comandoId: 'testes', versaoCarta: T0, frotaVersao: frota.versao,
    frotaHash: frota.hash, chaveIdempotencia: randomUUID(), usuarioId: '7', origemDespacho });
  return { raiz, cards, comentarios, atividades, servico, estado, reservas, executados, handoffs, pedido, soltar: () => soltar(),
    limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}

// ---------- J51 ----------

test('J51: despacho manual simultâneo em OUTRA carta é recusado pelo disco; a primeira grava o pgid e, terminada, libera', async () => {
  const c = await cenario();
  try {
    const [a, b] = c.cards;
    const primeira = c.servico.iniciarDespacho(c.pedido(a));
    while (!c.executados.length) await new Promise(r => setTimeout(r, 5));
    await assert.rejects(c.servico.iniciarDespacho(c.pedido(b)), /tentativa em curso em PAINEL-10/);
    assert.equal(await c.estado.lerLease(b.id), null, 'a recusada não gravou lease');
    assert.equal(c.executados.length, 1);
    let lease;
    for (let i = 0; i < 50 && !lease?.pgid; i++) { lease = await c.estado.lerLease(a.id); await new Promise(r => setTimeout(r, 5)); }
    assert.equal(lease.pgid, process.pid, 'o grupo do filho vai para o lease');
    assert.equal(lease.carta, 'PAINEL-10');
    c.soltar();
    assert.equal((await primeira).resultado, 'concluido');
    const segunda = c.servico.iniciarDespacho(c.pedido(b));
    while (c.executados.length < 2) await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(c.executados, ['PAINEL-10', 'PAINEL-11']);
    await segunda;
  } finally { c.soltar(); await c.limpar(); }
});

test('J51: lease em revisão de outra carta ocupa enquanto o grupo gravado vive; morto, libera; ilegível ocupa', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-j51-'));
  let agora = Date.parse(T0);
  const estado = criarEstadoOrquestracao({ diretorio: dir, agora: () => agora });
  const [A, B, C] = [randomUUID(), randomUUID(), randomUUID()];
  const dormente = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { detached: true, stdio: 'ignore' });
  try {
    const r = await estado.reservar({ cartaId: A, carta: 'PAINEL-1', agente: 'x', chaveIdempotencia: randomUUID(), modoReal: true });
    await estado.marcarProcesso({ cartaId: A, tentativaId: r.lease.tentativaId, pgid: dormente.pid });
    await estado.registrarEvento({ tipo: 'EXECUCAO_PREPARADA', cartaId: A, tentativaId: r.lease.tentativaId });
    agora += 20 * 60_000; // o painel caiu: o lease venceu, a tentativa fica em revisão
    assert.equal(grupoVivo(dormente.pid), true);
    await assert.rejects(estado.reservar({ cartaId: B, agente: 'x', chaveIdempotencia: randomUUID(), modoReal: true }),
      e => e.semReserva === true && /tentativa em curso em PAINEL-1 \(processo \d+ vivo, lease em revisão\)/.test(e.message));
    process.kill(-dormente.pid, 'SIGKILL');
    for (let i = 0; i < 100 && grupoVivo(dormente.pid); i++) await new Promise(res => setTimeout(res, 10));
    const livre = await estado.reservar({ cartaId: B, agente: 'x', chaveIdempotencia: randomUUID(), modoReal: true });
    assert.equal(livre.duplicada, false, 'grupo morto: a revisão de A segue só para A');
    await estado.concluir({ cartaId: B, tentativaId: livre.lease.tentativaId, resultado: 'concluido' });
    await fs.writeFile(path.join(dir, 'leases', `${C}.json`), '{ quebrado');
    await assert.rejects(estado.reservar({ cartaId: B, agente: 'x', chaveIdempotencia: randomUUID(), modoReal: true }), /lease ilegível em/);
  } finally { try { process.kill(-dormente.pid, 'SIGKILL'); } catch { /* já morto */ } await fs.rm(dir, { recursive: true, force: true }); }
});

test('J51: ProcessoCli avisa o grupo de cada filho (pgid = pid, detached)', async () => {
  const vistos = [];
  const p = new ProcessoCli({ spawn, env: process.env, maxSaidaBytes: 1024, aoIniciar: pid => vistos.push(pid) });
  const r = await p.rodar({ executavel: process.execPath, argumentos: ['-e', 'process.stdout.write(String(process.pid))'], cwd: os.tmpdir(), timeoutMs: 10_000 });
  await new Promise(res => setTimeout(res, 10));
  assert.deepEqual(vistos, [Number(r.stdout)]);
});

// ---------- J54, J74 ----------

const interacao = (extra) => normalizarInteracao({ id: randomUUID(), actor: AUTOR, created_at: T0, edited_at: null, external_source: 'orquestrador-gate-v1', ...extra });
const htmlGate = (cartaId) => codificarGate({ projetoId: PROJETO, cartaId, chaveIdempotencia: randomUUID(), versaoCarta: T0,
  gate: 'READY TO DEV', justificativa: 'Escopo e dependências revisados.', evidencias: ['Sem dependências formais.'] });

test('J54/J74: recibo em prosa, sem fonte, de outro autor, editado ou malformado fica de fora e é anotado; nada lança', () => {
  const carta = randomUUID();
  const alvo = { projetoId: PROJETO, cartaId: carta, autorId: AUTOR };
  const valido = htmlGate(carta);
  const corpo = valido.slice(valido.indexOf('GATE/v1 '), valido.indexOf('</p>'));
  const casos = {
    'sem o cabeçalho [ORQ/v1 papel=decisao]': interacao({ comment_html: `<p>${corpo}</p>` }),
    'prosa do zelador': interacao({ comment_html: `<p>[ZELADOR/v1 x] o gate está ok: ${corpo}</p>` }),
    'fonte externa fora da lista': interacao({ comment_html: valido, external_source: 'zelador-hangar-v1' }),
    'editado depois de criado': interacao({ comment_html: valido, edited_at: depois(60) }),
    'autor não aceito': interacao({ comment_html: valido, actor: DONO_PLANE }),
    'ilegível': interacao({ comment_html: '<p>[ORQ/v1 papel=decisao] GATE/v1 %%%nao-base64</p>' }),
  };
  const { gates, ignorados } = lerGatesDoCanal(Object.values(casos), alvo);
  assert.deepEqual(gates, []);
  assert.deepEqual(ignorados.map(x => x.motivo).sort(), ['autor não aceito', 'editado depois de criado', 'fonte externa fora da lista', 'ilegível',
    'sem o cabeçalho [ORQ/v1 papel=decisao]', 'sem o cabeçalho [ORQ/v1 papel=decisao]'].sort());
  const ok = lerGatesDoCanal([...Object.values(casos), interacao({ comment_html: valido })], alvo);
  assert.equal(ok.gates.length, 1);
  assert.equal(ok.gates[0].origemGate, 'dono');
});

test('J54: na fila, recibo forjado em prosa não verifica a carta e o malformado não derruba a leitura', async () => {
  const c = await cenario({ cartas: 1 });
  try {
    const [a] = c.cards;
    const valido = c.comentarios.get(a.id)[0];
    c.comentarios.set(a.id, [{ ...valido, comment_html: valido.comment_html.replace('[ORQ/v1 papel=decisao] ', '') },
      { ...valido, id: randomUUID(), comment_html: '<p>[ORQ/v1 papel=decisao] GATE/v1 %%%</p>' }]);
    const item = (await c.servico.fila()).itens.find(x => x.id === a.id);
    assert.equal(item.elegivel, false);
    assert.match(item.provenienciaGate, /evidência GATE\/v1 ausente.*2 recibo\(s\) ignorado\(s\): sem o cabeçalho \[ORQ\/v1 papel=decisao\], ilegível/);
  } finally { await c.limpar(); }
});

// ---------- J55 ----------

test('J55: o recibo amarra a instância atual da etiqueta — recolocada à mão é inelegível; ilegível também', async () => {
  const c = await cenario({ cartas: 1 });
  try {
    const [a] = c.cards;
    const item = async () => (await c.servico.fila()).itens.find(x => x.id === a.id);
    assert.equal((await item()).provenienciaGate, 'verificada');
    assert.equal((await item()).origemGate, 'dono');
    // O dono tira o gate e alguém o recoloca à mão no Plane: o recibo antigo não vale para a etiqueta nova.
    c.atividades.get(a.id).push(atividadeEtiqueta({ nome: 'READY TO DEV', autor: DONO_PLANE, quando: depois(100), removida: true }),
      atividadeEtiqueta({ nome: 'READY TO DEV', autor: DONO_PLANE, quando: depois(200) }));
    const recolocada = await item();
    assert.equal(recolocada.elegivel, false);
    assert.match(recolocada.provenienciaGate, /não amarrado à etiqueta atual: etiqueta atual posta por autor não aceito/);
    await assert.rejects(c.servico.validarDespacho(a.id, 'testes', T0), /etiqueta atual posta por autor não aceito/);
    // Etiqueta posta antes de qualquer recibo válido (mesmo pelo autor aceito) não vale.
    c.atividades.set(a.id, [atividadeEtiqueta({ nome: 'READY TO DEV', autor: AUTOR, quando: depois(-100) })]);
    assert.match((await item()).provenienciaGate, /etiqueta atual posta antes de qualquer recibo válido/);
    c.atividades.set(a.id, null);
    assert.match((await item()).provenienciaGate, /atividades da carta ilegíveis/);
    c.atividades.set(a.id, []);
    assert.match((await item()).provenienciaGate, /atividade que pôs a etiqueta não encontrada/);
  } finally { await c.limpar(); }
});

// ---------- J70 ----------

test('J70: os dois HANDOFF do despacho gravam origemDespacho e origemGate; a vigília diz hangar e não "confirmado pelo usuário"', async () => {
  const c = await cenario({ cartas: 1 });
  try {
    c.soltar();
    await assert.rejects(c.servico.iniciarDespacho({ ...c.pedido(c.cards[0]), origemDespacho: undefined }), /origem do despacho obrigatória/);
    await c.servico.iniciarDespacho(c.pedido(c.cards[0], 'hangar'));
    const lidos = handoffsDoCanal(c.comentarios.get(c.cards[0].id).map(normalizarInteracao), { projetoId: PROJETO, cartaId: c.cards[0].id, autorId: AUTOR });
    assert.equal(lidos.length, 2);
    for (const h of lidos) assert.deepEqual([h.origemDespacho, h.origemGate], ['hangar', 'dono']);
    assert.match(lidos[0].resumo, /^Despacho da vigília do Hangar para PAINEL-10 \(play ligado por 7; gate dono\)\.$/);
    assert.match(c.handoffs[0], /Despacho: hangar · gate: dono/);
  } finally { await c.limpar(); }
});

// ---------- item 7 ----------

test('item 7: instalarEm faz npm ci --ignore-scripts em cada subpasta com lock; caminho com .. ou link para fora recusa', async () => {
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-inst-'));
  const fora = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-fora-'));
  try {
    for (const d of ['', 'servico-upload', 'e2e', 'sem-lock']) {
      await fs.mkdir(path.join(wt, d), { recursive: true });
      if (d !== 'sem-lock') await fs.writeFile(path.join(wt, d, 'package-lock.json'), '{}');
    }
    const chamadas = [];
    const processo = { rodar: async (p) => { chamadas.push({ cwd: p.cwd, argumentos: p.argumentos, log: path.basename(p.log) }); return { codigo: 0, duracaoMs: 1000 }; } };
    const dep = new DependenciasWorktree({ processo, binario: async () => '/usr/bin/npm', limites: { minutosInstalacao: 1 } });
    const r = await dep.instalar(wt, wt, ['servico-upload', 'e2e', 'sem-lock']);
    assert.deepEqual(chamadas.map(x => path.relative(wt, x.cwd)), ['', 'servico-upload', 'e2e']);
    assert.ok(chamadas.every(x => x.argumentos.join(' ') === 'ci --ignore-scripts --no-audit --no-fund'));
    assert.deepEqual(chamadas.map(x => x.log), ['npm-ci.log', 'npm-ci-servico-upload.log', 'npm-ci-e2e.log']);
    assert.match(r.evidencia, /em servico-upload.*em e2e/);
    await fs.symlink(fora, path.join(wt, 'link'));
    assert.match((await dep.instalar(wt, wt, ['link'])).motivo, /sai do worktree: link/);
    assert.match((await dep.instalar(wt, wt, ['../x'])).motivo, /fora da forma/);
    assert.match(validarContrato({ ...contrato, instalarEm: ['../fora'] }, PROJETO).join(' '), /instalarEm inválido/);
    assert.match(validarContrato({ ...contrato, instalarEm: ['/abs'] }, PROJETO).join(' '), /instalarEm inválido/);
    assert.deepEqual(validarContrato({ ...contrato, instalarEm: ['servico-upload', 'e2e'] }, PROJETO), []);
  } finally { await fs.rm(wt, { recursive: true, force: true }); await fs.rm(fora, { recursive: true, force: true }); }
});

// ---------- item 9: reserva vista pela vigília e pelo despacho ----------

test('item 9: carta reservada por outra sessão viva é recusada no despacho manual e pulada pela vigília', async () => {
  const c = await cenario({ cartas: 2 });
  const sessao = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  try {
    c.soltar();
    const [a] = c.cards;
    const r = await c.reservas.reservar({ cartaId: a.id, carta: 'PAINEL-10', projetoId: PROJETO, quem: 'CODEX', pid: sessao.pid });
    assert.ok(r.reserva);
    const item = (await c.servico.fila()).itens.find(x => x.id === a.id);
    assert.equal(item.elegivel, false);
    assert.equal(item.reservadaPor, 'CODEX');
    await assert.rejects(c.servico.validarDespacho(a.id, 'testes', T0), /carta reservada por outra sessão: PAINEL-10 reservada por CODEX/);
    // Sob a trava, mesmo se a fila não tivesse visto (reserva nascida entre a checagem e a reserva da frota).
    await assert.rejects(c.estado.reservar({ cartaId: a.id, agente: 'x', chaveIdempotencia: randomUUID() }),
      e => e.semReserva && /carta reservada por outra sessão/.test(e.message));
    const livro = { iso: () => T0, tentativas24h: async () => 0, anotar: async () => {} };
    const passo = new PassoVigilia({ servico: c.servico, play: { ligado: async () => true }, registrarLog: () => {}, livro, memoria: new Map() });
    const nota = await passo.projeto({ plane: PROJETO }, { usuarioId: '7' });
    assert.equal(nota.proximaCarta, 'PAINEL-11', 'a vigília pula a reservada e despacha a outra');
    assert.deepEqual(c.executados, ['PAINEL-11']);
    assert.equal(await c.estado.lerLease(a.id), null);
  } finally { sessao.kill('SIGKILL'); await c.limpar(); }
});
