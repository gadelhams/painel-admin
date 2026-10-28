// Cotas de assinatura. Gasto de API não entra aqui.

export class RotasOrqConsumo {
  constructor({ resposta, lerConsumo }) {
    this.resposta = resposta;
    this.lerConsumo = lerConsumo;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/consumo' || req.method !== 'GET') return false;
    this.resposta.json(res, await this.lerConsumo());
    return true;
  }
}
