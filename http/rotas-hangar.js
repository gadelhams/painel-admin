// Naves e droids do Hangar. Só GET; o guard do roteador já rodou antes.

export class RotasHangar {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    // Duas rotas porque o custo é outro: as naves seguem o cache de 60 s do
    // Plane; os droids são /proc + stat, feitos para o poll de 5 s.
    if (url.pathname === '/api/hangar') {
      this.resposta.json(res, await this.coletores.lerHangar());
      return true;
    }
    if (url.pathname === '/api/hangar/sessoes') {
      this.resposta.json(res, await this.coletores.lerSessoes());
      return true;
    }
    return false;
  }
}
