// Item 9 da F4 (dono, 31/10/2026: "como evitar double work?"): reserva de carta por sessão — o lease local, a rota sem SSO
// (loopback + processo conferido no /proc), o comentário RESERVA/v1, a mesa e o droid do Hangar. Nada de Plane real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ReservasCarta, sessaoAncestral, VALIDADE_RESERVA_MS } from '../orquestrador/reservas.js';
import { ReservaServico, recusarReservadaNaMesa } from '../orquestrador/reserva-servico.js';
import { pidDoCliente } from '../orquestrador/peer-loopback.js';
import { servirComFalsos } from './painel-falso.js';

const PAINEL = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const T0 = Date.parse('2026-10-31T12:00:00Z');
const viver = () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
const linhas = async dir => (await fs.readFile(path.join(dir, 'reservas', 'reservas.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);

test('reserva: outra sessão viva recusa; morta ou vencida é tomada com motivo no diário; lease da frota recusa; só a dona solta', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reservas-'));
  let agora = T0;
  const r = new ReservasCarta({ diretorioEstado: dir, agora: () => agora });
  const [a, b] = [viver(), viver()];
  try {
    const primeira = await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', projetoId: PAINEL, quem: 'CLAUDE_CODE', pid: a.pid, sessao: 's1' });
    assert.equal(primeira.reserva.validaAte, new Date(T0 + VALIDADE_RESERVA_MS).toISOString());
    assert.match((await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', quem: 'CODEX', pid: b.pid })).recusa, /reservada por CLAUDE_CODE/);
    assert.match((await r.ocupadaPorOutro(CARTA)).motivo, /PAINEL-99 reservada por CLAUDE_CODE \(pid \d+\)/);
    assert.equal(await r.ocupadaPorOutro(CARTA, { pid: a.pid }), null, 'a própria sessão não se bloqueia');
    agora += 60_000;
    const renovada = await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', quem: 'CLAUDE_CODE', pid: a.pid });
    assert.equal(renovada.renovada, true);
    assert.equal(renovada.reserva.desde, primeira.reserva.desde);
    assert.match((await r.soltar({ cartaId: CARTA, carta: 'PAINEL-99', pid: b.pid })).recusa, /só ela solta/);
    a.kill('SIGKILL');
    await new Promise(res => a.once('exit', res));
    assert.equal(await r.ocupadaPorOutro(CARTA), null, 'pid morto = livre');
    assert.ok((await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', quem: 'CODEX', pid: b.pid })).reserva);
    agora += VALIDADE_RESERVA_MS + 1;
    assert.equal(await r.ocupadaPorOutro(CARTA), null, 'vencida = livre');
    assert.deepEqual((await linhas(dir)).map(x => [x.tipo, x.motivo ?? null]),
      [['RESERVA', null], ['RENOVADA', null], ['TOMADA', 'processo da sessão morto'], ['RESERVA', null]]);
    assert.equal((await r.soltar({ cartaId: CARTA, carta: 'PAINEL-99', pid: b.pid })).solta, true);
    await fs.mkdir(path.join(dir, 'orquestracao', 'leases'), { recursive: true });
    await fs.writeFile(path.join(dir, 'orquestracao', 'leases', `${CARTA}.json`), '{}');
    assert.match((await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', quem: 'CODEX', pid: b.pid })).recusa, /tentativa da frota/);
    await fs.writeFile(r.caminho(CARTA), '{ quebrado');
    assert.match((await r.ocupadaPorOutro(CARTA)).motivo, /ilegível/, 'ilegível = ocupada');
  } finally { a.kill('SIGKILL'); b.kill('SIGKILL'); await fs.rm(dir, { recursive: true, force: true }); }
});

test('reserva: pid reaproveitado não herda a reserva (o início do processo tem de bater)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reservas-pid-'));
  let inicio = '1000';
  const r = new ReservasCarta({ diretorioEstado: dir, inicio: async () => inicio });
  try {
    await r.reservar({ cartaId: CARTA, carta: 'PAINEL-99', quem: 'CODEX', pid: 4242 });
    assert.ok(await r.ocupadaPorOutro(CARTA));
    inicio = '2000';
    assert.equal(await r.ocupadaPorOutro(CARTA), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('reserva: o pid do socket cliente sai do /proc e a CLI ancestral é achada pelo nome do executável', async () => {
  const s = http.createServer(async (req, res) => res.end(String(await pidDoCliente(req.socket))));
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/`);
    assert.equal(Number(await r.text()), process.pid);
  } finally { s.closeAllConnections(); s.close(); }
  const proc = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-'));
  try {
    const gravar = async (pid, ppid, exe) => { await fs.mkdir(path.join(proc, String(pid)));
      await fs.writeFile(path.join(proc, String(pid), 'stat'), `${pid} (x y) S ${ppid} 0 0`);
      await fs.writeFile(path.join(proc, String(pid), 'cmdline'), `${exe}\0--flag\0`); };
    await gravar(300, 200, '/usr/bin/node'); await gravar(200, 100, '/bin/bash'); await gravar(100, 1, '/opt/codex/bin/codex');
    assert.deepEqual(await sessaoAncestral(300, { raizProc: proc }), { quem: 'CODEX', pid: 100 });
    await fs.writeFile(path.join(proc, '100', 'cmdline'), '/usr/bin/zsh\0');
    assert.equal(await sessaoAncestral(300, { raizProc: proc }), null);
  } finally { await fs.rm(proc, { recursive: true, force: true }); }
});

// Plane falso mínimo para a resolução de SIGLA-N pela chave Guest.
const consultar = async url => {
  if (url === '/work-items/PAINEL-99/') return { id: CARTA, project: PAINEL, state: { group: 'unstarted' } };
  if (url === `/projects/${PAINEL}/work-items/${CARTA}/`) return { id: CARTA, updated_at: '2026-10-31T11:00:00Z' };
  throw new Error(`consulta inesperada ${url}`);
};

test('reserva: com sessão de CLI dona da reserva viva, o painel comenta RESERVA/v1 pela identidade e põe em In Progress', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reservas-svc-'));
  const sessao = viver();
  try {
    const reservas = new ReservasCarta({ diretorioEstado: dir });
    const { reserva } = await reservas.reservar({ cartaId: CARTA, carta: 'PAINEL-99', projetoId: PAINEL, quem: 'CODEX', pid: sessao.pid });
    const escritas = [];
    const identidade = () => ({ escritorReserva: async x => { escritas.push(['comentario', x.html, x.externalId]); return 'c1'; },
      escritorEstado: async x => { escritas.push(['estado', x.grupo, x.versaoCarta]); return { estadoNome: 'In Progress' }; } });
    const svc = new ReservaServico({ consultar, reservas, identidade, pidDoCliente: async () => 1, sessaoAncestral: async () => ({ quem: 'CODEX', pid: sessao.pid }) });
    const r = await svc.comentar({ quem: 'CODEX', pid: sessao.pid }, { carta: 'PAINEL-99', acao: 'reservar', reserva: reserva.id });
    assert.deepEqual([r.comentado, r.estado], [true, 'In Progress']);
    assert.match(escritas[0][1], /^<p>RESERVA\/v1 CODEX<\/p>/);
    assert.equal(escritas[0][2], `reserva-${reserva.id}`);
    assert.deepEqual(escritas[1], ['estado', 'started', '2026-10-31T11:00:00Z']);
    await assert.rejects(svc.comentar({ quem: 'CLAUDE_CODE', pid: process.pid }, { carta: 'PAINEL-99', acao: 'reservar', reserva: reserva.id }),
      e => e.status === 409, 'outra sessão não comenta a reserva alheia');
    const semIdentidade = new ReservaServico({ consultar, reservas, identidade: () => null });
    assert.match((await semIdentidade.comentar({ quem: 'CODEX', pid: sessao.pid }, { carta: 'PAINEL-99', acao: 'reservar', reserva: reserva.id })).aviso, /só o lease local/);
    // A mesa (decisão do dono) recusa carta reservada por outra sessão, depois do preparar dela.
    const mesa = recusarReservadaNaMesa({ preparar: async () => ({ confirmacaoId: 'x' }), confirmar: async () => ({}) }, svc);
    await assert.rejects(mesa.preparar({ carta: 'PAINEL-99' }, {}), e => e.status === 409 && /reservada por outra sessão/.test(e.message));
    await reservas.soltar({ cartaId: CARTA, carta: 'PAINEL-99', pid: sessao.pid });
    assert.deepEqual(await mesa.preparar({ carta: 'PAINEL-99' }, {}), { confirmacaoId: 'x' });
  } finally { sessao.kill('SIGKILL'); await fs.rm(dir, { recursive: true, force: true }); }
});

test('rota de reserva: a borda e o navegador recebem 403 sem ler o corpo nem gravar; processo fora de CLI, 403; GET resolve', async () => {
  let peer = null;
  const s = await servirComFalsos({ ambiente: { ORQ_OWNER_USER_ID: '1' }, externos: { consultarPlane: consultar,
    pidDoCliente: async () => peer, sessaoAncestral: async pid => (pid === 777 ? { quem: 'CLAUDE_CODE', pid: 777 } : null) } });
  try {
    const antes = await fs.readdir(s.diretorio, { recursive: true });
    const corpo = JSON.stringify({ carta: 'PAINEL-99', acao: 'reservar', reserva: CARTA });
    const json = { 'content-type': 'application/json' };
    for (const cabecalhos of [{ ...json, host: 'painel.vpn.astargne.com' }, { ...json, origin: `http://127.0.0.1:${s.porta}` },
      { ...json, 'sec-fetch-site': 'same-origin' }, { ...json, cookie: 'astargne_session=x' }]) {
      const r = await s.pedir('POST', '/api/orquestracao/reservas', { cabecalhos, corpo });
      assert.ok([403, 421].includes(r.status), `${JSON.stringify(cabecalhos)} → ${r.status}`);
    }
    peer = 555;
    assert.equal((await s.pedir('POST', '/api/orquestracao/reservas', { cabecalhos: json, corpo })).status, 403, 'processo sem CLI ancestral');
    assert.deepEqual(await fs.readdir(s.diretorio, { recursive: true }), antes, 'recusa não grava nada');
    peer = 777;
    const semLease = await s.pedir('POST', '/api/orquestracao/reservas', { cabecalhos: json, corpo });
    assert.deepEqual([semLease.status, semLease.corpo.erro], [409, 'reserva local ausente ou de outra sessão; rode o script de reserva']);
    const g = await s.pedir('GET', '/api/orquestracao/reservas?carta=PAINEL-99');
    assert.deepEqual([g.status, g.corpo.cartaId, g.corpo.reservada], [200, CARTA, false]);
    assert.equal((await s.pedir('GET', '/api/orquestracao/reservas?carta=XYZ-1')).status, 422);
    assert.equal((await s.pedir('PUT', '/api/orquestracao/reservas', { cabecalhos: json, corpo })).status, 405);
  } finally { await s.fechar(); }
});
