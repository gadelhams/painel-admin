// Estado e alternância da vigília.

export class RotasOrqVigilia {
  constructor({ resposta, vigilia, apiVigilia }) {
    this.resposta = resposta;
    this.vigilia = vigilia;
    this.apiVigilia = apiVigilia;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/orquestracao/vigilia' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, await this.vigilia.estadoDaVigilia());
    } else if ((pathname === '/api/orquestracao/vigilia/preparar' || pathname === '/api/orquestracao/vigilia/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiVigilia(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
