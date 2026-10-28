// Microfone do C-3PO. Dois motores: Web Speech e gravação + transcrição xAI.
// Não decide se a frase vira turno — isso é a SessaoConversa.

class Escuta {
  constructor({ diag = () => {}, aoMudar = () => {}, emFala = () => false, pareceEco = () => false } = {}) {
    this.diag = diag;
    this.aoMudar = aoMudar;
    this.emFala = emFala;
    this.pareceEco = pareceEco;
    this.corretor = new globalThis.PoliticaFala.CorretorDeNomes([]);
    this.ClasseReconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.temReconhecimento = Boolean(this.ClasseReconhecimento);
    this.temGravacao = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
    this.xaiDisponivel = null;
    this.tipoGravacao = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? null;
    this.erros = {
      'not-allowed': 'o navegador está sem permissão de microfone — libere nas configurações do site e tente de novo',
      'service-not-allowed': 'o serviço de reconhecimento de voz está bloqueado neste navegador',
      network: 'o reconhecimento de voz precisa de internet e não alcançou o serviço',
      'no-speech': 'não captei nenhum som, Mestre — clique no microfone e fale de novo',
      'audio-capture': 'não achei microfone nesta máquina',
      'language-not-supported': 'este navegador não reconhece fala em pt-BR',
    };
    this.errosFatais = new Set(['network', 'service-not-allowed', 'not-allowed', 'audio-capture', 'language-not-supported']);
    this.silencioTurnoMs = 900;
    this.vad = { minimo: 0.012, fator: 2.5, inicioMs: 250, silencioMs: 900, minimoFalaMs: 500, maximoFalaMs: 30_000, barge: 0.045, bargeMs: 320 };
    this.captura = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

    fetch('/api/projetos')
      .then((r) => r.json())
      .then((corpo) => { this.corretor = globalThis.PoliticaFala.CorretorDeNomes.doCatalogo(corpo.projetos ?? []); })
      .catch(() => {});

    fetch('/api/orquestracao/voz')
      .then((r) => r.json())
      .then((i) => {
        this.xaiDisponivel = Boolean(i.xai);
        this.diag('motores', {
          reconhecimento: this.temReconhecimento, gravacao: this.temGravacao, tipo: this.tipoGravacao,
          xai: this.xaiDisponivel, origem: location.origin,
        });
        this.aoMudar();
      })
      .catch(() => { this.xaiDisponivel = false; this.aoMudar(); });
  }

  resumo() {
    return { temReconhecimento: this.temReconhecimento, temGravacao: this.temGravacao, xaiDisponivel: this.xaiDisponivel };
  }

  corrigir(texto) {
    return this.corretor.corrigir(texto);
  }

  ouvir({ aoParcial, aoFinal, aoCorrecao, aoErro, aoFim, aoFalha } = {}) {
    const rec = new this.ClasseReconhecimento();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let mandouFinal = false;
    rec.onresult = (e) => {
      let parcial = '';
      let definitivo = '';
      for (const resultado of e.results) {
        if (resultado.isFinal) definitivo += resultado[0].transcript;
        else parcial += resultado[0].transcript;
      }
      if (definitivo.trim() && !mandouFinal) {
        mandouFinal = true;
        const { texto: corrigido, trocas } = this.corrigir(definitivo.trim());
        if (trocas.length) aoCorrecao?.(trocas);
        aoFinal?.(corrigido);
      } else if (parcial) aoParcial?.(parcial);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      this.diag('navegador-erro', { erro: e.error, modo: 'ptt' });
      aoErro?.(this.erros[e.error] ?? `o reconhecimento de voz falhou (${e.error})`);
      if (this.errosFatais.has(e.error)) aoFalha?.(e.error);
    };
    rec.onend = () => aoFim?.();
    rec.start();
    return { parar: () => rec.abort() };
  }

  ouvirContinuo({ aoUtterance, aoParcial, aoErro, aoCorrecao, aoFalha, aoInterromper, interromper = false } = {}) {
    let ativo = true;
    let rec = null;
    let bufferFinal = '';
    let timerSilencio = null;
    const fecharTurno = () => {
      const bruto = bufferFinal.trim();
      bufferFinal = '';
      if (!bruto) return;
      const { texto: corrigido, trocas } = this.corrigir(bruto);
      if (trocas.length) aoCorrecao?.(trocas);
      aoUtterance?.(corrigido);
    };
    const agendarFechamento = () => {
      clearTimeout(timerSilencio);
      timerSilencio = setTimeout(fecharTurno, this.silencioTurnoMs);
    };
    const iniciar = () => {
      rec = new this.ClasseReconhecimento();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let parcial = '';
        let novosFinais = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const resultado = e.results[i];
          if (resultado.isFinal) novosFinais += (novosFinais ? ' ' : '') + resultado[0].transcript.trim();
          else parcial += resultado[0].transcript;
        }
        if (this.emFala()) {
          if (!interromper) return;
          const candidato = [bufferFinal, novosFinais, parcial].filter(Boolean).join(' ').trim();
          const palavras = candidato.split(/\s+/).filter(Boolean).length;
          const interimCurto = !novosFinais.trim() && palavras < 2;
          if (!SessaoConversa.deveInterromper({ candidato, eco: this.pareceEco(candidato), interimCurto })) return;
          aoInterromper?.();
        }
        if (novosFinais.trim()) {
          bufferFinal += (bufferFinal ? ' ' : '') + novosFinais.trim();
          agendarFechamento();
        }
        if (parcial) aoParcial?.((bufferFinal ? bufferFinal + ' ' : '') + parcial);
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        this.diag('navegador-erro', { erro: e.error, modo: 'copiloto' });
        aoErro?.(this.erros[e.error] ?? `o reconhecimento de voz falhou (${e.error})`);
        if (this.errosFatais.has(e.error)) { ativo = false; aoFalha?.(e.error); }
      };
      rec.onend = () => { if (ativo) iniciar(); };
      rec.start();
    };
    iniciar();
    return { parar: () => { ativo = false; clearTimeout(timerSilencio); rec?.abort(); } };
  }

  async transcreverBlob(blob) {
    const r = await fetch('/api/orquestracao/voz/transcrever', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    if (r.status === 401) throw new Error('a transcrição xAI exige a sessão do painel: abra o C-3PO por painel.vpn.astargne.com, logado no astargne.com');
    if (r.status === 503) throw new Error('a transcrição xAI não está configurada no painel (XAI_API_KEY)');
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 403 && dados.erro === 'origem privilegiada recusada'
      ? 'a transcrição xAI não aceitou esta origem'
      : (dados.erro ?? `transcrição falhou (${r.status})`));
    return String(dados.texto ?? '').trim();
  }

  criarMedidor(stream) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().then(() => this.diag('audiocontext', { estado: ctx.state })).catch((e) => this.diag('audiocontext-erro', { erro: String(e) }));
    const fonte = ctx.createMediaStreamSource(stream);
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    const dados = new Float32Array(analisador.fftSize);
    let ruido = 0.005;
    const vad = this.vad;
    return {
      nivel() {
        analisador.getFloatTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i++) soma += dados[i] * dados[i];
        return Math.sqrt(soma / dados.length);
      },
      falando(rms) {
        const limiar = Math.max(vad.minimo, ruido * vad.fator);
        if (rms < limiar) ruido = ruido * 0.95 + rms * 0.05;
        return rms >= limiar;
      },
      piso() { return ruido; },
      fechar() { ctx.close().catch(() => {}); },
    };
  }

  ouvirXai({ aoParcial, aoFinal, aoCorrecao, aoErro, aoFim } = {}) {
    let recorder = null; let stream = null; let medidor = null; let cancelado = false;
    const partes = [];
    (async () => {
      try {
        if (!this.tipoGravacao) throw new Error('nenhum formato de áudio compatível neste navegador');
        stream = await navigator.mediaDevices.getUserMedia(this.captura);
        medidor = this.criarMedidor(stream);
        recorder = new MediaRecorder(stream, { mimeType: this.tipoGravacao });
        recorder.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
        const fim = new Promise((resolve) => { recorder.onstop = resolve; });
        recorder.start(250);
        aoParcial?.('(gravando… pare de falar para eu transcrever)');
        let falou = false; let silencioDesde = 0; const inicio = Date.now();
        await new Promise((resolve) => {
          const laco = setInterval(() => {
            if (cancelado || recorder.state === 'inactive') { clearInterval(laco); resolve(); return; }
            const agora = Date.now();
            if (medidor.falando(medidor.nivel())) { falou = true; silencioDesde = 0; }
            else if (falou) { silencioDesde ||= agora; if (agora - silencioDesde > this.vad.silencioMs) { clearInterval(laco); resolve(); } }
            if (agora - inicio > this.vad.maximoFalaMs + 15_000) { clearInterval(laco); resolve(); }
          }, 100);
        });
        if (recorder.state !== 'inactive') recorder.stop();
        await fim;
        if (cancelado) return;
        if (!falou) { aoErro?.('não captei nenhum som, Mestre — clique no microfone e fale de novo'); return; }
        aoParcial?.('(transcrevendo…)');
        const texto = await this.transcreverBlob(new Blob(partes, { type: this.tipoGravacao }));
        if (!texto) { aoErro?.('a transcrição voltou vazia — tente de novo'); return; }
        const { texto: corrigido, trocas } = this.corrigir(texto);
        if (trocas.length) aoCorrecao?.(trocas);
        aoFinal?.(corrigido);
      } catch (erro) {
        aoErro?.(erro.name === 'NotAllowedError' ? this.erros['not-allowed'] : erro.message);
      } finally {
        medidor?.fechar(); stream?.getTracks().forEach((t) => t.stop()); aoFim?.();
      }
    })();
    return { parar: () => { cancelado = true; if (recorder && recorder.state !== 'inactive') recorder.stop(); } };
  }

  ouvirContinuoXai({ aoUtterance, aoErro, aoCorrecao, aoNivel, aoFalha, aoInterromper, interromper = false } = {}) {
    let ativo = true; let stream = null; let medidor = null; let laco = null;
    (async () => {
      try {
        if (!this.tipoGravacao) throw new Error('nenhum formato de áudio compatível neste navegador');
        stream = await navigator.mediaDevices.getUserMedia(this.captura);
        if (!ativo) { stream.getTracks().forEach((t) => t.stop()); return; }
        this.diag('copiloto-xai-mic', { faixas: stream.getAudioTracks().map((t) => ({ rotulo: t.label.slice(0, 40), ativa: t.enabled, muda: t.muted, estado: t.readyState })) });
        medidor = this.criarMedidor(stream);
        let recorder = null; let partes = []; let inicioFala = 0; let altoDesde = 0; let silencioDesde = 0;
        let amostras = 0; let maximo = 0; let detectadas = 0; let ultimoResumo = Date.now();
        const fechar = async () => {
          const rec = recorder; recorder = null;
          if (!rec) return;
          const duracao = Date.now() - inicioFala;
          const fim = new Promise((resolve) => { rec.onstop = resolve; });
          rec.stop(); await fim;
          const blob = new Blob(partes, { type: this.tipoGravacao }); partes = [];
          this.diag('copiloto-xai-trecho', { ms: duracao, bytes: blob.size, enviado: !(duracao < this.vad.minimoFalaMs || blob.size < 1000 || !ativo) });
          if (duracao < this.vad.minimoFalaMs || blob.size < 1000 || !ativo) return;
          try {
            const texto = await this.transcreverBlob(blob);
            this.diag('copiloto-xai-transcrito', { caracteres: texto.length });
            if (!texto || !ativo) return;
            const { texto: corrigido, trocas } = this.corrigir(texto);
            if (trocas.length) aoCorrecao?.(trocas);
            aoUtterance?.(corrigido);
          } catch (erro) {
            this.diag('copiloto-xai-erro', { erro: erro.message });
            aoErro?.(erro.message);
            if (/sessão do painel|não está configurada|não aceitou esta origem|origem privilegiada/.test(erro.message)) { ativo = false; aoFalha?.(erro.message); }
          }
        };
        laco = setInterval(() => {
          if (!ativo) { clearInterval(laco); if (recorder) fechar(); return; }
          const agora = Date.now();
          const rms = medidor.nivel();
          const alto = medidor.falando(rms);
          amostras++; if (rms > maximo) maximo = rms; if (alto) detectadas++;
          if (amostras % 3 === 0) aoNivel?.(rms, alto, this.emFala());
          if (agora - ultimoResumo > 5000) {
            this.diag('copiloto-xai-nivel', { maximo: Number(maximo.toFixed(4)), amostras, altas: detectadas, gravando: Boolean(recorder), emFala: this.emFala() });
            ultimoResumo = agora; amostras = 0; maximo = 0; detectadas = 0;
          }
          if (this.emFala() && !recorder) {
            if (!interromper) { altoDesde = 0; return; }
            const limiar = Math.max(this.vad.barge, medidor.piso() * 4);
            if (rms < limiar) { altoDesde = 0; return; }
            altoDesde ||= agora;
            if (agora - altoDesde < this.vad.bargeMs) return;
            aoInterromper?.();
          }
          if (!recorder) {
            if (alto) {
              altoDesde ||= agora;
              if (agora - altoDesde >= this.vad.inicioMs) {
                recorder = new MediaRecorder(stream, { mimeType: this.tipoGravacao });
                recorder.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
                recorder.start(250); inicioFala = altoDesde; silencioDesde = 0;
              }
            } else altoDesde = 0;
            return;
          }
          if (alto) silencioDesde = 0; else silencioDesde ||= agora;
          if ((silencioDesde && agora - silencioDesde > this.vad.silencioMs) || agora - inicioFala > this.vad.maximoFalaMs) { altoDesde = 0; fechar(); }
        }, 100);
      } catch (erro) {
        ativo = false;
        this.diag('copiloto-xai-falha', { erro: erro.name ?? '', msg: String(erro.message).slice(0, 120) });
        const msg = erro.name === 'NotAllowedError' ? this.erros['not-allowed'] : erro.message;
        aoErro?.(msg);
        aoFalha?.(erro.name || msg);
      }
    })();
    const dono = this;
    return { parar() { ativo = false; clearInterval(laco); medidor?.fechar(); stream?.getTracks().forEach((t) => t.stop()); dono.diag('copiloto-xai-parou'); } };
  }
}

globalThis.Escuta = Escuta;
