import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable, Readable } from 'node:stream';
import { ProxyElevenLabs, AJUSTE_VOZ, EFEITOS_VOZ, MODELO_TTS } from '../orquestrador/voz-eleven.js';

function criarResposta() {
  const pedacos = [];
  const res = new Writable({
    write(chunk, _enc, cb) { pedacos.push(Buffer.from(chunk)); cb(); },
  });
  res.pedacos = pedacos;
  res.writeHead = (status, headers) => { res.statusCode = status; res.headers = headers; };
  res.json = () => JSON.parse(Buffer.concat(pedacos).toString());
  return res;
}

function lerJson(corpo) {
  return async () => JSON.stringify(corpo);
}

test('sem chave a sonda e o POST nomeiam o motivo e não inventam áudio', async () => {
  const proxy = new ProxyElevenLabs({ chave: '', fetchImpl: () => { throw new Error('não chamar'); } });
  assert.deepEqual(proxy.sondar(), { status: 200, corpo: { disponivel: false, motivo: 'sem-chave-elevenlabs' } });
  const res = criarResposta();
  await proxy.responder({}, res, { lerCorpo: lerJson({ texto: 'Oi.' }), responderJson: (r, corpo, status) => { r.writeHead(status); r.end(JSON.stringify(corpo)); } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().motivo, 'sem-chave-elevenlabs');
});

test('POST manda o ajuste do playground, trata 429 como fila e não deixa a chave no log nem na resposta', async () => {
  const log = [];
  let pedido;
  const proxy = new ProxyElevenLabs({
    chave: 'xi-segredo',
    vozId: 'voz-teste',
    log: (...partes) => log.push(partes.join(' ')),
    fetchImpl: async (url, opcoes) => {
      pedido = { url, opcoes };
      return { ok: false, status: 429, text: async () => 'limite xi-segredo estourou' };
    },
  });
  const res = criarResposta();
  await proxy.responder({}, res, {
    lerCorpo: lerJson({ texto: '  Oi. ' }),
    responderJson: (r, corpo, status) => { r.writeHead(status); r.end(JSON.stringify(corpo)); },
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().motivo, 'elevenlabs-ocupada');
  assert.equal(JSON.stringify(res.json()).includes('xi-segredo'), false);
  assert.equal(pedido.opcoes.headers['xi-api-key'], 'xi-segredo');
  assert.equal(pedido.url.includes('/voz-teste/stream?output_format=mp3_44100_128'), true);
  const corpo = JSON.parse(pedido.opcoes.body);
  assert.equal(corpo.text, 'Oi.');
  assert.equal(corpo.model_id, MODELO_TTS);
  assert.deepEqual(corpo.voice_settings, AJUSTE_VOZ);
  assert.deepEqual(corpo.audio_effects, EFEITOS_VOZ);
  assert.equal('language_code' in corpo, false);
  assert.equal(log.some((l) => l.includes('xi-segredo')), false);
  assert.match(log[0], /\[chave\]/);
});

test('recusa genérica e áudio de sucesso não chamam a rede real', async () => {
  const recusa = new ProxyElevenLabs({
    chave: 'k',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'unauthorized k' }),
    log: () => {},
  });
  const resRecusa = criarResposta();
  await recusa.responder({}, resRecusa, {
    lerCorpo: lerJson({ texto: 'Oi.' }),
    responderJson: (r, corpo, status) => { r.writeHead(status); r.end(JSON.stringify(corpo)); },
  });
  assert.equal(resRecusa.statusCode, 502);
  assert.equal(resRecusa.json().motivo, 'elevenlabs-recusou');
  assert.equal(resRecusa.json().mensagem.includes('k'), false);

  const audio = new ProxyElevenLabs({
    chave: 'k',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'audio/mpeg' },
      body: Readable.toWeb(Readable.from([Buffer.from('audio')])),
    }),
  });
  const resAudio = criarResposta();
  await audio.responder({}, resAudio, { lerCorpo: lerJson({ texto: 'Oi.' }), responderJson: () => { throw new Error('não é JSON'); } });
  assert.equal(resAudio.statusCode, 200);
  assert.equal(resAudio.headers['content-type'], 'audio/mpeg');
  assert.equal(Buffer.concat(resAudio.pedacos).toString(), 'audio');
});

test('cliente que fecha no meio não vira erro de rede', async () => {
  let sinal;
  const proxy = new ProxyElevenLabs({
    chave: 'k',
    fetchImpl: (_url, opcoes) => new Promise((_resolve, reject) => {
      sinal = opcoes.signal;
      opcoes.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
    log: () => { throw new Error('abort não é falha de rede'); },
  });
  const res = criarResposta();
  let escreveu = false;
  const pendente = proxy.responder({}, res, {
    lerCorpo: lerJson({ texto: 'Oi.' }),
    responderJson: () => { escreveu = true; },
  });
  await new Promise((r) => setImmediate(r));
  res.emit('close');
  assert.equal(sinal.aborted, true);
  await pendente;
  assert.equal(escreveu, false);
});
