// Leituras pesadas do C-3PO: uma de cada vez, a mesma em curso é compartilhada, vale 2 min e falha não fica guardada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LeituraPesada } from '../motor/leitura-pesada.js';

const pausa = ms => new Promise(r => setTimeout(r, ms));

test('leituras diferentes não rodam ao mesmo tempo; a mesma em curso é compartilhada', async () => {
  const l = new LeituraPesada();
  let ativas = 0; let pico = 0; let chamadasFila = 0;
  const coletor = (valor) => async () => { ativas++; pico = Math.max(pico, ativas); await pausa(20); ativas--; return valor; };
  const r = await Promise.all([
    l.ler('fila', async () => { chamadasFila++; return coletor('F')(); }),
    l.ler('fila', async () => { chamadasFila++; return coletor('F2')(); }),
    l.ler('triagem', coletor('T')),
    l.ler('decisoes', coletor('D')),
  ]);
  assert.deepEqual(r, ['F', 'F', 'T', 'D']);
  assert.equal(pico, 1, 'o Plane nunca recebe duas varreduras juntas');
  assert.equal(chamadasFila, 1);
});

test('vale pelo prazo; depois lê de novo; falha não fica guardada nem trava a fila', async () => {
  let t = 0;
  const l = new LeituraPesada({ validadeMs: 1000, agora: () => t });
  let n = 0;
  assert.equal(await l.ler('fila', async () => ++n), 1);
  t = 999; assert.equal(await l.ler('fila', async () => ++n), 1);
  t = 1000; assert.equal(await l.ler('fila', async () => ++n), 2);
  await assert.rejects(l.ler('triagem', async () => { throw new Error('aborted due to timeout'); }), /timeout/);
  assert.equal(await l.ler('triagem', async () => 'ok'), 'ok');
});
