// Encomendas de nave do Hangar: a leitura das pendentes é aberta; registrar é preparar e confirmar, pelas duas ações com SSO. Não cria projeto.

const LEITURA = '/api/hangar/encomendas';
const ESCRITAS = ['/api/hangar/encomendas/preparar', '/api/hangar/encomendas/confirmar'];

export class RotasEncomendas {
  constructor({ resposta, encomendas, apiEncomendas }) {
    this.resposta = resposta;
    this.encomendas = encomendas;
    this.apiEncomendas = apiEncomendas;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname !== LEITURA && !pathname.startsWith(`${LEITURA}/`)) return false;
    res.setHeader('cache-control', 'no-store');
    if (pathname === LEITURA && (req.method === 'GET' || req.method === 'HEAD')) {
      this.resposta.json(res, await this.encomendas.pendentes());
    } else if (pathname === LEITURA) {
      this.resposta.naoPermitido(res, 'GET, HEAD', 'use GET');
    } else if (ESCRITAS.includes(pathname) && req.method === 'POST') {
      const { status, corpo } = await this.apiEncomendas(req, pathname, (pedido) => this.resposta.corpo(pedido));
      this.resposta.json(res, corpo, status);
    } else {
      this.resposta.naoPermitido(res, 'POST', 'use POST em /api/hangar/encomendas/preparar ou /api/hangar/encomendas/confirmar');
    }
    return true;
  }
}
