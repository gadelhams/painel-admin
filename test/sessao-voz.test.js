import test from 'node:test';
import assert from 'node:assert/strict';
import '../publico/severino/sessao-voz.js';

const SessaoConversa = globalThis.SessaoConversa;

test('push-to-talk guarda o texto enquanto a resposta ocupa o envio', () => {
  const sessao = new SessaoConversa();
  assert.deepEqual(sessao.receberPtt({ texto: 'oi', ocupado: true }), { agir: 'guardar', texto: 'oi' });
  assert.deepEqual(sessao.receberPtt({ texto: 'oi', ocupado: false }), { agir: 'enviar', texto: 'oi' });
});

test('copiloto dormente só acorda no gatilho e o hiato devolve a espera', () => {
  const sessao = new SessaoConversa();
  const agora = 1_000_000;
  assert.deepEqual(sessao.receberCopiloto({ texto: 'narração do jogo', ocupado: false, agora, gatilho: { encontrado: false } }), { agir: 'ignorar', texto: '' });
  assert.equal(sessao.estado, 'dormente');
  const acordo = sessao.receberCopiloto({ texto: 'c3po como estão', ocupado: false, agora, gatilho: { encontrado: true, resto: 'como estão' } });
  assert.deepEqual(acordo, { agir: 'acordar', texto: 'como estão' });
  assert.equal(sessao.estado, 'ativa');
  assert.deepEqual(sessao.receberCopiloto({ texto: 'e as portas', ocupado: true, agora: agora + 10, gatilho: { encontrado: false } }), { agir: 'ignorar', texto: '' });
  assert.equal(sessao.vencerHiato(agora + 10), false);
  assert.equal(sessao.vencerHiato(agora + 90_001), true);
  assert.equal(sessao.estado, 'dormente');
});

test('ligação manda a frase que não é eco e não corta num interim curto', () => {
  const sessao = new SessaoConversa();
  assert.deepEqual(sessao.receberLigacao({ texto: 'a própria fala', eco: true }), { agir: 'ignorar', texto: '' });
  assert.deepEqual(sessao.receberLigacao({ texto: 'para e escuta', eco: false }), { agir: 'enviar', texto: 'para e escuta' });
  assert.equal(SessaoConversa.deveInterromper({ candidato: 'para', eco: true, interimCurto: false }), false);
  assert.equal(SessaoConversa.deveInterromper({ candidato: 'a', eco: false, interimCurto: true }), false);
  assert.equal(SessaoConversa.deveInterromper({ candidato: '', eco: false, interimCurto: false }), false);
  assert.equal(SessaoConversa.deveInterromper({ candidato: 'abre a fila', eco: false, interimCurto: false }), true);
});
