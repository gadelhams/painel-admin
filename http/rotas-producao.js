// Sondas HTTPS da produção.

export class RotasProducao {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/producao') return false;
    // Só leitura: outro método é recusado aqui mesmo, sem chamar o coletor.
    if (req.method !== 'GET' && req.method !== 'HEAD') { this.resposta.naoPermitido(res, 'GET, HEAD', 'use GET'); return true; }
    this.resposta.json(res, await this.coletores.estadoProducao());
    return true;
  }
}
