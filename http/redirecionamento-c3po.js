// Leva /c3po à barra final e os endereços antigos /severino e /severino/ ao novo. Não atende a API.
//
// O chat chamou-se Severino até 21/08/2026 e a rota manteve o nome até 28/10/2026;
// favoritos antigos continuam chegando.
export class RedirecionamentoC3po {
  async tentar(_req, res, url) {
    if (_req.method !== 'GET' || !['/c3po', '/severino', '/severino/'].includes(url.pathname)) return false;
    res.writeHead(301, { location: '/c3po/' });
    res.end();
    return true;
  }
}
