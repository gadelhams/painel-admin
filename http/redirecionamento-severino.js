// Leva /severino para a barra final. Não atende a API.

export class RedirecionamentoSeverino {
  async tentar(_req, res, url) {
    if (url.pathname !== '/severino' || _req.method !== 'GET') return false;
    res.writeHead(301, { location: '/severino/' });
    res.end();
    return true;
  }
}
