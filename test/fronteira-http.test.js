// Fronteira HTTP do painel MONTADO (PAINEL-17): o handler de produção de montagem.js atrás de
// um http.Server de verdade numa porta efêmera, atacado por requisição real. Só as portas
// externas (ssh, Plane, SSO, LLM, voz, CLI) são falsas. Mutação nomeada: trocar a guarda de
// host na montagem (ex.: `recusa: () => null`) deixa vermelho "Host de DNS rebinding…".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { servirComFalsos, cabecalhosDaBorda, BORDA } from './painel-falso.js';

async function comPainel(fn, opcoes) {
  const p = await servirComFalsos(opcoes);
  try { await fn(p); } finally { await p.fechar(); }
}

test('GET /api/sessao sem cookie responde sem-sessao, no-store e sem ir ao Cadastro Único', () => comPainel(async ({ pedir, chamadas }) => {
  const r = await pedir('GET', '/api/sessao');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { estado: 'sem-sessao' });
  assert.equal(r.cabecalhos['cache-control'], 'no-store');
  assert.match(r.cabecalhos['content-type'], /^application\/json/);
  assert.deepEqual(chamadas, []);
}));

test('GET / serve o index.html de publico/ pelo handler real', () => comPainel(async ({ pedir }) => {
  const r = await pedir('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos['content-type'], /^text\/html/);
  assert.equal(r.texto, await fs.readFile(path.join(import.meta.dirname, '..', 'publico', 'index.html'), 'utf8'));
}));

test('Host de DNS rebinding é recusado com 421 antes de qualquer rota, até em GET', () => comPainel(async ({ pedir, porta, chamadas }) => {
  for (const host of [`atacante.exemplo:${porta}`, '127.0.0.1:7777', `127.0.0.1:${porta + 1}`]) {
    const r = await pedir('GET', '/api/sessao', { cabecalhos: { host } });
    assert.deepEqual({ status: r.status, corpo: r.corpo }, { status: 421, corpo: { erro: 'host não atendido' } }, host);
  }
  assert.equal((await pedir('GET', '/api/sessao', { cabecalhos: { host: BORDA } })).status, 200, 'a borda passa');
  assert.deepEqual(chamadas, []);
}));

test('POST de outro site é recusado com 403 pela guarda; POST privilegiado sem sessão dá 401 sem tocar porta externa', () => comPainel(async ({ pedir, chamadas, diretorio }) => {
  const cruzado = await pedir('POST', '/api/orquestracao/frota/preparar', { corpo: '{}',
    cabecalhos: { 'sec-fetch-site': 'cross-site', origin: 'https://atacante.exemplo', 'content-type': 'application/json' } });
  assert.deepEqual({ status: cruzado.status, corpo: cruzado.corpo }, { status: 403, corpo: { erro: 'origem recusada' } });
  const semSessao = await pedir('POST', '/api/orquestracao/frota/preparar', { corpo: '{}', cabecalhos: cabecalhosDaBorda() });
  assert.deepEqual({ status: semSessao.status, corpo: semSessao.corpo },
    { status: 401, corpo: { erro: 'entre no Cadastro Único para confirmar esta ação' } });
  assert.deepEqual(chamadas, []);
  assert.deepEqual(await fs.readdir(diretorio), [], 'nada gravado no estado');
}));

test('GET /api/conversa responde 405 com Allow: POST; o motor não é chamado', () => comPainel(async ({ pedir, chamadas }) => {
  const r = await pedir('GET', '/api/conversa');
  assert.equal(r.status, 405);
  assert.equal(r.cabecalhos.allow, 'POST');
  assert.deepEqual(chamadas, []);
}));
