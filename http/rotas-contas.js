// Repassa o Cadastro Único. O corpo só é lido quando a rota é desta família.

export class RotasContas {
  constructor({ resposta, contas }) {
    this.resposta = resposta;
    this.contas = contas;
  }

  async tentar(req, res, url) {
    if (!url.pathname.startsWith('/api/contas/')) return false;
    const corpoTexto = req.method === 'GET' ? '' : await this.resposta.corpo(req);
    const { status, corpo } = await this.contas(req.method, url.pathname, corpoTexto);
    this.resposta.json(res, corpo, status);
    return true;
  }
}
