// Alto-falante do C-3PO: ElevenLabs, e o Antônio quando ela cai.
// Um 429 não desliga a camada da sessão. A chave não passa por aqui.

class Locutor {
  constructor({ diag = () => {}, aoMudar = () => {} } = {}) {
    const { Fala, Eco, RetentativaEleven } = globalThis.PoliticaFala;
    this.Fala = Fala;
    this.Eco = Eco;
    this.RetentativaEleven = RetentativaEleven;
    this.diag = diag;
    this.aoMudar = aoMudar;
    this.elevenDisponivel = null;
    this.motivoQuedaEleven = '';
    this.vagasTts = 2;
    this.esperaTts = [];
    this.temSintese = 'speechSynthesis' in window;
    this.vozEscolhida = null;
    this.vozEhAntonio = false;
    this.locutorAtivo = null;
    this.blocosEmFala = 0;
    this.textoFaladoRecente = '';
    this.motivos = {
      'sem-chave-elevenlabs': 'ElevenLabs sem chave',
      'elevenlabs-inalcancavel': 'ElevenLabs fora de alcance',
      'elevenlabs-recusou': 'ElevenLabs recusou a síntese',
      'elevenlabs-ocupada': 'ElevenLabs no limite de sínteses simultâneas',
    };

    fetch('/api/tts')
      .then((r) => r.json())
      .then((info) => {
        if (this.elevenDisponivel === false) return;
        this.elevenDisponivel = Boolean(info.disponivel);
        if (!this.elevenDisponivel) this.motivoQuedaEleven = this.motivos[info.motivo] ?? 'ElevenLabs indisponível';
        this.aoMudar();
      })
      .catch(() => {
        if (this.elevenDisponivel === false) return;
        this.elevenDisponivel = false;
        this.motivoQuedaEleven = 'ElevenLabs fora de alcance';
        this.aoMudar();
      });

    if (this.temSintese) {
      speechSynthesis.onvoiceschanged = () => this.escolherVoz();
      this.escolherVoz();
    }
  }

  emFala() {
    return this.blocosEmFala > 0;
  }

  resumo() {
    return {
      elevenDisponivel: this.elevenDisponivel,
      motivo: this.motivoQuedaEleven,
      temSintese: this.temSintese,
      vozEscolhida: this.vozEscolhida,
      vozEhAntonio: this.vozEhAntonio,
      vozesCarregadas: this.temSintese && speechSynthesis.getVoices().length > 0,
    };
  }

  escolherVoz() {
    const vozes = speechSynthesis.getVoices();
    if (!vozes.length) return;
    const ptBr = vozes.filter((v) => v.lang.toLowerCase().startsWith('pt-br'));
    const antonio = ptBr.find((v) => {
      const nome = this.Fala.normalizar(v.name);
      return nome.includes('antonio') && nome.includes('natural');
    });
    this.vozEscolhida = antonio ?? ptBr[0] ?? null;
    this.vozEhAntonio = Boolean(antonio);
    this.aoMudar();
  }

  pedirVaga() {
    if (this.vagasTts > 0) { this.vagasTts -= 1; return Promise.resolve(); }
    return new Promise((resolve) => this.esperaTts.push(resolve));
  }

  soltarVaga() {
    const proximo = this.esperaTts.shift();
    if (proximo) proximo();
    else this.vagasTts += 1;
  }

  cairParaAntonio(motivo) {
    const primeira = this.elevenDisponivel !== false;
    this.elevenDisponivel = false;
    this.motivoQuedaEleven = motivo;
    this.aoMudar();
    return primeira;
  }

  mudarBlocos(delta) {
    this.blocosEmFala = Math.max(0, this.blocosEmFala + delta);
  }

  pareceEco(texto) {
    return this.Eco.parece(texto, this.textoFaladoRecente);
  }

  calar() {
    this.locutorAtivo?.matar();
    if (this.temSintese) speechSynthesis.cancel();
    this.blocosEmFala = 0;
  }

  criar({ aoFalha } = {}) {
    const dono = this;
    this.textoFaladoRecente = '';
    let buffer = '';
    let vivo = true;
    let avisou = false;
    let primeiroBloco = true;
    let audioTocando = null;
    let filaAudio = Promise.resolve();
    const abortador = new AbortController();

    function avisarUmaVez(motivo) {
      if (avisou) return;
      avisou = true;
      aoFalha?.(motivo);
    }

    async function tentarSintese(texto) {
      await dono.pedirVaga();
      try {
        if (!vivo || abortador.signal.aborted) return null;
        const resposta = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ texto }),
          signal: abortador.signal,
        });
        dono.diag('tts-resposta', { status: resposta.status, tipo: resposta.headers.get('content-type') });
        if (!resposta.ok) {
          let motivo = 'ElevenLabs falhou';
          let ocupada = resposta.status === 429;
          try {
            const corpo = await resposta.json();
            motivo = dono.motivos[corpo.motivo] ?? motivo;
            ocupada = ocupada || corpo.motivo === 'elevenlabs-ocupada';
          } catch { /* resposta sem JSON: fica o motivo genérico */ }
          const erro = new Error(motivo);
          erro.ocupada = ocupada;
          throw erro;
        }
        return resposta.blob();
      } finally {
        dono.soltarVaga();
      }
    }

    async function sintetizarEleven(texto) {
      let ultimo;
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        try {
          return await tentarSintese(texto);
        } catch (erro) {
          if (abortador.signal.aborted || !vivo) throw erro;
          ultimo = erro;
          const passo = dono.RetentativaEleven.decidir({ ocupada: Boolean(erro.ocupada), tentativa });
          if (passo.agir === 'desistir') throw erro;
          if (passo.agir === 'esperar') await new Promise((resolve) => setTimeout(resolve, passo.ms));
        }
      }
      throw ultimo;
    }

    function tocar(blob) {
      return new Promise((resolve) => {
        if (!vivo) { resolve(); return; }
        const audio = new Audio(URL.createObjectURL(blob));
        audioTocando = audio;
        dono.mudarBlocos(1);
        const encerrar = () => {
          URL.revokeObjectURL(audio.src);
          if (audioTocando === audio) audioTocando = null;
          dono.mudarBlocos(-1);
          resolve();
        };
        audio.onended = () => { dono.diag('tts-tocou', { bytes: blob.size }); encerrar(); };
        audio.onerror = () => {
          dono.diag('tts-audio-erro', { bytes: blob.size, tipo: blob.type, codigo: audio.error?.code ?? null });
          avisarUmaVez('o navegador não conseguiu tocar o áudio da ElevenLabs — seguindo só no texto');
          encerrar();
        };
        audio.play().catch((erro) => {
          dono.diag('tts-play-recusado', { erro: erro?.name ?? String(erro) });
          avisarUmaVez('o navegador bloqueou o áudio — clique na página e pergunte de novo');
          encerrar();
        });
      });
    }

    function falarBlocoAntonio(texto) {
      if (!vivo || !dono.temSintese || !dono.vozEscolhida) return;
      const fala = new SpeechSynthesisUtterance(texto);
      fala.voice = dono.vozEscolhida;
      fala.lang = dono.vozEscolhida.lang;
      fala.rate = 1;
      fala.pitch = 1;
      dono.mudarBlocos(1);
      fala.onend = () => dono.mudarBlocos(-1);
      fala.onerror = (e) => {
        dono.mudarBlocos(-1);
        if (e.error === 'canceled' || e.error === 'interrupted') return;
        vivo = false;
        speechSynthesis.cancel();
        avisarUmaVez('a voz falhou (o Antônio precisa de internet) — seguindo só no texto');
      };
      speechSynthesis.speak(fala);
    }

    function falarBlocoEleven(texto) {
      const pedido = sintetizarEleven(texto);
      pedido.catch(() => {});
      filaAudio = filaAudio.then(async () => {
        if (!vivo) return;
        if (dono.elevenDisponivel === false) { falarBlocoAntonio(texto); return; }
        try {
          const blob = await pedido;
          if (!blob || !vivo) return;
          await tocar(blob);
        } catch (erro) {
          if (!vivo) return;
          if (erro.ocupada) { falarBlocoAntonio(texto); return; }
          if (dono.cairParaAntonio(erro.message)) avisarUmaVez(`a voz caiu para o navegador — ${erro.message}`);
          falarBlocoAntonio(texto);
        }
      });
    }

    function falarBloco(bruto) {
      const texto = dono.Fala.limpar(bruto);
      if (!texto || !vivo) return;
      dono.textoFaladoRecente = `${dono.textoFaladoRecente} ${texto}`.trim().slice(-700);
      if (dono.elevenDisponivel !== false) falarBlocoEleven(texto);
      else falarBlocoAntonio(texto);
    }

    function despejar(ateOFim) {
      let corte;
      while (vivo && (corte = dono.Fala.corte(buffer, primeiroBloco ? 1 : dono.Fala.MIN_BLOCO)) !== -1) {
        falarBloco(buffer.slice(0, corte + 1));
        buffer = buffer.slice(corte + 1);
        primeiroBloco = false;
      }
      if (ateOFim && buffer.trim()) { falarBloco(buffer); buffer = ''; }
    }

    const locutor = {
      alimentar(texto) { if (!vivo) return; buffer += texto; despejar(false); },
      concluir() { despejar(true); },
      matar() {
        vivo = false;
        buffer = '';
        abortador.abort();
        if (audioTocando) { audioTocando.pause(); audioTocando = null; }
      },
    };
    this.locutorAtivo = locutor;
    return locutor;
  }
}

globalThis.Locutor = Locutor;
