// Leitura e troca da frota. A troca passa pelas duas ações com SSO.

export class RotasOrqFrota {
  constructor({ resposta, orquestracao, apiFrota }) {
    this.resposta = resposta;
    this.orquestracao = orquestracao;
    this.apiFrota = apiFrota;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/orquestracao/frota' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, await this.orquestracao.estadoFrota());
    } else if ((pathname === '/api/orquestracao/frota/preparar' || pathname === '/api/orquestracao/frota/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiFrota(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
