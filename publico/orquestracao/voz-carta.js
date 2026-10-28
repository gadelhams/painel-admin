// Gravação da carta: só propõe texto. Não grava no Plane e não executa.

class VozCartaOrquestracao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  descartar() {
    const gravacao = this.n.estado.gravacao;
    if (!gravacao) return;
    gravacao.descartar = true;
    clearTimeout(gravacao.limite);
    if (gravacao.recorder.state !== 'inactive') gravacao.recorder.stop();
    gravacao.stream.getTracks().forEach(t => t.stop());
    this.n.estado.gravacao = null;
    this.n.$('orq-voz-gravar').textContent = 'Iniciar gravação';
    this.n.$('orq-voz-status').textContent = 'Gravação descartada ao trocar de carta.';
  }

  async alternar() {
    if (this.n.estado.gravacao) {
      const atual = this.n.estado.gravacao;
      clearTimeout(atual.limite);
      if (atual.recorder.state !== 'inactive') atual.recorder.stop();
      this.n.$('orq-voz-gravar').disabled = true;
      this.n.$('orq-voz-status').textContent = 'Transcrevendo áudio…';
      return;
    }
    if (!this.n.estado.carta) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.n.$('orq-voz-status').textContent = 'Gravação indisponível neste navegador ou origem.';
      return;
    }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(x => MediaRecorder.isTypeSupported(x));
    if (!tipo) { this.n.$('orq-voz-status').textContent = 'Nenhum formato de áudio compatível.'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: tipo });
      const gravacao = { recorder, stream, cartaId: this.n.estado.carta.id, partes: [], descartar: false, limite: null };
      this.n.estado.gravacao = gravacao;
      recorder.ondataavailable = e => { if (e.data.size) gravacao.partes.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearTimeout(gravacao.limite);
        if (gravacao.descartar || this.n.estado.carta?.id !== gravacao.cartaId) return;
        this.n.estado.gravacao = null;
        this.n.$('orq-voz-gravar').disabled = false;
        this.n.$('orq-voz-gravar').textContent = 'Iniciar gravação';
        const audio = new Blob(gravacao.partes, { type: tipo });
        if (audio.size > 8 * 1024 * 1024) { this.n.$('orq-voz-status').textContent = 'Áudio excede 8 MiB; descartado.'; return; }
        try {
          const dados = await this.n.json('/api/orquestracao/voz/transcrever', { method: 'POST',
            headers: { 'content-type': tipo }, body: audio });
          if (this.n.estado.carta?.id !== gravacao.cartaId) return;
          this.n.estado.transcricao = dados.texto;
          this.n.$('orq-voz-texto').textContent = dados.texto;
          this.n.$('orq-voz-usar').hidden = false;
          this.n.$('orq-voz-status').textContent = `${dados.fonte} · somente proposta textual. Nenhuma ação executada.`;
        } catch (erro) { this.n.$('orq-voz-status').textContent = erro.message; }
      };
      recorder.start();
      gravacao.limite = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 45_000);
      this.n.$('orq-voz-gravar').textContent = 'Parar e transcrever';
      this.n.$('orq-voz-status').textContent = 'Gravando até 45 segundos; pressione novamente para parar.';
    } catch { this.n.$('orq-voz-status').textContent = 'Microfone recusado ou indisponível.'; }
  }

  usar() {
    if (!this.n.estado.transcricao) return;
    this.n.$('orq-handoff-resumo').value = this.n.estado.transcricao.slice(0, 2000);
    this.painel.conversa.limparHandoff();
    this.n.$('orq-handoff-status').textContent = 'Transcrição copiada como proposta. Acrescente evidências e confirme manualmente antes de registrar.';
  }
}

globalThis.VozCartaOrquestracao = VozCartaOrquestracao;
