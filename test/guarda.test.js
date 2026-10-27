import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarGuarda, NOME_BORDA } from '../guarda.js';

// O painel não tem login; estes casos são a única coisa entre um site
// qualquer aberto no navegador e a aba Contas (cadastro de produção).

const recusa = criarGuarda(7777);
const pedido = (extra) => ({ metodo: 'POST', host: '127.0.0.1:7777', ...extra });

test('Host conhecido passa; Host de DNS rebinding é recusado mesmo em GET', () => {
  assert.equal(recusa({ metodo: 'GET', host: '127.0.0.1:7777' }), null);
  assert.equal(recusa({ metodo: 'GET', host: 'localhost:7777' }), null);
  assert.equal(recusa({ metodo: 'GET', host: NOME_BORDA }), null);
  assert.equal(recusa({ metodo: 'GET', host: 'Painel.Vpn.Astargne.com' }), null);
  assert.equal(recusa({ metodo: 'GET', host: 'atacante.exemplo:7777' })?.status, 421);
  assert.equal(recusa({ metodo: 'GET', host: '127.0.0.1:8000' })?.status, 421);
  assert.equal(recusa({ metodo: 'GET', host: undefined })?.status, 421);
});

test('POST da própria página passa, pelo loopback e pela borda', () => {
  assert.equal(recusa(pedido({ secFetchSite: 'same-origin', origem: 'http://127.0.0.1:7777' })), null);
  assert.equal(recusa(pedido({ host: 'localhost:7777', secFetchSite: 'same-origin', origem: 'http://localhost:7777' })), null);
  assert.equal(recusa(pedido({ host: NOME_BORDA, secFetchSite: 'same-origin', origem: `https://${NOME_BORDA}` })), null);
});

test('POST de outro site é recusado, por Sec-Fetch-Site ou por Origin', () => {
  assert.equal(recusa(pedido({ secFetchSite: 'cross-site', origem: 'https://atacante.exemplo' }))?.status, 403);
  assert.equal(recusa(pedido({ secFetchSite: 'same-site', origem: 'https://plane.vpn.astargne.com' }))?.status, 403);
  // navegador antigo, sem Sec-Fetch-*: o Origin decide
  assert.equal(recusa(pedido({ origem: 'https://atacante.exemplo' }))?.status, 403);
  assert.equal(recusa(pedido({ origem: 'null' }))?.status, 403);
});

test('PUT e DELETE seguem a mesma regra do POST', () => {
  for (const metodo of ['PUT', 'DELETE']) {
    assert.equal(recusa(pedido({ metodo, secFetchSite: 'cross-site' }))?.status, 403);
    assert.equal(recusa(pedido({ metodo, secFetchSite: 'same-origin' })), null);
  }
});

test('cliente sem cabeçalho de navegador (curl local) passa', () => {
  assert.equal(recusa(pedido({})), null);
});
