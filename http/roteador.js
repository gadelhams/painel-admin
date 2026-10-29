// Despacha o pedido depois da guarda. Cada grupo devolve false quando a rota não é dele.

export class RoteadorPainel {
  constructor({ porta, recusa, resposta, conversa, voz, painel, orquestracao, alinhamento, chaves }) {
    this.porta = porta;
    this.recusa = recusa;
    this.resposta = resposta;
    this.conversa = conversa;
    this.voz = voz;
    this.painel = painel;
    this.orquestracao = orquestracao;
    this.alinhamento = alinhamento;
    this.chaves = chaves;
  }

  async atender(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${this.porta}`);
    const recusa = this.recusa({
      metodo: req.method,
      host: req.headers.host,
      origem: req.headers.origin,
      secFetchSite: req.headers['sec-fetch-site'],
    });
    if (recusa) {
      this.resposta.json(res, { erro: recusa.erro }, recusa.status);
      return;
    }
    try {
      if (url.pathname === '/api/conversa' && req.method === 'POST') {
        await this.conversa.atender(req, res);
        return;
      }
      if (url.pathname === '/api/conversa') {
        this.resposta.naoPermitido(res, 'POST', 'use POST');
        return;
      }
      if (await this.voz.tentar(req, res, url)) return;
      if (await this.painel.tentar(req, res, url)) return;
      if (await this.orquestracao.tentar(req, res, url)) return;
      if (await this.alinhamento.tentar(req, res, url)) return;
      if (await this.chaves.tentar(req, res, url)) return;
      if (req.method === 'GET') {
        await this.resposta.estatico(res, url.pathname);
        return;
      }
      this.resposta.naoPermitido(res, 'GET, HEAD');
    } catch (erro) {
      console.error('[servidor]', erro);
      if (!res.headersSent) this.resposta.json(res, { erro: 'erro interno' }, 500);
      else res.end();
    }
  }
}
