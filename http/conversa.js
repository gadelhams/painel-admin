// Conversa do C-3PO em SSE. Cada evento do motor sai na hora.

export class ConversaHttp {
  constructor({ resposta, conversar, maxMensagem }) {
    this.resposta = resposta;
    this.conversar = conversar;
    this.maxMensagem = maxMensagem;
  }

  async atender(req, res) {
    let corpo;
    try {
      corpo = JSON.parse(await this.resposta.corpo(req));
    } catch {
      this.resposta.json(res, { erro: 'corpo inválido: mande JSON {"mensagem": "...", "sessao": "..."}' }, 400);
      return;
    }
    const mensagem = typeof corpo.mensagem === 'string' ? corpo.mensagem.trim() : '';
    const sessao = typeof corpo.sessao === 'string' && corpo.sessao ? corpo.sessao : undefined;
    if (!mensagem || mensagem.length > this.maxMensagem) {
      this.resposta.json(res, { erro: `"mensagem" precisa ser texto de 1 a ${this.maxMensagem} caracteres` }, 400);
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.flushHeaders?.();

    let clienteVivo = true;
    res.on('close', () => { clienteVivo = false; });

    try {
      for await (const evento of this.conversar(mensagem, sessao)) {
        if (!clienteVivo) break;
        const { tipo, ...dados } = evento;
        res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
      }
    } catch (erro) {
      if (clienteVivo) {
        console.error('[conversa]', erro);
        res.write(`event: erro\ndata: ${JSON.stringify({ mensagem: 'falha no motor do C-3PO — veja o log do servidor' })}\n\n`);
      }
    }
    if (clienteVivo) res.end();
  }
}
