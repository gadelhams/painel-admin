// Comentários do card. Não registra handoff.

export class RotasOrqCanal {
  constructor({ resposta, orquestracao }) {
    this.resposta = resposta;
    this.orquestracao = orquestracao;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/canal' || req.method !== 'GET') return false;
    try { this.resposta.json(res, await this.orquestracao.canal(url.searchParams.get('carta'), url.searchParams.get('projeto'))); }
    catch (erro) { this.resposta.json(res, { erro: erro.message }, 422); }
    return true;
  }
}
