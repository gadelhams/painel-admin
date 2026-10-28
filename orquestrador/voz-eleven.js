// Proxy da ElevenLabs. A chave fica no processo; o navegador manda texto e
// recebe áudio. Falha nomeada, nunca a chave. Teste injeta fetchImpl.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_TEXTO_TTS = 4_000;
export const VOZ_ID_PADRAO = 'JBFqnCBsd6RMkjVDRZzb';
export const MODELO_TTS = 'eleven_v4';
export const AJUSTE_VOZ = {
  stability: 0.07,
  similarity_boost: 0.09,
  clone_strength: 0,
};
export const EFEITOS_VOZ = {
  filter_preset_id: 'robot',
  distance: 0.5,
};
const URL_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

export class ProxyElevenLabs {
  constructor({ chave, vozId, fetchImpl = fetch, log = console.error } = {}) {
    this.chaveFixa = chave;
    this.vozIdFixa = vozId;
    this.fetchImpl = fetchImpl;
    this.log = log;
  }

  chave() {
    return this.chaveFixa ?? process.env.ELEVENLABS_API_KEY;
  }

  vozId() {
    return this.vozIdFixa || process.env.ELEVENLABS_VOZ_ID || VOZ_ID_PADRAO;
  }

  sondar() {
    return this.chave()
      ? { status: 200, corpo: { disponivel: true } }
      : { status: 200, corpo: { disponivel: false, motivo: 'sem-chave-elevenlabs' } };
  }

  async responder(req, res, { lerCorpo, responderJson }) {
    const chave = this.chave();
    if (!chave) {
      responderJson(res, {
        motivo: 'sem-chave-elevenlabs',
        mensagem: 'ELEVENLABS_API_KEY ausente no ambiente — grave a chave em painel-admin/.env e reinicie o servidor',
      }, 503);
      return;
    }

    let corpo;
    try {
      corpo = JSON.parse(await lerCorpo(req));
    } catch {
      responderJson(res, { erro: 'corpo inválido: mande JSON {"texto": "..."}' }, 400);
      return;
    }
    const texto = typeof corpo.texto === 'string' ? corpo.texto.trim() : '';
    if (!texto || texto.length > MAX_TEXTO_TTS) {
      responderJson(res, { erro: `"texto" precisa ser texto de 1 a ${MAX_TEXTO_TTS} caracteres` }, 400);
      return;
    }

    const controlador = new AbortController();
    res.on('close', () => controlador.abort());

    let upstream;
    try {
      upstream = await this.fetchImpl(
        `${URL_BASE}/${encodeURIComponent(this.vozId())}/stream?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': chave, 'content-type': 'application/json' },
          body: JSON.stringify({
            text: texto,
            model_id: MODELO_TTS,
            voice_settings: AJUSTE_VOZ,
            audio_effects: EFEITOS_VOZ,
          }),
          signal: controlador.signal,
        },
      );
    } catch (erro) {
      if (controlador.signal.aborted) return;
      this.log('[tts] ElevenLabs inalcançável:', erro?.cause?.code ?? erro.message);
      responderJson(res, {
        motivo: 'elevenlabs-inalcancavel',
        mensagem: 'não alcancei a API da ElevenLabs — sem internet ou serviço fora',
      }, 502);
      return;
    }

    if (!upstream.ok) {
      const detalhe = await upstream.text().catch(() => '');
      const visivel = chave ? detalhe.replaceAll(chave, '[chave]') : detalhe;
      this.log(`[tts] ElevenLabs respondeu ${upstream.status}:`, visivel.slice(0, 300));
      if (upstream.status === 429) {
        responderJson(res, {
          motivo: 'elevenlabs-ocupada',
          mensagem: 'a ElevenLabs está no limite de sínteses simultâneas — a próxima frase tenta de novo',
        }, 429);
        return;
      }
      responderJson(res, {
        motivo: 'elevenlabs-recusou',
        mensagem: `a ElevenLabs recusou a síntese (HTTP ${upstream.status}) — detalhe no log do servidor`,
      }, 502);
      return;
    }

    res.writeHead(200, { 'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg' });
    try {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch {
      res.destroy();
    }
  }
}
