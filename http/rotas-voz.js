// ElevenLabs, diagnóstico do navegador e presença da transcrição.

import { ErroAcesso } from '../orquestrador/sso.js';

export class RotasVoz {
  constructor({ resposta, proxyEleven, autorizarTts }) {
    this.resposta = resposta;
    this.proxyEleven = proxyEleven;
    this.autorizarTts = autorizarTts;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/tts' && req.method === 'POST') {
      // A síntese gasta crédito pago da ElevenLabs: só com a sessão do dono, antes de ler o corpo.
      try { await this.autorizarTts(req); }
      catch (erro) {
        const status = erro instanceof ErroAcesso ? erro.status : 502;
        this.resposta.json(res, { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível', motivo: 'sem-sessao' }, status);
        return true;
      }
      await this.proxyEleven.responder(req, res, { lerCorpo: (pedido) => this.resposta.corpo(pedido), responderJson: (destino, corpo, status) => this.resposta.json(destino, corpo, status) });
    } else if (pathname === '/api/tts' && req.method === 'GET') {
      const sonda = this.proxyEleven.sondar();
      this.resposta.json(res, sonda.corpo, sonda.status);
    } else if (pathname === '/api/tts') {
      this.resposta.naoPermitido(res, 'GET, POST', 'use POST (sintetizar) ou GET (disponibilidade)');
    } else if (pathname === '/api/diagnostico/voz' && req.method !== 'POST') {
      this.resposta.naoPermitido(res, 'POST', 'use POST');
    } else if (pathname === '/api/diagnostico/voz' && req.method === 'POST') {
      try {
        const corpo = (await this.resposta.corpo(req)).slice(0, 4096);
        console.error('[voz-diag]', corpo.replace(/[\r\n]+/g, ' '));
      } catch { /* diagnóstico nunca derruba nada */ }
      res.writeHead(204);
      res.end();
    } else {
      return false;
    }
    return true;
  }
}
