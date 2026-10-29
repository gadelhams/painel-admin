// Estado e alternância da liberação do jogo nativo. A leitura é aberta: é ela que o pré-flight nativo consulta.

export class RotasOrqNativo {
  constructor({ resposta, liberacaoNativa, apiNativo }) {
    this.resposta = resposta;
    this.liberacaoNativa = liberacaoNativa;
    this.apiNativo = apiNativo;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname === '/api/orquestracao/nativo' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, await this.liberacaoNativa.estado());
    } else if ((pathname === '/api/orquestracao/nativo/preparar' || pathname === '/api/orquestracao/nativo/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiNativo(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
