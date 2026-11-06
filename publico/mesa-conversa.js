// Conversa da mesa de decisão com o C-3PO: uma sessão por carta (volta onde parou), a abertura em que ele diz a pergunta e o que a carta trava, e o pedido de rascunho. Não grava nada no Plane.
//
// A rota é a mesma /api/conversa do /c3po/ (o parser de SSE é o de c3po/fluxo-sse.js). O
// rascunho volta só com decisão e motivo: os efeitos nunca vêm do modelo — a gaveta os
// deixa desmarcados e quem marca é o dono. Todo texto entra por textContent.

(() => {
  const MAX_LINHAS = 80;
  const chave = (carta) => `c3po-mesa:${carta}`;
  const vazio = () => ({ sessao: undefined, linhas: [] });

  function ler(carta) {
    try { const e = JSON.parse(sessionStorage.getItem(chave(carta)) ?? 'null'); return e && Array.isArray(e.linhas) ? e : vazio(); }
    catch { return vazio(); }
  }
  function guardar(carta, e) {
    try { sessionStorage.setItem(chave(carta), JSON.stringify({ sessao: e.sessao, linhas: e.linhas.slice(-MAX_LINHAS) })); }
    catch { /* sem storage: a conversa segue, só não volta ao reabrir */ }
  }

  const abertura = (carta, titulo) => `[Mesa de decisão do painel · carta ${carta} · ${titulo ?? ''}] Abra a conversa: leia a carta com carta_plane e diga, em poucas frases, qual é a pergunta ao Mestre, o que a carta trava e as opções, com a sua recomendação.`;
  const pedidoRascunho = (carta) => `[Mesa de decisão do painel · carta ${carta}] Escreva o rascunho do registro de decisão a partir desta conversa. Responda SOMENTE com um objeto JSON {"decisao": "<uma frase>", "motivo": "<o porquê, curto>"} e nada mais.`;

  // Só decisão e motivo atravessam; qualquer outra chave (efeitos, confirmacaoId…) é descartada.
  function extrairRascunho(texto) {
    const t = String(texto ?? '');
    const i = t.indexOf('{'); const j = t.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    try {
      const o = JSON.parse(t.slice(i, j + 1));
      const decisao = typeof o.decisao === 'string' ? o.decisao.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      return decisao ? { decisao, motivo: typeof o.motivo === 'string' ? o.motivo.trim().slice(0, 2000) : '' } : null;
    } catch { return null; }
  }

  async function* eventosDaConversa(mensagem, sessao, sinal) {
    const r = await fetch('/api/conversa', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensagem, sessao }), signal: sinal });
    if (!r.ok || !r.body) { const e = await r.json().catch(() => ({})); throw new Error(e.erro || `HTTP ${r.status}`); }
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) return;
      buffer += dec.decode(value, { stream: true });
      const { eventos, resto } = globalThis.FluxoSse.extrair(buffer);
      buffer = resto;
      yield* eventos;
    }
  }

  class ConversaMesa {
    constructor({ historico, enviar }) {
      this.historico = historico;
      this.enviar = enviar;
      this.carta = null;
      this.estado = vazio();
      this.abortador = null;
    }

    linha(quem, texto, { guardarLinha = true } = {}) {
      const p = document.createElement('p');
      p.className = `mesa-fala mesa-fala-${quem}`;
      p.textContent = texto;
      this.historico.append(p);
      this.historico.scrollTop = this.historico.scrollHeight;
      if (guardarLinha) this.estado.linhas.push({ quem, texto });
      return p;
    }

    abrir({ carta, titulo }) {
      this.fechar();
      this.carta = carta;
      this.estado = ler(carta);
      this.historico.replaceChildren();
      for (const l of this.estado.linhas) this.linha(l.quem, l.texto, { guardarLinha: false });
      if (!this.estado.sessao && !this.estado.linhas.length) this.mandar(abertura(carta, titulo), { oculta: true });
    }

    fechar() { this.abortador?.abort(); this.abortador = null; this.enviar.disabled = false; }

    // Um turno: a fala do C-3PO cresce com os tokens; `coletar` devolve o texto sem mostrá-lo.
    // `doDono: false` é o turno que o painel manda sozinho (a abertura): nele uma proposta de
    // decisão não vira cartão — o dono não disse nada, e a carta que o C-3PO leu é texto de terceiros.
    async turno(mensagem, { coletar = false, doDono = true } = {}) {
      this.abortador?.abort();
      const meu = new AbortController();
      this.abortador = meu;
      const carta = this.carta;
      this.enviar.disabled = true;
      const pensando = this.linha('nota', coletar ? 'C-3PO escrevendo o rascunho…' : 'C-3PO está calculando…', { guardarLinha: false });
      let fala = null;
      let texto = '';
      try {
        for await (const { evento, dados } of eventosDaConversa(mensagem, this.estado.sessao, meu.signal)) {
          if (carta !== this.carta) return null;
          if (evento === 'token') {
            texto += dados.texto;
            if (!coletar) { fala ??= this.linha('c3po', '', { guardarLinha: false }); fala.textContent = texto; }
          } else if (evento === 'ferramenta' && !coletar) {
            pensando.textContent = `consultando ${dados.nome}…`;
          } else if (evento === 'proposta' && globalThis.CartaoAcao) {
            this.historico.append(globalThis.CartaoAcao.criar(dados));
          } else if (evento === 'proposta_decisao' && globalThis.CartaoDecisao && !coletar && doDono) {
            this.historico.append(globalThis.CartaoDecisao.criar(dados));
          } else if ((evento === 'inicio' || evento === 'fim') && dados.sessao) {
            this.estado.sessao = dados.sessao;
          } else if (evento === 'erro') {
            this.linha('erro', dados.mensagem);
          }
        }
        if (fala) this.estado.linhas.push({ quem: 'c3po', texto });
        return texto;
      } catch (erro) {
        if (erro.name === 'AbortError') return null;
        this.linha('erro', `Oh, não! A conversa falhou: ${erro.message}`);
        return null;
      } finally {
        pensando.remove();
        if (carta === this.carta) guardar(carta, this.estado);
        if (this.abortador === meu) { this.abortador = null; this.enviar.disabled = false; }
      }
    }

    mandar(mensagem, { oculta = false } = {}) {
      if (!oculta) this.linha('eu', mensagem);
      return this.turno(mensagem, { doDono: !oculta });
    }

    async rascunho() {
      const texto = await this.turno(pedidoRascunho(this.carta), { coletar: true });
      return texto === null ? null : extrairRascunho(texto);
    }
  }

  globalThis.ConversaMesa = ConversaMesa;
})();
