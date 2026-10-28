// Triagem das folhas sem gate. Não altera etiqueta.

export class RotasOrqTriagem {
  constructor({ resposta, triagemDev }) {
    this.resposta = resposta;
    this.triagemDev = triagemDev;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/triagem-dev' || req.method !== 'GET') return false;
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, await this.triagemDev());
    return true;
  }
}
