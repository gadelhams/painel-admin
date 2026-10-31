// Estado e alternância do play por nave. A leitura é aberta e não diz quem ligou.

export class RotasOrqPlay {
  constructor({ resposta, estadoPlay, apiPlay }) {
    this.resposta = resposta;
    this.estadoPlay = estadoPlay;
    this.apiPlay = apiPlay;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/orquestracao/play' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, await this.estadoPlay());
    } else if ((pathname === '/api/orquestracao/play/preparar' || pathname === '/api/orquestracao/play/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiPlay(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
