// Presença da chave e a transcrição. A síntese mora em rotas-voz.js.

export class RotasOrqVoz {
  constructor({ resposta, apiVoz, xai }) {
    this.resposta = resposta;
    this.apiVoz = apiVoz;
    this.xai = xai;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/orquestracao/voz' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, { xai: this.xai() });
    } else if (pathname === '/api/orquestracao/voz/transcrever' && req.method === 'POST') {
      const { status, corpo } = await this.apiVoz(req);
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
