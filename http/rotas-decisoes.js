// Decisões paradas do backlog.

export class RotasDecisoes {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    if (url.pathname !== '/api/decisoes') return false;
    this.resposta.json(res, await this.coletores.decisoesDoBacklog());
    return true;
  }
}
