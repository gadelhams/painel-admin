// Memória L1 do C-3PO: GET lê texto, versão, histórico e a pendente da reflexão; preparar e confirmar mudam pelas duas ações com SSO. Não há rota para propor: isso só o motor faz.

export class RotasMemoria {
  constructor({ resposta, lerEstado, apiMemoria }) {
    this.resposta = resposta;
    this.lerEstado = lerEstado;
    this.apiMemoria = apiMemoria;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (pathname !== '/api/c3po/memoria' && !pathname.startsWith('/api/c3po/memoria/')) return false;
    res.setHeader('cache-control', 'no-store');
    if (pathname === '/api/c3po/memoria') {
      if (req.method === 'GET' || req.method === 'HEAD') this.resposta.json(res, await this.lerEstado());
      else this.resposta.naoPermitido(res, 'GET, HEAD', 'leitura só por GET; mudar é por /api/c3po/memoria/preparar e /confirmar');
      return true;
    }
    if ((pathname === '/api/c3po/memoria/preparar' || pathname === '/api/c3po/memoria/confirmar') && req.method === 'POST') {
      const { status, corpo } = await this.apiMemoria(req, pathname, (pedido) => this.resposta.corpo(pedido));
      this.resposta.json(res, corpo, status);
    } else {
      this.resposta.naoPermitido(res, 'POST', 'use POST em /api/c3po/memoria/preparar ou /api/c3po/memoria/confirmar');
    }
    return true;
  }
}
