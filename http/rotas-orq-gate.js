// Preparar e confirmar a marca de gate.

export class RotasOrqGate {
  constructor({ resposta, apiGate }) {
    this.resposta = resposta;
    this.apiGate = apiGate;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (!((pathname === '/api/orquestracao/gates/preparar' || pathname === '/api/orquestracao/gates/confirmar') && req.method === 'POST')) return false;
    const { status, corpo } = await this.apiGate(req, pathname, (pedido) => this.resposta.corpo(pedido));
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, corpo, status);
    return true;
  }
}
