// Leitura, validação e registro do perfil de modelos.

export class RotasOrqModelos {
  constructor({ resposta, orquestracao, apiPerfil }) {
    this.resposta = resposta;
    this.orquestracao = orquestracao;
    this.apiPerfil = apiPerfil;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    const json = (corpo, status) => this.resposta.json(res, corpo, status);
    if (pathname === '/api/orquestracao/modelos' && req.method === 'GET') {
      try { json(await this.orquestracao.modelos(url.searchParams.get('carta'))); }
      catch (erro) { json({ erro: erro.message }, 422); }
    } else if (pathname === '/api/orquestracao/modelos/validar' && req.method === 'POST') {
      try {
        const corpo = JSON.parse(await this.resposta.corpo(req));
        json(await this.orquestracao.validarModelos(corpo.carta, corpo.selecoes));
      } catch (erro) { json({ erro: erro.message }, 422); }
    } else if ((pathname === '/api/orquestracao/modelos/preparar' || pathname === '/api/orquestracao/modelos/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiPerfil(req, pathname, (pedido) => this.resposta.corpo(pedido));
      res.setHeader('cache-control', 'no-store');
      json(corpo, status);
    } else {
      return false;
    }
    return true;
  }
}
