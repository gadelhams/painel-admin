// Preparar e confirmar uma ação proposta pelo C-3PO, pelas duas ações com SSO. Não há rota para propor: isso só o motor faz.

export class RotasAcoes {
  constructor({ resposta, apiAcoes }) {
    this.resposta = resposta;
    this.apiAcoes = apiAcoes;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (!pathname.startsWith('/api/acoes')) return false;
    if ((pathname === '/api/acoes/preparar' || pathname === '/api/acoes/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiAcoes(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      this.resposta.json(res, corpo, status);
    } else {
      this.resposta.naoPermitido(res, 'POST', 'use POST em /api/acoes/preparar ou /api/acoes/confirmar');
    }
    return true;
  }
}
