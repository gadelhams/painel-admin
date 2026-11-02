// F4b da frota (PAINEL-54): gate do zelador (J58, J59, J72), sandbox bwrap (J60), despacho do Hangar inteiro em round-robin com teto
// global (item 6) e a reserva de carta respeitada pelo zelador (item 9). Plane, CLIs e executor falsos; o bwrap é o de verdade
// (/usr/bin/bwrap), com um HOME falso e uma chave de mentira — nenhuma chave real é lida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { SandboxCli, BWRAP_PADRAO } from '../orquestrador/sandbox-cli.js';
import { ProcessoCli } from '../orquestrador/processo-cli.js';
import { criarExecutorCli } from '../orquestrador/executor-cli.js';
import { prepararPlanoFrota } from '../orquestrador/modelos.js';
import { validarContrato } from '../orquestrador/politica.js';
import { lerGatesDoCanal, codificarGate, autorDoProjeto, autorZelador } from '../orquestrador/gate-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { criarElegibilidadeGateZelador } from '../orquestrador/zelador-gate.js';
import { ZELADOR_ATOR, digitalDaCarta } from '../orquestrador/zelador-politica.js';
import { criarEscritorZelador } from '../orquestrador/escritor-zelador-plane.js';
import { TravaDisco } from '../orquestrador/trava.js';
import { uuidV5 } from '../orquestrador/uuid.js';
import { montarIdentidadesEscrita } from '../orquestrador/identidades-escrita.js';
import { montarF4b, PAINEL, CAD, AUTOR } from './fixtures/frota-f4b.js';
import { criarPlaneFalso } from './fixtures/zelador/plane-falso.js';
import { ADMIN, decidir } from './fixtures/frota-preparo.js';

const run = promisify(execFile);
const COM_BWRAP = existsSync(BWRAP_PADRAO);
const DESCRICAO = '<p>Escopo: exportar CSV. Aceite: suíte verde.</p><p>Sem dependências.</p>';
const H = 3 * 60 * 60_000;
const pronta = (...cartas) => () => ({ vereditos: cartas.map(c => ({ carta: `PAINEL-${c.sequence_id}`, veredito: 'PRONTA',
  comentario: 'Escopo e aceite escritos; o estado do projeto confirma (docs/current.md).', evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }] })) });
const veredito = async (c, carta) => (await c.lerDiario()).find(l => l.tipo === 'VEREDITO' && l.carta === `PAINEL-${carta.sequence_id}`);

// Um cenário com uma carta pronta: o job do zelador roda depois de `preparar` mexer no Plane.
async function jobComPronta({ preparar = () => {}, responderTambem = null, sandboxOk = true } = {}) {
  let alvo;
  const c = await montarF4b({ comCad: false, sandboxOk, responder: (entrada, ctx) => { responderTambem?.(ctx, alvo); return pronta(alvo)(); } });
  await c.play.alternar(PAINEL.plane, true, '1');
  alvo = c.plane.novaCarta({ nome: 'Pronta', descricao: DESCRICAO });
  await preparar(c, alvo);
  c.avancar(H);
  const job = await c.zelador.rodarUmaVez();
  return { c, alvo, job, v: await veredito(c, alvo) };
}

// ---------- J58 ----------

test('J58: o zelador não marca gate em carta cuja trava ele mesmo levantou, até o dono reconhecer (DECISAO/v1)', async () => {
  const tirou = (c, carta) => c.plane.atividade(carta.id, { field: 'labels', old_value: 'ASTARGNE', new_value: '', old_identifier: c.plane.label('ASTARGNE').id, actor: ZELADOR_ATOR });
  const semReconhecer = await jobComPronta({ preparar: tirou });
  try {
    assert.equal(semReconhecer.v.resultado, 'MANTER', JSON.stringify(semReconhecer.v));
    assert.match(semReconhecer.v.motivo, /ASTARGNE tirada pelo zelador; o zelador não marca gate até o dono reconhecer/);
    assert.deepEqual(semReconhecer.alvo.labels, []);
  } finally { await semReconhecer.c.limpar(); }
  // W3 (PAINEL-62): só a decisão da mesa, da autoria do Painel Admin configurado, destrava.
  const anterior = process.env.PLANE_ADMIN_ACTOR_ID;
  process.env.PLANE_ADMIN_ACTOR_ID = ADMIN;
  try {
    const reconhecida = await jobComPronta({ preparar: (c, carta) => {
      tirou(c, carta);
      c.avancar(60_000);
      decidir(c, carta);
      c.avancar(25 * 60 * 60_000); // o comentário da mesa sai da janela das 2 h de outro ator
    } });
    try { assert.equal(reconhecida.v.resultado, 'APLICADO', JSON.stringify(reconhecida.v)); } finally { await reconhecida.c.limpar(); }
  } finally { if (anterior === undefined) delete process.env.PLANE_ADMIN_ACTOR_ID; else process.env.PLANE_ADMIN_ACTOR_ID = anterior; }
});

test('J58: dependência fechada pelo zelador também é trava levantada por ele (a lavagem em duas passadas)', async () => {
  const r = await jobComPronta({ preparar: (c, carta) => {
    const dep = c.plane.novaCarta({ nome: 'Dependência', estadoNome: 'Done' });
    c.plane.relacionar(carta, dep);
    carta.description_html = `<p>Escopo: exportar CSV. Aceite: suíte verde.</p><p>Depende de: PAINEL-${dep.sequence_id}</p>`;
    c.plane.atividade(dep.id, { field: 'state', old_value: 'Todo', new_value: 'Done', new_identifier: c.plane.estado('Done').id, actor: ZELADOR_ATOR });
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /dependência PAINEL-\d+ fechada pelo zelador/);
  } finally { await r.c.limpar(); }
});

// ---------- J59 ----------

test('J59: PRONTA do LLM é proposta — a prontidão ao vivo recusa a dependência aberta que nasceu depois do retrato', async () => {
  const r = await jobComPronta({ responderTambem: ({ plane }, alvo) => {
    const aberta = plane.novaCarta({ nome: 'Ainda aberta' });
    plane.relacionar(alvo, aberta);
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /prontidão ao vivo recusou/);
    assert.deepEqual(r.alvo.labels, []);
  } finally { await r.c.limpar(); }
});

test('J59: ancestral com ASTARGNE (épico travado) segura o gate do zelador na folha', async () => {
  const r = await jobComPronta({ preparar: (c, carta) => {
    const epico = c.plane.novaCarta({ nome: 'Épico', etiquetas: ['ASTARGNE'] });
    carta.parent = epico.id;
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /trava no ancestral: ancestral PAINEL-\d+ com ASTARGNE/);
  } finally { await r.c.limpar(); }
});

test('J59: chave do GATE determinística (UUIDv5 de carta + gate + digital) e recibo com a fonte do zelador', async () => {
  const r = await jobComPronta();
  try {
    assert.equal(r.v.resultado, 'APLICADO', JSON.stringify(r.v));
    const recibo = r.c.plane.comentarios.get(r.alvo.id).find(x => x.external_source === 'zelador-gate-v1');
    // A digital de antes: sem a etiqueta nova e sem comentários alheios (o recibo é do próprio zelador).
    const digital = digitalDaCarta({ ...r.alvo, labels: [] }, r.c.plane.comentarios.get(r.alvo.id));
    assert.equal(recibo.external_id, uuidV5(`${r.alvo.id}|READY TO DEV|${digital}`));
    assert.equal(recibo.actor, ZELADOR_ATOR);
  } finally { await r.c.limpar(); }
});

test('J59: autores por gate — o zelador só vale em READY TO DEV e cada autor só com a sua fonte', () => {
  const projetoId = PAINEL.plane;
  const cartaId = randomUUID();
  const html = gate => codificarGate({ projetoId, cartaId, chaveIdempotencia: randomUUID(), versaoCarta: '2026-10-31T10:00:00Z', gate,
    justificativa: 'Escopo e dependências revisados.', evidencias: ['Sem dependências formais.'] });
  const de = (actor, external_source, gate) => normalizarInteracao({ id: randomUUID(), actor, created_at: '2026-10-31T10:00:00Z', edited_at: null, external_source, comment_html: html(gate) });
  const autores = [autorDoProjeto(AUTOR[projetoId]), autorZelador(ZELADOR_ATOR)];
  const { gates, ignorados } = lerGatesDoCanal([
    de(ZELADOR_ATOR, 'zelador-gate-v1', 'READY TO DEV'),
    de(ZELADOR_ATOR, 'zelador-gate-v1', 'READY TO TEST'),
    de(ZELADOR_ATOR, 'orquestrador-gate-v1', 'READY TO DEV'),
    de(AUTOR[projetoId], 'zelador-gate-v1', 'READY TO DEV'),
    de(AUTOR[projetoId], 'orquestrador-gate-v1', 'READY TO TEST'),
  ], { projetoId, cartaId, autores });
  assert.deepEqual(gates.map(g => [g.autorId === ZELADOR_ATOR ? 'zelador' : 'projeto', g.gate, g.origemGate]),
    [['zelador', 'READY TO DEV', 'zelador'], ['projeto', 'READY TO TEST', 'dono']]);
  assert.deepEqual(ignorados.map(x => x.motivo).sort(), ['fonte externa fora da lista', 'fonte externa fora da lista', 'gate fora do que este autor pode marcar']);
});

test('J59: o recibo de um autor não legitima a etiqueta posta pelo outro (zelador × identidade do projeto)', async () => {
  const c = await montarF4b({ comCad: false });
  try {
    await c.play.alternar(PAINEL.plane, true, '1');
    const carta = c.plane.novaCarta({ nome: 'Misturada', descricao: DESCRICAO });
    c.gateDe(c.plane, carta, { autor: ZELADOR_ATOR, fonte: 'zelador-gate-v1' });
    // A etiqueta atual foi tirada e reposta pela identidade técnica do projeto, sem recibo dela.
    const dev = c.plane.label('READY TO DEV');
    c.avancar(60_000);
    c.plane.atividade(carta.id, { field: 'labels', old_value: 'READY TO DEV', new_value: '', old_identifier: dev.id, actor: AUTOR[PAINEL.plane] });
    c.avancar(60_000);
    c.plane.atividade(carta.id, { field: 'labels', old_value: '', new_value: 'READY TO DEV', new_identifier: dev.id, actor: AUTOR[PAINEL.plane] });
    const item = (await c.servico.fila()).itens.find(x => x.id === carta.id);
    assert.equal(item.elegivel, false);
    assert.match(item.provenienciaGate, /etiqueta atual posta antes de qualquer recibo válido/);
  } finally { await c.limpar(); }
});

test('J59: o escritor de gate do zelador nasce sem remover', async () => {
  const e = await escritorDoZelador();
  try {
    await assert.rejects(e.escritor.marcarGate({ projetoId: e.plane.projetoId, cartaId: randomUUID(), chaveIdempotencia: randomUUID(), versaoCarta: '2026-10-31T10:00:00Z',
      justificativa: 'Escopo e aceite escritos.', evidencias: ['arquivo docs/current.md'], remover: 'READY TO DEV' }), /nunca remover/);
  } finally { await e.limpar(); }
});

// ---------- J72 ----------

async function escritorDoZelador(opcoes = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-f4b-esc-'));
  const plane = criarPlaneFalso({ projetoId: PAINEL.plane, sigla: 'PAINEL', agora: Date.now });
  const arquivoChave = path.join(dir, 'zelador.token');
  await fs.writeFile(arquivoChave, `${plane.chave}\n`, { mode: 0o600 });
  const escritor = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave, fetchImpl: plane.fetchImpl, apiBase: 'http://plane.falso', ...opcoes });
  return { dir, plane, arquivoChave, escritor, limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('J72: o gate do zelador sob a trava tem teto por chamada — o POST pendurado aborta e a trava fica livre', async () => {
  const e = await escritorDoZelador();
  try {
    const carta = e.plane.novaCarta();
    const original = e.plane.fetchImpl;
    const pendurado = (url, op = {}) => (op.method === 'POST'
      ? new Promise((_, rejeitar) => op.signal?.addEventListener('abort', () => rejeitar(new Error('abortado pelo teto'))))
      : original(url, op));
    const escritor = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: e.arquivoChave, fetchImpl: pendurado, apiBase: 'http://plane.falso', timeoutSobTravaMs: 50 });
    const trava = new TravaDisco(e.dir);
    const corrida = escritor.marcarGate({ projetoId: PAINEL.plane, cartaId: carta.id, chaveIdempotencia: randomUUID(), versaoCarta: carta.updated_at,
      justificativa: 'Escopo e aceite escritos.', evidencias: ['arquivo docs/current.md'], sobTrava: a => trava.segurar(a) });
    const resultado = await Promise.race([corrida.then(() => 'ok', erro => `erro: ${erro.message}`), new Promise(r => setTimeout(() => r('pendurado após 2 s'), 2000))]);
    assert.match(resultado, /^erro: /);
    assert.equal(await trava.segurar(async () => 'livre'), 'livre');
    assert.deepEqual(carta.labels, []);
  } finally { await e.limpar(); }
});

// ---------- chave do zelador × orquestradores ----------

test('F4b: o zelador recusa chave ou ator iguais aos de um orquestrador do catálogo (também os de outra pasta e do .env)', async () => {
  const e = await escritorDoZelador();
  try {
    const outra = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-f4b-chaves-'));
    await fs.writeFile(path.join(outra, 'orquestrador-painel.token'), `${e.plane.chave}\n`, { mode: 0o600 });
    const escrita = montarIdentidadesEscrita({ projetos: [PAINEL], proprietarioId: '7', diretorio: outra,
      fabricas: { handoff: () => async () => {}, gate: () => async () => {}, estado: () => async () => {} } });
    const igual = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: e.arquivoChave, fetchImpl: e.plane.fetchImpl, apiBase: 'http://plane.falso',
      identidadesProibidas: () => escrita.chavesEAtores() });
    await assert.rejects(igual.conferir(PAINEL.plane), /chave do zelador igual à de um orquestrador do catálogo/);
    const atorIgual = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: e.arquivoChave, fetchImpl: e.plane.fetchImpl, apiBase: 'http://plane.falso',
      identidadesProibidas: async () => ({ hashes: new Set(), atores: new Set([ZELADOR_ATOR]) }) });
    await assert.rejects(atorIgual.conferir(PAINEL.plane), /ator do zelador igual/);
    await fs.writeFile(path.join(outra, 'orquestrador-painel.token'), 'outra-chave-bem-diferente-123\n', { mode: 0o600 });
    assert.equal(await igual.conferir(PAINEL.plane), true);
    await fs.rm(outra, { recursive: true, force: true });
  } finally { await e.limpar(); }
});

// ---------- J60 ----------

async function homeFalso() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-f4b-home-'));
  for (const d of ['.config/plane', '.ssh', '.config/linear', '.local/state/painel-admin/orquestracao']) await fs.mkdir(path.join(home, d), { recursive: true });
  await fs.writeFile(path.join(home, '.config/plane/zelador.token'), 'MENTIRA-chave-do-zelador\n', { mode: 0o600 });
  await fs.writeFile(path.join(home, '.ssh/id_falso'), 'MENTIRA-ssh\n', { mode: 0o600 });
  const repo = path.join(home, 'repo');
  await fs.mkdir(repo);
  await fs.writeFile(path.join(repo, '.env'), 'PLANE_API_KEY=MENTIRA-env\n');
  return { home, repo, estado: path.join(home, '.local/state/painel-admin'), limpar: () => fs.rm(home, { recursive: true, force: true }) };
}

const rodarSob = (sandbox, argumentos, opcoes = {}) => new ProcessoCli({ spawn, env: { PATH: process.env.PATH }, maxSaidaBytes: 64 * 1024, sandbox })
  .rodar({ executavel: process.execPath, argumentos, cwd: opcoes.cwd ?? os.tmpdir(), timeoutMs: 20_000, isolar: { rede: opcoes.rede ?? true, gravaveis: opcoes.gravaveis ?? [] } });

test('J60: o filho sob a sandbox não lê a chave do zelador, ~/.ssh, o .env nem o /proc do painel; o worktree re-ligado continua gravável', { skip: !COM_BWRAP && 'sem /usr/bin/bwrap' }, async () => {
  const f = await homeFalso();
  const segredo = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { env: { SEGREDO_DO_PAINEL: 'MENTIRA-environ' }, stdio: 'ignore' });
  try {
    const worktree = path.join(f.estado, 'orquestracao', 'worktrees', 'PAINEL-1-abc');
    await fs.mkdir(worktree, { recursive: true });
    await fs.writeFile(path.join(f.estado, 'orquestracao', 'play.json'), '{"MENTIRA":"play"}');
    const sandbox = new SandboxCli({ home: f.home, diretorioPainel: f.estado, arquivosEnv: [path.join(f.repo, '.env')] });
    assert.deepEqual(await sandbox.sondar(), { ok: true, motivo: null, em: (await sandbox.sondar()).em });
    const sonda = `const fs = require('node:fs'); const ler = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return 'ERRO:' + e.code; } };
      fs.writeFileSync(${JSON.stringify(path.join(worktree, 'feito.txt'))}, 'ok');
      console.log(JSON.stringify({ token: ler(${JSON.stringify(path.join(f.home, '.config/plane/zelador.token'))}), ssh: ler(${JSON.stringify(path.join(f.home, '.ssh/id_falso'))}),
        env: ler(${JSON.stringify(path.join(f.repo, '.env'))}), play: ler(${JSON.stringify(path.join(f.estado, 'orquestracao', 'play.json'))}),
        environ: ler('/proc/${segredo.pid}/environ') }));`;
    const r = await rodarSob(sandbox, ['-e', sonda], { gravaveis: [worktree] });
    assert.equal(r.codigo, 0, r.stderr);
    assert.equal(r.isolado, true);
    assert.doesNotMatch(r.stdout, /MENTIRA/, 'nada mascarado vaza');
    const lido = JSON.parse(r.stdout);
    assert.equal(lido.token, 'ERRO:ENOENT');
    assert.equal(lido.environ, 'ERRO:ENOENT');
    assert.ok(lido.env === '' || lido.env.startsWith('ERRO:'), `o .env mascarado não se lê: ${lido.env}`);
    assert.equal(await fs.readFile(path.join(worktree, 'feito.txt'), 'utf8'), 'ok');
    // Controle: sem a sandbox o mesmo filho lê a mentira (o teste enxerga o que a máscara tira).
    const semSandbox = await rodarSob(null, ['-e', sonda], { gravaveis: [worktree] });
    assert.match(semSandbox.stdout, /MENTIRA-chave-do-zelador/);
  } finally { segredo.kill('SIGKILL'); await f.limpar(); }
});

test('J60: a sonda sem bwrap falha fechada; o gate do zelador fica inelegível com o motivo e a fila recusa o recibo dele', async () => {
  const semBwrap = new SandboxCli({ bwrap: '/nao/existe/bwrap' });
  assert.deepEqual((await semBwrap.sondar()).ok, false);
  assert.match((await semBwrap.sondar()).motivo, /bwrap ausente em \/nao\/existe\/bwrap/);
  const play = { ligado: async () => true };
  const contrato = async () => ({ contrato: {}, erros: [] });
  const elegivel = criarElegibilidadeGateZelador({ sandbox: semBwrap, play, contrato, identidade: () => ({ autorEscrita: AUTOR[PAINEL.plane] }) });
  assert.deepEqual(await elegivel(PAINEL.plane), { ok: false, motivo: 'sandbox bwrap indisponível (bwrap ausente em /nao/existe/bwrap)', ator: ZELADOR_ATOR });
  const c = await montarF4b({ comCad: false, sandboxOk: false });
  try {
    await c.play.alternar(PAINEL.plane, true, '1');
    const carta = c.plane.novaCarta({ nome: 'Gate do zelador', descricao: DESCRICAO });
    c.gateDe(c.plane, carta, { autor: ZELADOR_ATOR, fonte: 'zelador-gate-v1' });
    const item = (await c.servico.fila()).itens.find(x => x.id === carta.id);
    assert.equal(item.elegivel, false);
    assert.match(item.provenienciaGate, /gate do zelador inelegível: sandbox bwrap indisponível/);
  } finally { await c.limpar(); }
});

test('J60: o executor roda CLIs e aceite sob o bwrap; o aceite sem rede salvo redeNoAceite; gate do zelador sem sandbox é impedido', { skip: !COM_BWRAP && 'sem /usr/bin/bwrap' }, async () => {
  const f = await homeFalso();
  const servidor = http.createServer((_, res) => res.end('alcancado'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const porta = servidor.address().port;
  try {
    const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'executor-cli');
    const bin = path.join(f.home, 'bin');
    await fs.cp(FIXTURES, bin, { recursive: true });
    for (const nome of ['claude-falso', 'codex-falso']) await fs.writeFile(path.join(bin, nome), `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, `${nome}.mjs`)}" "$@"\n`, { mode: 0o755 });
    const repo = path.join(f.home, 'projeto');
    await fs.mkdir(path.join(repo, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'p', scripts: { test: 'node scripts/sonda.mjs' } }));
    await fs.writeFile(path.join(repo, 'scripts', 'sonda.mjs'), `import fs from 'node:fs';
const token = (() => { try { return fs.readFileSync(${JSON.stringify(path.join(f.home, '.config/plane/zelador.token'))}, 'utf8'); } catch (e) { return 'ERRO:' + e.code; } })();
let rede; try { rede = await (await fetch('http://127.0.0.1:${porta}/', { signal: AbortSignal.timeout(3000) })).text(); } catch (e) { rede = 'sem-rede'; }
console.log('SONDA token=' + token.trim() + ' rede=' + rede);\n`);
    const g = (...a) => run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo });
    await g('init', '-q', '-b', 'main'); await g('add', '-A'); await g('commit', '-q', '-m', 'inicial');
    const PROJ = PAINEL.plane;
    const CARTA = randomUUID();
    const contrato = { versao: 1, optIn: true, projetoPlane: PROJ, ambiente: 'offline', tiposTeste: ['unitário'], criteriosAceite: ['sonda'], acoesProibidas: ['deploy'],
      comandos: [{ id: 'sonda', executavel: 'node', argumentos: ['scripts/sonda.mjs'] }],
      agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true },
        { id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }] };
    assert.deepEqual(validarContrato(contrato, PROJ), []);
    assert.deepEqual(validarContrato({ ...contrato, redeNoAceite: 'sim' }, PROJ), ['redeNoAceite inválido (true ou false)']);
    const plano = prepararPlanoFrota(contrato, { versao: 1, hash: '0'.repeat(64), tuplas: {
      orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' }, codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
      validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' } } });
    const consultar = async () => ({ id: CARTA, name: 'Sonda', description_html: '<p>Sem dependências.</p>', labels: [{ name: 'READY TO DEV' }] });
    const estado = path.join(f.estado, 'orquestracao');
    const executorCom = sandbox => criarExecutorCli({ diretorioEstado: estado, consultar, sandbox,
      binarios: { claude: path.join(bin, 'claude-falso'), codex: path.join(bin, 'codex-falso') }, ambienteBase: process.env,
      limites: { minutosIa: 0.5, minutosComando: 0.5, minutosInstalacao: 0.5 }, licoesVivasDir: path.join(f.home, 'sem-licoes') });
    const sandbox = new SandboxCli({ home: f.home, diretorioPainel: f.estado, arquivosEnv: [] });
    const pedido = (c = contrato, extra = {}) => ({ carta: 'PAINEL-99', cartaId: CARTA, projetoId: PROJ, versaoCarta: 'v1', comandoId: 'sonda', comando: c.comandos[0],
      plano, contrato: c, gate: 'READY TO DEV', pasta: repo, tentativaId: randomUUID(), ...extra });
    const logDe = async p => fs.readFile(path.join(estado, 'saidas', p.tentativaId, 'comando-sonda.log'), 'utf8');
    const p1 = pedido();
    const r1 = await executorCom(sandbox).executar(p1);
    assert.equal(r1.resultado, 'concluido', JSON.stringify(r1));
    assert.ok(r1.evidencia.some(e => /sandbox bwrap: chaves/.test(e)));
    const log1 = await logDe(p1);
    assert.match(log1, /SONDA token=ERRO:ENOENT rede=sem-rede/);
    assert.match(log1, /bwrap .*--unshare-net/);
    const registros = (await fs.readdir(bin)).filter(x => x.startsWith('registro-'));
    assert.ok(registros.length >= 2, 'as CLIs falsas rodaram (sob o bwrap, com o worktree e os logs graváveis)');
    const p2 = pedido({ ...contrato, redeNoAceite: true });
    await executorCom(sandbox).executar(p2);
    assert.match(await logDe(p2), /SONDA token=ERRO:ENOENT rede=alcancado/);
    const p3 = pedido(contrato, { origemGate: 'zelador' });
    const r3 = await executorCom(new SandboxCli({ bwrap: '/nao/existe/bwrap' })).executar(p3);
    assert.equal(r3.resultado, 'impedido');
    assert.match(r3.resumo, /gate do zelador exige a sandbox bwrap: bwrap ausente/);
  } finally { servidor.close(); await f.limpar(); }
});

// ---------- item 6: despacho do Hangar inteiro ----------

test('item 6 (J73): round-robin justo entre os projetos com play — quem teve a vez há mais tempo vai primeiro, uma tentativa por passada', async () => {
  const c = await montarF4b({ executar: async pedido => { c.executados.push(pedido.carta); return { resultado: 'rejeitado', resumo: 'Tentativa terminou com a suíte vermelha.', evidencia: ['comando testes: código 1'] }; } });
  try {
    for (const p of [PAINEL, CAD]) await c.play.alternar(p.plane, true, '1');
    for (const p of [PAINEL, CAD]) {
      const pl = c.planes.get(p.plane);
      for (let i = 0; i < 2; i++) { const carta = pl.novaCarta({ nome: `${p.sigla} ${i}`, descricao: DESCRICAO }); c.gateDe(pl, carta, { autor: AUTOR[p.plane] }); }
    }
    const vezes = [];
    for (let i = 0; i < 4; i++) {
      c.avancar(60_000);
      const r = await c.vigilia.varrer();
      assert.equal(r.filter(x => x.tentou).length, 1, JSON.stringify(r));
      vezes.push(c.executados.at(-1).split('-')[0]);
    }
    assert.deepEqual(vezes, ['PAINEL', 'CAD', 'PAINEL', 'CAD']);
  } finally { await c.limpar(); }
});

test('item 6: teto diário do Hangar conta dos diários de todos os projetos', async () => {
  const c = await montarF4b({ tetoDia: 1, executar: async pedido => { c.executados.push(pedido.carta); return { resultado: 'rejeitado', resumo: 'Tentativa terminou com a suíte vermelha.', evidencia: ['comando testes: código 1'] }; } });
  try {
    for (const p of [PAINEL, CAD]) {
      await c.play.alternar(p.plane, true, '1');
      const pl = c.planes.get(p.plane);
      const carta = pl.novaCarta({ nome: p.sigla, descricao: DESCRICAO }); c.gateDe(pl, carta, { autor: AUTOR[p.plane] });
    }
    await c.vigilia.varrer();
    c.avancar(60_000);
    const segunda = await c.vigilia.varrer();
    assert.equal(c.executados.length, 1);
    assert.ok(segunda.every(x => x.motivoOciosa === 'teto diário do Hangar atingido (1/1)'), JSON.stringify(segunda));
  } finally { await c.limpar(); }
});

// ---------- item 9: o zelador respeita a reserva ----------

test('item 9: carta reservada por sessão viva fica intocável para o zelador; reservada no meio da sequência, a mudança aborta sob a trava', async () => {
  let alvo;
  let livre;
  const c = await montarF4b({ comCad: false, responder: () => ({ vereditos: [{ carta: `PAINEL-${livre.sequence_id}`, veredito: 'DONO', labelsTrava: ['TAREFA DONO'],
    comentario: 'Precisa de prova humana em aparelho real antes de seguir.', evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }] }] }) });
  try {
    await c.play.alternar(PAINEL.plane, true, '1');
    alvo = c.plane.novaCarta({ nome: 'Reservada', descricao: DESCRICAO });
    livre = c.plane.novaCarta({ nome: 'Livre', descricao: DESCRICAO });
    await c.reservas.reservar({ cartaId: alvo.id, carta: `PAINEL-${alvo.sequence_id}`, quem: 'CODEX', pid: process.pid });
    // A sessão reserva a carta livre entre a intenção do zelador e a mudança.
    c.plane.falhas.depoisDoComentario = async carta => {
      if (carta.id === livre.id) await c.reservas.reservar({ cartaId: livre.id, carta: `PAINEL-${livre.sequence_id}`, quem: 'CLAUDE_CODE', pid: process.pid });
    };
    c.avancar(H);
    await c.zelador.rodarUmaVez();
    const diario = await c.lerDiario();
    assert.ok(diario.some(l => l.tipo === 'INTOCAVEL' && l.cartaId === alvo.id && /reservada por outra sessão/.test(l.motivo)), JSON.stringify(diario));
    const v = diario.find(l => l.tipo === 'VEREDITO' && l.carta === `PAINEL-${livre.sequence_id}`);
    assert.equal(v.resultado, 'ABORTADO', JSON.stringify(v));
    assert.match(v.motivo, /carta reservada por outra sessão/);
    assert.deepEqual(livre.labels, [], 'a etiqueta não foi posta');
  } finally { await c.limpar(); }
});
