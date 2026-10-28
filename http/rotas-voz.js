// ElevenLabs, diagnóstico do navegador e presença da transcrição.

export class RotasVoz {
  constructor({ resposta, proxyEleven }) {
    this.resposta = resposta;
    this.proxyEleven = proxyEleven;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/tts' && req.method === 'POST') {
      await this.proxyEleven.responder(req, res, { lerCorpo: (pedido) => this.resposta.corpo(pedido), responderJson: (destino, corpo, status) => this.resposta.json(destino, corpo, status) });
    } else if (pathname === '/api/tts' && req.method === 'GET') {
      const sonda = this.proxyEleven.sondar();
      this.resposta.json(res, sonda.corpo, sonda.status);
    } else if (pathname === '/api/tts') {
      this.resposta.json(res, { erro: 'use POST (sintetizar) ou GET (disponibilidade)' }, 405);
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
