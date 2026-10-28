// Preparar e confirmar o handoff. Não lista o canal.

export class RotasOrqHandoff {
  constructor({ resposta, apiHandoff }) {
    this.resposta = resposta;
    this.apiHandoff = apiHandoff;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (!((pathname === '/api/orquestracao/handoff/preparar' || pathname === '/api/orquestracao/handoff/confirmar') && req.method === 'POST')) return false;
    const { status, corpo } = await this.apiHandoff(req, pathname, (pedido) => this.resposta.corpo(pedido));
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, corpo, status);
    return true;
  }
}
