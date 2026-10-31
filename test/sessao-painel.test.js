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
