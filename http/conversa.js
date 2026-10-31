// Conversa do C-3PO em SSE. Cada evento do motor sai na hora; no fim, o par pergunta/resposta vai ao diário de conversas, se houver e se o turno trouxe a sessão SSO do dono.
//
// A rota continua aberta (decisão do dono, 29/10/2026), mas o diário é o insumo da reflexão
// que reescreve a memória L1: turno sem a sessão do dono (o loopback, um processo local, o
// executor) não entra nele (decisão do integrador, 31/10/2026, B1.1).

export class ConversaHttp {
  constructor({ resposta, conversar, maxMensagem, diarioConversas = null, sessao = null, log = console.error }) {
    this.resposta = resposta;
    this.conversar = conversar;
    this.maxMensagem = maxMensagem;
    this.diarioConversas = diarioConversas;
    this.sessao = sessao;
    this.log = log;
  }

  // Sem leitor de sessão, ou com sessão que não é a do dono (ou indisponível), não anota.
  async doDono(req) {
    if (!this.sessao) return false;
    try { return (await this.sessao.ler(req.headers?.cookie)).estado === 'dono'; } catch { return false; }
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

    // Lida já no começo, em paralelo ao turno: o fim do turno não espera o SSO.
    const doDono = this.diarioConversas ? this.doDono(req) : Promise.resolve(false);
    let clienteVivo = true;
    res.on('close', () => { clienteVivo = false; });
    let falado = '';
    let sessaoDoTurno = sessao ?? null;

    try {
      for await (const evento of this.conversar(mensagem, sessao)) {
        if (!clienteVivo) break;
        const { tipo, ...dados } = evento;
        if (tipo === 'token' && typeof dados.texto === 'string') falado += dados.texto;
        if ((tipo === 'inicio' || tipo === 'fim') && dados.sessao) sessaoDoTurno = dados.sessao;
        res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
      }
    } catch (erro) {
      if (clienteVivo) {
        console.error('[conversa]', erro);
        res.write(`event: erro\ndata: ${JSON.stringify({ mensagem: 'falha no motor do C-3PO — veja o log do servidor' })}\n\n`);
      }
    }
    if (clienteVivo) res.end();
    // Insumo da reflexão noturna; falhar aqui não derruba a conversa, só fica no log.
    if (this.diarioConversas && falado.trim() && await doDono) {
      await this.diarioConversas.anotar({ pergunta: mensagem, resposta: falado, sessao: sessaoDoTurno })
        .catch(e => this.log(`[conversa] diário de conversas indisponível: ${e.code ?? 'erro de escrita'}`));
    }
  }
}
