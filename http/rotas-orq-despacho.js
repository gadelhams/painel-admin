// Preparar e confirmar o despacho. Sem o portão, a API recusa antes de executar.

export class RotasOrqDespacho {
  constructor({ resposta, apiDespacho }) {
    this.resposta = resposta;
    this.apiDespacho = apiDespacho;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (!((pathname === '/api/orquestracao/despacho/preparar' || pathname === '/api/orquestracao/despacho/confirmar') && req.method === 'POST')) return false;
    const { status, corpo } = await this.apiDespacho(req, pathname, (pedido) => this.resposta.corpo(pedido));
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, corpo, status);
    return true;
  }
}
