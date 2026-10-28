// Backlog lido do Plane ou do markdown.

export class RotasBacklog {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    if (url.pathname !== '/api/backlog') return false;
    this.resposta.json(res, await this.coletores.lerBacklog());
    return true;
  }
}
