// Selo de sessão do cabeçalho (31/10/2026): diz de quem é a sessão SSO sem autorizar nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SessaoPainel } from '../orquestrador/sessao-painel.js';
import { ErroAcesso } from '../orquestrador/erro-acesso.js';

const TOKEN = 'a'.repeat(43);
const OUTRO = 'b'.repeat(43);
const cookie = t => `x=1; astargne_session=${t}`;

test('sem cookie não consulta o central; dono e outra conta saem com nome e e-mail', async () => {
  const chamadas = [];
  const s = new SessaoPainel({ proprietarioId: '1', identificar: async t => { chamadas.push(t); return t === TOKEN
    ? { id: '1', nome: 'Matheus', email: 'dono@exemplo' } : { id: '4', nome: 'astargne', email: 'outra@exemplo' }; } });
  assert.deepEqual(await s.ler(undefined), { estado: 'sem-sessao' });
  assert.deepEqual(await s.ler('x=1'), { estado: 'sem-sessao' });
  assert.deepEqual(chamadas, []);
  assert.deepEqual(await s.ler(cookie(TOKEN)), { estado: 'dono', nome: 'Matheus', email: 'dono@exemplo' });
  assert.deepEqual(await s.ler(cookie(OUTRO)), { estado: 'outra-conta', nome: 'astargne', email: 'outra@exemplo' });
});

test('guarda 60 s por cookie; expirada fica guardada, indisponível não', async () => {
  let t = 0; let n = 0; let modo = 'ok';
  const s = new SessaoPainel({ proprietarioId: '1', agora: () => t, identificar: async () => {
    n++;
    if (modo === '401') throw new ErroAcesso('sessão inválida ou expirada', 401);
    if (modo === '502') throw new ErroAcesso('verificação de sessão indisponível', 502);
    return { id: '1', nome: 'M', email: 'e' };
  } });
  await s.ler(cookie(TOKEN)); await s.ler(cookie(TOKEN));
  assert.equal(n, 1);
  t = 60_000; modo = '502';
  assert.deepEqual(await s.ler(cookie(TOKEN)), { estado: 'indisponivel' });
  assert.deepEqual(await s.ler(cookie(TOKEN)), { estado: 'indisponivel' });
  assert.equal(n, 3, 'indisponível tenta de novo');
  modo = '401';
  assert.deepEqual(await s.ler(cookie(TOKEN)), { estado: 'expirada' });
  assert.deepEqual(await s.ler(cookie(TOKEN)), { estado: 'expirada' });
  assert.equal(n, 4);
});

// ---------- portão da borda (PAINEL-64): lerParaEntrada ----------

const dono = async () => ({ id: '1', nome: 'M', email: 'e' });

test('entrada: dono com 60 s a 5 min passa e revalida UMA vez ao fundo; aos 5 min a verificação é bloqueante', async () => {
  let t = 0; let n = 0; let soltar = null;
  const s = new SessaoPainel({ proprietarioId: '1', agora: () => t, identificar: async () => {
    n++;
    if (n === 1) return dono();
    await new Promise(r => { soltar = r; });
    throw new ErroAcesso('sessão inválida ou expirada', 401);
  } });
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono');
  t = 59_999;
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono');
  assert.equal(n, 1, 'fresca não consulta');
  t = 60_000;
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono', 'velha tolerada passa na hora');
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono');
  assert.equal(n, 2, 'uma revalidação só, mesmo com dois pedidos');
  // O selo (ler) não tolera a velha: espera a MESMA verificação em voo, sem abrir outra.
  const selo = s.ler(cookie(TOKEN));
  await new Promise(r => setImmediate(r));
  assert.equal(n, 2);
  soltar();
  assert.deepEqual(await selo, { estado: 'expirada' });
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'expirada', 'o "não" do central vale na hora para o portão');
});

test('entrada: a idade conta do INÍCIO da verificação e indisponível não renova a entrada', async () => {
  let t = 0; let modo = 'ok'; let n = 0;
  const s = new SessaoPainel({ proprietarioId: '1', agora: () => t, identificar: async () => {
    n++;
    if (modo === '502') throw new ErroAcesso('verificação de sessão indisponível', 502);
    t += 15_000; // o ssh demorou 15 s
    return dono();
  } });
  await s.lerParaEntrada(cookie(TOKEN)); // começou em 0, terminou em 15 s
  t = 60_000;
  assert.equal(n, 1);
  await s.lerParaEntrada(cookie(TOKEN));
  await new Promise(r => setImmediate(r));
  assert.equal(n, 2, 'aos 60 s do início já revalida, embora só 45 s depois do fim');
  // A revalidação acima começou em 60 s. Daqui em diante o central some.
  modo = '502';
  t = 60_000 + 299_999;
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono', 'ainda dentro dos 5 min da última verificação boa');
  await new Promise(r => setImmediate(r));
  t = 60_000 + 300_000;
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'indisponivel', 'aos 5 min a entrada morre: falha fechada');
});

test('entrada: relógio que anda para trás conta como vencida (não como fresca para sempre)', async () => {
  let t = 3_600_000; let n = 0;
  const s = new SessaoPainel({ proprietarioId: '1', agora: () => t, identificar: async () => { n++; return dono(); } });
  await s.lerParaEntrada(cookie(TOKEN));
  t = 0; // NTP recuou uma hora
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono');
  assert.equal(n, 2, 'idade negativa verifica de novo');
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono');
  assert.equal(n, 2, 'e a entrada nova, com o relógio de agora, volta a valer');
});

test('entrada: pedidos simultâneos do mesmo cookie abrem um ssh só; a entrada em voo sai mesmo quando dá indisponível', async () => {
  let n = 0; let modo = '502';
  const s = new SessaoPainel({ proprietarioId: '1', identificar: async () => {
    n++;
    await new Promise(r => setImmediate(r));
    if (modo === '502') throw new ErroAcesso('verificação de sessão indisponível', 502);
    return dono();
  } });
  const todos = await Promise.all(Array.from({ length: 8 }, () => s.lerParaEntrada(cookie(TOKEN))));
  assert.deepEqual([...new Set(todos.map(v => v.estado))], ['indisponivel']);
  assert.equal(n, 1);
  modo = 'ok';
  assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono', 'o pedido seguinte consulta de novo');
  assert.equal(n, 2);
});

test('entrada: erro que não é ErroAcesso (bug no verificador) vira indisponível, nunca rejeição solta', async () => {
  let t = 0; let quebrar = true;
  const s = new SessaoPainel({ proprietarioId: '1', agora: () => t, identificar: async () => { if (quebrar) throw new TypeError('bug'); return dono(); } });
  assert.deepEqual(await s.lerParaEntrada(cookie(TOKEN)), { estado: 'indisponivel' });
  quebrar = false;
  await s.lerParaEntrada(cookie(TOKEN));
  t = 60_000; quebrar = true;
  const soltas = [];
  const ouvir = e => soltas.push(e);
  process.on('unhandledRejection', ouvir);
  try {
    assert.equal((await s.lerParaEntrada(cookie(TOKEN))).estado, 'dono', 'a revalidação ao fundo falha em silêncio');
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(soltas, []);
  } finally { process.off('unhandledRejection', ouvir); }
});

test('entrada: no máximo 4 verificações ao mesmo tempo (o excedente dá indisponível sem ssh) e o despejo poupa a entrada em uso', async () => {
  let n = 0; let soltar = [];
  const lento = new SessaoPainel({ proprietarioId: '1', identificar: async () => { n++; await new Promise(r => soltar.push(r)); return dono(); } });
  const tk = i => cookie(String(i).padStart(43, 'x'));
  const pedidos = Array.from({ length: 6 }, (_, i) => lento.lerParaEntrada(tk(i)));
  await new Promise(r => setImmediate(r));
  assert.equal(n, 4);
  soltar.forEach(r => r());
  assert.deepEqual((await Promise.all(pedidos)).map(v => v.estado), ['dono', 'dono', 'dono', 'dono', 'indisponivel', 'indisponivel']);

  let consultas = 0;
  const s = new SessaoPainel({ proprietarioId: '1', identificar: async t => { consultas++; return { id: t === TOKEN ? '1' : '4', nome: 'x', email: 'y' }; } });
  await s.lerParaEntrada(cookie(TOKEN));
  for (let i = 0; i < 60; i++) {
    await s.lerParaEntrada(tk(i));
    await s.lerParaEntrada(cookie(TOKEN)); // o dono segue usando o painel
  }
  assert.equal(consultas, 61, 'a entrada do dono nunca foi despejada pelas 60 de outros cookies');
  assert.ok(s.guardadas.size <= 50);
});

test('cookie de sessão duplicado tem estado próprio e não consulta o central; o selo devolve só estado, nome e e-mail', async () => {
  let n = 0;
  const s = new SessaoPainel({ proprietarioId: '1', identificar: async () => { n++; return { id: '1', nome: 'M', email: 'e', extra: 'não vaza' }; } });
  assert.deepEqual(await s.lerParaEntrada(`astargne_session=${TOKEN}; astargne_session=${OUTRO}`), { estado: 'cookie-ambiguo' });
  assert.deepEqual(await s.ler(`astargne_session=${TOKEN}; astargne_session=${TOKEN}`), { estado: 'cookie-ambiguo' });
  assert.deepEqual(await s.lerParaEntrada(`astargne_session=${'a'.repeat(9000)}`), { estado: 'cookie-ambiguo' });
  assert.deepEqual(await s.lerParaEntrada('astargne_session=curto'), { estado: 'sem-sessao' });
  assert.equal(n, 0);
  await s.lerParaEntrada(cookie(TOKEN));
  assert.deepEqual(Object.keys(await s.ler(cookie(TOKEN))).sort(), ['email', 'estado', 'nome']);
});
