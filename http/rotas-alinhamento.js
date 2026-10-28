// Varredura de alinhamento. `?agora=1` força uma passagem.

export class RotasAlinhamento {
  constructor({ resposta, alinhamento }) {
    this.resposta = resposta;
    this.alinhamento = alinhamento;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/alinhamento' || req.method !== 'GET') return false;
    res.setHeader('cache-control', 'no-store');
    try {
      this.resposta.json(res, await this.alinhamento.ler({ forcar: url.searchParams.get('agora') === '1' }));
    } catch (erro) {
      this.resposta.json(res, { erro: erro.message }, 503);
    }
    return true;
  }
}
