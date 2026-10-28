// Leitura do canal legado. Não dispara ciclo, vigília nem pausa.

export class RotasOrqLegado {
  constructor({ resposta, lerCanalLegado }) {
    this.resposta = resposta;
    this.lerCanalLegado = lerCanalLegado;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/legado' || req.method !== 'GET') return false;
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, await this.lerCanalLegado());
    return true;
  }
}
