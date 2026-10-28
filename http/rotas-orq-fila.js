// Fila, pré-checagem e simulação. Não marca gate nem despacha.

export class RotasOrqFila {
  constructor({ resposta, orquestracao }) {
    this.resposta = resposta;
    this.orquestracao = orquestracao;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    const json = (corpo, status) => this.resposta.json(res, corpo, status);
    if (pathname === '/api/orquestracao' && req.method === 'GET') {
      json(await this.orquestracao.fila());
    } else if (pathname === '/api/orquestracao/prontidao' && req.method === 'GET') {
      try {
        json(await this.orquestracao.preavaliar(url.searchParams.get('carta'), url.searchParams.get('gate')));
      } catch (erro) {
        json({ erro: erro.message }, 422);
      }
    } else if (pathname === '/api/orquestracao/simular' && req.method === 'POST') {
      try {
        const corpo = JSON.parse(await this.resposta.corpo(req));
        if (typeof corpo.carta !== 'string' || typeof corpo.comando !== 'string') throw new Error('carta e comando obrigatórios');
        json(await this.orquestracao.simular(corpo.carta, corpo.comando, corpo.selecoes ?? null));
      } catch (erro) {
        json({ erro: erro.message }, 422);
      }
    } else {
      return false;
    }
    return true;
  }
}
