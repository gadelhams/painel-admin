import test from 'node:test';
import assert from 'node:assert/strict';
import '../publico/severino/fluxo-sse.js';

const { FluxoSse } = globalThis;

test('fluxo SSE separa o evento completo e guarda o bloco pela metade', () => {
  const { eventos, resto } = FluxoSse.extrair('event: token\ndata: {"texto":"oi"}\n\nevent: fim\ndata: ');
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].evento, 'token');
  assert.equal(eventos[0].dados.texto, 'oi');
  assert.match(resto, /event: fim/);
});
