// Catálogo estático de relações entre projetos.

export class RotasRelacoes {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    if (url.pathname !== '/api/relacoes') return false;
    this.resposta.json(res, await this.coletores.catalogoRelacoes());
    return true;
  }
}
