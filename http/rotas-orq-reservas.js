// Reserva de carta por sessão (/api/orquestracao/reservas): GET resolve SIGLA-N e diz se há reserva viva; POST comenta RESERVA/v1 na carta. A recusa (sem SSO, só o agente local) mora em orquestrador/reserva-servico.js.

const CAMINHO = '/api/orquestracao/reservas';

export class RotasOrqReservas {
  constructor({ resposta, apiReservas }) {
    this.resposta = resposta;
    this.apiReservas = apiReservas;
  }

  async tentar(req, res, url) {
    if (url.pathname !== CAMINHO) return false;
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { this.resposta.naoPermitido(res, 'GET, HEAD, POST', 'use GET ou POST'); return true; }
    const { status, corpo } = await this.apiReservas(req, url, (pedido) => this.resposta.corpo(pedido));
    res.setHeader('cache-control', 'no-store');
    this.resposta.json(res, corpo, status);
    return true;
  }
}
