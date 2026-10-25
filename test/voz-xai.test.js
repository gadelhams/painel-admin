import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { criarTranscritorXai, criarApiVoz, lerAudio, MAX_AUDIO } from '../orquestrador/voz-xai.js';
import { criarAutorizador, ErroAcesso } from '../orquestrador/sso.js';

const AUDIO = Buffer.alloc(150, 1);

test('xAI usa multipart com arquivo por último e não devolve nem registra a chave', async () => {
  let chamada;
  const transcrever = criarTranscritorXai({ chave: 'segredo-teste', fetchImpl: async (url, opcoes) => {
    chamada = { url, opcoes };
    return { ok: true, json: async () => ({ text: 'Verificar dependências.', duration: 2.5 }) };
  } });
  const dados = await transcrever(AUDIO, 'audio/webm;codecs=opus');
  assert.equal(dados.texto, 'Verificar dependências.');
  assert.equal(dados.observacao.includes('nenhuma ação'), true);
  assert.equal(chamada.url, 'https://api.x.ai/v1/stt');
  assert.equal(chamada.opcoes.headers.Authorization, 'Bearer segredo-teste');
  assert.deepEqual([...chamada.opcoes.body.keys()], ['model', 'language', 'format', 'file']);
  assert.equal(chamada.opcoes.body.get('language'), 'pt-PT');
  assert.equal(chamada.opcoes.body.get('model'), 'grok-voice-transcribe-2.0');
  assert.ok(!JSON.stringify(dados).includes('segredo-teste'));
  await assert.rejects(transcrever(AUDIO, 'application/json'), e => e.status === 415);
  await assert.rejects(transcrever(Buffer.alloc(MAX_AUDIO + 1), 'audio/webm'), e => e.status === 422);
});

test('rota de voz exige origem, sessão, áudio e rejeita tamanho sem chamar xAI', async () => {
  let consultas = 0;
  let transcricoes = 0;
  const autorizar = criarAutorizador({ proprietarioId: '7', verificar: async () => { consultas++; return '7'; },
    tiposConteudo: /^audio\/webm(?:\s*;|$)/i });
  const api = criarApiVoz({ autorizar, transcrever: async () => { transcricoes++; return { texto: 'ok' }; },
    ler: async () => AUDIO });
  const req = extras => ({ headers: { host: 'painel.casa.astargne.com', origin: 'https://painel.casa.astargne.com',
    'sec-fetch-site': 'same-origin', 'content-type': 'audio/webm', cookie: `astargne_session=${'x'.repeat(43)}`, ...extras } });
  assert.equal((await api(req({ origin: 'https://outro.astargne.com' }))).status, 403);
  assert.equal((await api(req({ cookie: undefined }))).status, 401);
  assert.equal((await api(req({ 'content-length': String(MAX_AUDIO + 1) }))).status, 413);
  assert.equal(transcricoes, 0);
  assert.deepEqual(await api(req({ 'content-length': '150' })), { status: 200, corpo: { texto: 'ok' } });
  assert.equal(consultas, 2, 'origem e cookie recusados antes de verificar sessão');
});

test('leitura limitada rejeita áudio além do teto', async () => {
  const req = new PassThrough();
  const promessa = lerAudio(req, 100);
  req.write(Buffer.alloc(101));
  await assert.rejects(promessa, e => e instanceof ErroAcesso && e.status === 413);
});

test('transcrição vazia não é erro (trecho curto/ruído); JSON sem campo text continua erro e vai ao log', async () => {
  const log = [];
  const resposta = (corpo) => async () => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
  const vazio = await criarTranscritorXai({ chave: 'k', fetchImpl: resposta({ text: '', duration: 1.2 }), log: m => log.push(m) })(Buffer.alloc(2000, 1), 'audio/webm');
  assert.equal(vazio.texto, '');
  await assert.rejects(criarTranscritorXai({ chave: 'k', fetchImpl: resposta({ erro: 'x' }), log: m => log.push(m) })(Buffer.alloc(2000, 1), 'audio/webm'), /transcrição inválida/);
  assert.match(log.at(-1), /resposta sem texto/);
  assert.equal(log.some(m => m.includes('k')), false, 'chave nunca no log');
});
