// Microfone do C-3PO: push-to-talk, copiloto e ligação. Quem manda o texto é a conversa.

class ModosVoz {
  constructor(conversa, { microfone, entrada, formulario, modoCopilotoCaixa, rotuloCopiloto, statusCopiloto, botaoLigacao, statusLigacao }) {
    this.conversa = conversa;
    this.microfone = microfone;
    this.entrada = entrada;
    this.formulario = formulario;
    this.modoCopilotoCaixa = modoCopilotoCaixa;
    this.rotuloCopiloto = rotuloCopiloto;
    this.statusCopiloto = statusCopiloto;
    this.botaoLigacao = botaoLigacao;
    this.statusLigacao = statusLigacao;
    this.sessaoFala = new SessaoConversa();
    this.escuta = null;
    this.escutaContinua = null;
    this.verificadorHiato = null;
    this.relogioLigacao = null;
    this.inicioLigacao = 0;
    this.placeholderOriginal = entrada.placeholder;
    this.medidorMic = document.createElement('span');
    this.medidorMic.className = 'kicker';
    this.medidorMic.style.marginLeft = '.6rem';
    statusCopiloto.after(this.medidorMic);
    this.ligar();
  }

  ligar() {
    this.microfone.addEventListener('click', () => this.alternarPtt());
    if (!this.conversa.motorEscuta) {
      this.microfone.disabled = true;
      this.microfone.title = 'reconhecimento de voz indisponível neste navegador — use Edge ou Chrome';
      this.rotuloCopiloto.hidden = true;
      if (this.botaoLigacao) this.botaoLigacao.hidden = true;
      return;
    }
    this.modoCopilotoCaixa.addEventListener('change', () => {
      if (this.modoCopilotoCaixa.checked) this.ligarCopiloto();
      else if (this.conversa.modoCopilotoAtivo) this.desligarCopiloto();
    });
    this.botaoLigacao?.addEventListener('click', () => {
      if (this.conversa.modoLigacaoAtivo) this.desligarLigacao();
      else this.ligarChamada();
    });
    const scrim = document.getElementById('console-scrim');
    if (scrim) {
      new MutationObserver(() => {
        if (scrim.hidden && this.conversa.modoLigacaoAtivo) this.desligarLigacao();
      }).observe(scrim, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  alternarPtt() {
    if (!this.conversa.motorEscuta) return;
    if (this.escuta) {
      this.escuta.parar();
      return;
    }
    Voz.calar();
    this.microfone.classList.add('ouvindo');
    this.entrada.placeholder = this.conversa.motorEscuta === 'xai' ? 'pode falar; quando parar, eu transcrevo pela xAI…' : 'pode falar, tô ouvindo…';
    const ouvir = this.conversa.motorEscuta === 'xai' ? Voz.ouvirXai : Voz.ouvir;
    this.escuta = ouvir({
      aoFalha: (motivo) => this.conversa.cairParaXai(motivo),
      aoParcial: (texto) => { this.entrada.value = texto; },
      aoFinal: (texto) => {
        const decisao = this.sessaoFala.receberPtt({ texto, ocupado: this.conversa.enviar.disabled });
        this.entrada.value = decisao.agir === 'guardar' ? decisao.texto : '';
        if (decisao.agir === 'enviar') this.conversa.mandar(decisao.texto);
      },
      aoCorrecao: (trocas) => this.conversa.palco.nota('aviso-voz', `corrigi o que ouvi: ${trocas.join(', ')}`),
      aoErro: (motivo) => this.conversa.palco.nota('aviso-voz', motivo),
      aoFim: () => {
        this.escuta = null;
        this.microfone.classList.remove('ouvindo');
        this.entrada.placeholder = this.placeholderOriginal;
      },
    });
  }

  pararEscuta() {
    this.escutaContinua?.parar();
    this.escutaContinua = null;
    clearInterval(this.verificadorHiato);
    this.verificadorHiato = null;
  }

  pintarMedidor(rms, alto, emFala) {
    const barras = '▮'.repeat(Math.min(10, Math.round(rms * 100)));
    if (emFala && !this.conversa.modoLigacaoAtivo) this.medidorMic.textContent = 'mic: pausado (C-3PO falando)';
    else this.medidorMic.textContent = `mic: ${barras || '▯'}${alto ? ' voz' : ''}${emFala ? ' · pode falar por cima' : ''}`;
  }

  atualizarStatusCopiloto() {
    this.statusCopiloto.hidden = false;
    const motor = this.conversa.motorEscuta === 'xai' ? ' (xAI: cada frase é transcrição paga)' : '';
    if (this.sessaoFala.estado === 'ativa') {
      this.statusCopiloto.textContent = `copiloto: ouvindo, pode falar à vontade${motor}`;
      this.statusCopiloto.classList.add('ativa');
    } else {
      this.statusCopiloto.textContent = `copiloto: em espera — diga "C3PO" pra retomar${motor}`;
      this.statusCopiloto.classList.remove('ativa');
    }
  }

  pintarLigacao() {
    if (!this.statusLigacao) return;
    const seg = Math.floor((Date.now() - this.inicioLigacao) / 1000);
    const motor = this.conversa.motorEscuta === 'xai' ? ' · cada frase é transcrição paga' : '';
    this.statusLigacao.hidden = false;
    this.statusLigacao.textContent = `na linha ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}${motor} — fale à vontade; se eu estiver falando, fale por cima`;
  }

  tratarUtteranceCopiloto(texto) {
    const decisao = this.sessaoFala.receberCopiloto({
      texto, ocupado: this.conversa.enviar.disabled, gatilho: Voz.detectarGatilho(texto),
    });
    if (decisao.agir === 'ignorar') return;
    this.atualizarStatusCopiloto();
    if (decisao.texto) this.conversa.mandar(decisao.texto);
  }

  tratarUtteranceLigacao(texto) {
    const decisao = this.sessaoFala.receberLigacao({ texto, eco: Voz.pareceEco(texto) });
    if (decisao.agir === 'enviar') this.conversa.mandar(decisao.texto);
  }

  iniciarEscuta(modo) {
    this.pararEscuta();
    const ouvirContinuo = this.conversa.motorEscuta === 'xai' ? Voz.ouvirContinuoXai : Voz.ouvirContinuo;
    this.escutaContinua = ouvirContinuo({
      interromper: modo === 'ligacao',
      aoInterromper: () => { if (this.conversa.modoLigacaoAtivo) Voz.calar(); },
      aoParcial: () => {},
      aoUtterance: modo === 'ligacao' ? (texto) => this.tratarUtteranceLigacao(texto) : (texto) => this.tratarUtteranceCopiloto(texto),
      aoCorrecao: (trocas) => this.conversa.palco.nota('aviso-voz', `corrigi o que ouvi: ${trocas.join(', ')}`),
      aoErro: (motivo) => this.conversa.palco.nota('aviso-voz', motivo),
      aoNivel: (rms, alto, emFala) => this.pintarMedidor(rms, alto, emFala),
      aoFalha: (motivo) => {
        const aindaLigado = modo === 'ligacao' ? this.conversa.modoLigacaoAtivo : this.conversa.modoCopilotoAtivo;
        if (!aindaLigado) return;
        if (this.conversa.cairParaXai(motivo)) { this.iniciarEscuta(modo); return; }
        if (modo === 'ligacao') this.desligarLigacao();
        else { this.modoCopilotoCaixa.checked = false; this.desligarCopiloto(); }
        this.conversa.palco.nota('aviso-voz', 'voz desligada: sem motor neste navegador — use Chrome ou Edge, ou abra o painel logado para usar a xAI');
      },
    });
    if (modo === 'copiloto') {
      this.verificadorHiato = setInterval(() => {
        if (this.sessaoFala.vencerHiato(Date.now())) this.atualizarStatusCopiloto();
      }, 5000);
    }
  }

  ocuparMicrofone(title) {
    this.microfone.disabled = true;
    this.microfone.title = title;
  }

  liberarMicrofone() {
    if (this.conversa.modoCopilotoAtivo || this.conversa.modoLigacaoAtivo) return;
    this.medidorMic.textContent = '';
    this.microfone.disabled = false;
    this.microfone.title = 'clique e fale (push-to-talk)';
  }

  ligarCopiloto() {
    if (this.conversa.modoLigacaoAtivo) this.desligarLigacao();
    Voz.calar();
    this.conversa.modoCopilotoAtivo = true;
    this.ocuparMicrofone('desligue o modo copiloto pra usar o push-to-talk');
    this.sessaoFala.estado = 'dormente';
    this.atualizarStatusCopiloto();
    this.iniciarEscuta('copiloto');
  }

  desligarCopiloto() {
    this.conversa.modoCopilotoAtivo = false;
    this.pararEscuta();
    this.statusCopiloto.hidden = true;
    this.liberarMicrofone();
  }

  ligarChamada() {
    if (this.modoCopilotoCaixa.checked) this.modoCopilotoCaixa.checked = false;
    if (this.conversa.modoCopilotoAtivo) this.desligarCopiloto();
    Voz.calar();
    this.conversa.modoLigacaoAtivo = true;
    this.ocuparMicrofone('desligue a ligação pra usar o push-to-talk');
    if (this.botaoLigacao) {
      this.botaoLigacao.textContent = 'desligar';
      this.botaoLigacao.classList.add('na-linha');
      this.botaoLigacao.setAttribute('aria-pressed', 'true');
      this.botaoLigacao.title = 'desliga a ligação';
    }
    this.formulario.classList.add('na-linha');
    this.iniciarEscuta('ligacao');
    if (!this.conversa.modoLigacaoAtivo) return;
    this.inicioLigacao = Date.now();
    this.pintarLigacao();
    this.relogioLigacao = setInterval(() => this.pintarLigacao(), 1000);
    this.conversa.palco.estado('NA LINHA', true);
  }

  desligarLigacao() {
    this.conversa.modoLigacaoAtivo = false;
    this.pararEscuta();
    clearInterval(this.relogioLigacao);
    this.relogioLigacao = null;
    if (this.statusLigacao) this.statusLigacao.hidden = true;
    if (this.botaoLigacao) {
      this.botaoLigacao.textContent = 'ligar';
      this.botaoLigacao.classList.remove('na-linha');
      this.botaoLigacao.setAttribute('aria-pressed', 'false');
      this.botaoLigacao.title = 'abre uma ligação: o microfone fica aberto e falar por cima me interrompe';
    }
    this.formulario.classList.remove('na-linha');
    this.liberarMicrofone();
    Voz.calar();
    this.conversa.abortarConversa?.abort();
    this.conversa.palco.estado('EM ESPERA', false);
  }
}

globalThis.ModosVoz = ModosVoz;
