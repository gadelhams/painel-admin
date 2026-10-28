// Fluxo da conversa: lê o SSE e manda o turno. A voz e o microfone ficam fora.

class FluxoSse {
  static extrair(buffer) {
    const eventos = [];
    const blocos = buffer.split('\n\n');
    const resto = blocos.pop();
    for (const bloco of blocos) {
      let evento = 'message';
      let dados = '';
      for (const linha of bloco.split('\n')) {
        if (linha.startsWith('event: ')) evento = linha.slice(7);
        else if (linha.startsWith('data: ')) dados += linha.slice(6);
      }
      if (dados) {
        try { eventos.push({ evento, dados: JSON.parse(dados) }); } catch { /* bloco malformado: ignora */ }
      }
    }
    return { eventos, resto };
  }
}

class ConversaC3po {
  constructor({ palco, enviar, microfone, entrada }) {
    this.palco = palco;
    this.enviar = enviar;
    this.microfone = microfone;
    this.entrada = entrada;
    this.sessao = sessionStorage.getItem('severino-sessao') || undefined;
    this.modoCopilotoAtivo = false;
    this.modoLigacaoAtivo = false;
    this.turno = 0;
    this.abortarConversa = null;
    this.motorEscuta = Voz.temReconhecimento ? 'navegador' : (Voz.temGravacao ? 'xai' : null);
  }

  cairParaXai(motivo) {
    if (this.motorEscuta === 'xai' || !Voz.temGravacao) return false;
    this.motorEscuta = 'xai';
    this.palco.nota('aviso-voz', `o reconhecimento do navegador não serve aqui (${motivo}); passei a gravar e transcrever pela xAI do painel — exige a sessão do painel e cada frase é transcrição paga`);
    return true;
  }

  ligarFormulario(formulario) {
    formulario.addEventListener('submit', (e) => {
      e.preventDefault();
      const mensagem = this.entrada.value.trim();
      if (!mensagem) return;
      if (this.enviar.disabled && !this.modoLigacaoAtivo) return;
      this.entrada.value = '';
      this.mandar(mensagem);
    });
  }

  async mandar(mensagem) {
    const meuTurno = ++this.turno;
    this.abortarConversa?.abort();
    const abortador = new AbortController();
    this.abortarConversa = abortador;

    this.palco.fala('usuario', mensagem);
    const pensando = this.palco.nota('pensando', 'C-3PO está calculando');
    pensando.insertAdjacentHTML('beforeend', '<span class="pontos"></span>');

    let falaSeverino = null;
    this.enviar.disabled = true;
    this.microfone.disabled = true;
    this.palco.estado('CALCULANDO', true);

    Voz.calar();
    const locutor = Voz.criarLocutor({
      aoFalha: (motivo) => { if (meuTurno === this.turno) this.palco.nota('aviso-voz', motivo); },
    });

    try {
      const resposta = await fetch('/api/conversa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensagem, sessao: this.sessao }),
        signal: abortador.signal,
      });
      if (!resposta.ok || !resposta.body) {
        const erro = await resposta.json().catch(() => ({}));
        throw new Error(erro.erro || `HTTP ${resposta.status}`);
      }

      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        buffer += decodificador.decode(value, { stream: true });
        const { eventos, resto } = FluxoSse.extrair(buffer);
        buffer = resto;

        for (const { evento, dados } of eventos) {
          if (meuTurno !== this.turno) break;
          if (evento === 'token') {
            if (!falaSeverino) falaSeverino = this.palco.fala('severino');
            falaSeverino.textContent += dados.texto;
            this.palco.historico.scrollTop = this.palco.historico.scrollHeight;
            this.palco.texto(falaSeverino.textContent);
            this.palco.estado('FALANDO', true);
            locutor.alimentar(dados.texto);
          } else if (evento === 'ferramenta') {
            this.palco.nota('ferramenta', `consultando ${dados.nome}`);
          } else if (evento === 'inicio' || evento === 'fim') {
            if (dados.sessao) {
              this.sessao = dados.sessao;
              sessionStorage.setItem('severino-sessao', this.sessao);
            }
          } else if (evento === 'erro') {
            this.palco.fala('erro', dados.mensagem);
          }
        }
      }
    } catch (erro) {
      if (erro.name === 'AbortError' || meuTurno !== this.turno) return;
      this.palco.fala('erro', `Deu ruim na conversa: ${erro.message}`);
    } finally {
      pensando.remove();
      if (meuTurno !== this.turno) return;
      locutor.concluir();
      this.enviar.disabled = false;
      this.microfone.disabled = this.modoCopilotoAtivo || this.modoLigacaoAtivo || !this.motorEscuta;
      this.palco.estado(this.modoLigacaoAtivo ? 'NA LINHA' : 'EM ESPERA', this.modoLigacaoAtivo);
      this.entrada.focus();
    }
  }
}

globalThis.FluxoSse = FluxoSse;
globalThis.ConversaC3po = ConversaC3po;
