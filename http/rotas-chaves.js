// Inventário e troca de chaves. A recusa genérica vem depois das rotas específicas.

export class RotasChaves {
  constructor({ resposta, chaves, apiChaves }) {
    this.resposta = resposta;
    this.chaves = chaves;
    this.apiChaves = apiChaves;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (!pathname.startsWith('/api/chaves')) return false;
    const json = (corpo, status) => this.resposta.json(res, corpo, status);
    if (pathname === '/api/chaves' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      json(await this.chaves.inventario());
    } else if (pathname === '/api/chaves/servidor' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      try { json(await this.chaves.lerServidor()); } catch (erro) { json({ erro: erro.message }, 502); }
    } else if ((pathname === '/api/chaves/preparar' || pathname === '/api/chaves/confirmar') && req.method === 'POST') {
      res.setHeader('cache-control', 'no-store');
      const { status, corpo } = await this.apiChaves(req, pathname, (pedido) => this.resposta.corpo(pedido));
      json(corpo, status);
    } else if (pathname.startsWith('/api/chaves')) {
      json({ erro: 'operação indisponível' }, 405);
    }
    return true;
  }
}
