// Sondas HTTPS da produção.

export class RotasProducao {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    if (url.pathname !== '/api/producao') return false;
    this.resposta.json(res, await this.coletores.estadoProducao());
    return true;
  }
}
