import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conferirEscutaDoSSO, PRODUCAO_EXTRA } from '../projetos.js';

// Por que este teste existe: a sonda do cadastro único é a ÚNICA coisa que
// enxerga o listener secundário do central cair. Sem ela, o filosofia fica
// 503 para todo mundo com o painel todo verde.

test('escuta completa é saúde', () => {
  assert.deepEqual(conferirEscutaDoSSO({ ok: true, escuta: { esperados: 2, ligados: 2 } }), { ok: true });
});

test('endereço faltando reprova, mesmo com 200 e ok:true', () => {
  const r = conferirEscutaDoSSO({ ok: true, escuta: { esperados: 2, ligados: 1 } });
  assert.equal(r.ok, false);
  assert.match(r.detalhe, /1 de 2/);
  assert.match(r.detalhe, /filosofia/);
});

test('release antiga do central não vira alarme falso', () => {
  const r = conferirEscutaDoSSO({ ok: true, release: '2026-09-13' });
  assert.equal(r.ok, true);
  assert.match(r.detalhe, /sem relatório de escuta/);
});

test('corpo ilegível reprova', () => {
  assert.equal(conferirEscutaDoSSO(null).ok, false);
  assert.equal(conferirEscutaDoSSO('<html>').ok, false);
});

test('a sonda está registrada no catálogo e lê o corpo', () => {
  const alvo = PRODUCAO_EXTRA.find((a) => a.url.endsWith('/saude'));
  assert.ok(alvo, 'a sonda do /saude precisa estar em PRODUCAO_EXTRA');
  assert.equal(alvo.conferirCorpo, conferirEscutaDoSSO);
});
