// De quem é a sessão SSO deste navegador. Só GET; não autoriza nada.

export class RotasSessao {
  constructor({ resposta, sessao }) {
    this.resposta = resposta;
    this.sessao = sessao;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/sessao') return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      this.resposta.naoPermitido(res, 'GET, HEAD', 'use GET');
      return true;
    }
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, await this.sessao.ler(req.headers.cookie));
    return true;
  }
}
