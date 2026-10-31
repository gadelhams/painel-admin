// Estado do zelador do Hangar: job em curso, o diário estruturado e o fim do último job por projeto. Só leitura.

export class RotasOrqZelador {
  constructor({ resposta, estadoZelador }) {
    this.resposta = resposta;
    this.estadoZelador = estadoZelador;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/zelador' || req.method !== 'GET') return false;
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, await this.estadoZelador());
    return true;
  }
}
