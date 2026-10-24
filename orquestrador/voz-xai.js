// Áudio temporário, sem persistência e sem token no browser. A transcrição é
// texto para consulta/proposta; nunca converte fala em escrita ou despacho.
import { ErroAcesso } from './sso.js';

export const MAX_AUDIO = 8 * 1024 * 1024;
const FORMATOS = new Map([
  ['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
]);

export function lerAudio(req, limite = MAX_AUDIO) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', pedaco => {
      tamanho += pedaco.length;
      if (tamanho > limite) { reject(new ErroAcesso('áudio excede 8 MiB', 413)); req.destroy(); return; }
      partes.push(pedaco);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

export function criarTranscritorXai({ chave = process.env.XAI_API_KEY, fetchImpl = fetch } = {}) {
  return async (audio, tipo) => {
    const mime = String(tipo ?? '').split(';')[0].toLowerCase();
    const extensao = FORMATOS.get(mime);
    if (!extensao) throw new ErroAcesso('formato de áudio não suportado', 415);
    if (!Buffer.isBuffer(audio) || audio.length < 100 || audio.length > MAX_AUDIO) throw new ErroAcesso('áudio vazio ou grande demais', 422);
    if (!chave) throw new ErroAcesso('xAI Voice não configurada no servidor', 503);
    const form = new FormData();
    form.append('model', 'grok-voice-transcribe-2.0');
    form.append('language', 'pt-PT');
    form.append('format', 'true');
    form.append('file', new Blob([audio], { type: mime }), `fala.${extensao}`); // arquivo sempre por último
    let resposta;
    try {
      resposta = await fetchImpl('https://api.x.ai/v1/stt', { method: 'POST',
        headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(60_000) });
    } catch { throw new ErroAcesso('transcrição xAI indisponível', 502); }
    if (!resposta.ok) throw new ErroAcesso(`xAI recusou a transcrição (HTTP ${resposta.status})`, 502);
    let dados;
    try { dados = await resposta.json(); }
    catch { throw new ErroAcesso('resposta de transcrição inválida', 502); }
    if (typeof dados.text !== 'string' || !dados.text.trim() || dados.text.length > 8000) {
      throw new ErroAcesso('resposta de transcrição inválida', 502);
    }
    return { texto: dados.text.trim(), fonte: 'xAI grok-voice-transcribe-2.0',
      duracaoSegundos: Number.isFinite(dados.duration) ? dados.duration : null,
      observacao: 'Texto proposto; nenhuma ação foi executada ou escrita no Plane.' };
  };
}

export function criarApiVoz({ autorizar, transcrever = criarTranscritorXai(), ler = lerAudio } = {}) {
  return async req => {
    try {
      await autorizar(req);
      const tamanho = Number(req.headers['content-length']);
      if (Number.isFinite(tamanho) && tamanho > MAX_AUDIO) throw new ErroAcesso('áudio excede 8 MiB', 413);
      const audio = await ler(req);
      return { status: 200, corpo: await transcrever(audio, req.headers['content-type']) };
    } catch (erro) {
      return { status: erro instanceof ErroAcesso ? erro.status : 502,
        corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'transcrição indisponível' } };
    }
  };
}
