// Voz do Severino — Web Speech API + camada ElevenLabs, zero dependências.
// Cadeia de degradação DECLARADA (upgrade de 14/08/2026): ElevenLabs (via
// POST /api/tts, áudio em fila sequencial) → speechSynthesis (Antônio) → só
// texto — cada queda avisada na linha de status com o motivo. Carrega ANTES
// de chat.js: define o global `Voz` que o chat consome. Nunca quebra o texto.

const Voz = (() => {
  const statusVoz = document.getElementById('status-voz');

  // ---------- Camada 1: ElevenLabs (voz principal) ----------

  // null = sonda em voo (a primeira fala tenta mesmo assim — o POST responde
  // a mesma verdade); true/false depois da sonda ou da primeira queda.
  let elevenDisponivel = null;
  let motivoQuedaEleven = '';

  const MOTIVOS_TTS = {
    'sem-chave-elevenlabs': 'ElevenLabs sem chave',
    'elevenlabs-inalcancavel': 'ElevenLabs fora de alcance',
    'elevenlabs-recusou': 'ElevenLabs recusou a síntese',
  };

  // Sonda barata na carga (GET não sintetiza nada): declara a camada ativa na
  // linha de status antes da primeira fala, em vez de descobrir no susto.
  fetch('/api/tts')
    .then((r) => r.json())
    .then((info) => {
      if (elevenDisponivel === false) return; // uma queda real já decidiu
      elevenDisponivel = Boolean(info.disponivel);
      if (!elevenDisponivel) motivoQuedaEleven = MOTIVOS_TTS[info.motivo] ?? 'ElevenLabs indisponível';
      atualizarStatus();
    })
    .catch(() => {
      if (elevenDisponivel === false) return;
      elevenDisponivel = false;
      motivoQuedaEleven = 'ElevenLabs fora de alcance';
      atualizarStatus();
    });

  // Queda em runtime: desliga a camada para o resto da sessão (cada bloco
  // re-tentando seria pausa longa em toda sentença) e declara o motivo.
  // Devolve true só na PRIMEIRA queda — quem chamou avisa uma vez na conversa.
  function cairParaAntonio(motivo) {
    const primeira = elevenDisponivel !== false;
    elevenDisponivel = false;
    motivoQuedaEleven = motivo;
    atualizarStatus();
    return primeira;
  }

  // ---------- Camada 2: síntese do navegador (Antônio) ----------

  const temSintese = 'speechSynthesis' in window;

  // Voz do fallback decidida pelo dono (00_PLANO.md, 14/08/2026): "Microsoft
  // Antônio Online (Natural)", velocidade e tom 1.0. É voz DO EDGE e ONLINE —
  // em outro navegador (ou sem internet) vale o fallback declarado abaixo.
  let vozEscolhida = null;
  let vozEhAntonio = false;

  // Sem acento e sem caixa: o nome real no Edge é em inglês ("Microsoft
  // Antonio Online (Natural) - Portuguese (Brazil)") e a grafia exata pode
  // variar por versão/idioma da UI do navegador.
  const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  function escolherVoz() {
    const vozes = speechSynthesis.getVoices();
    if (!vozes.length) return; // getVoices é assíncrono; voiceschanged chama de novo
    const ptBr = vozes.filter((v) => v.lang.toLowerCase().startsWith('pt-br'));
    const antonio = ptBr.find((v) => {
      const nome = normalizar(v.name);
      return nome.includes('antonio') && nome.includes('natural');
    });
    // Fallback declarado do plano: sem Antônio, a primeira voz pt-BR que
    // existir — e o status abaixo avisa qual está em uso.
    vozEscolhida = antonio ?? ptBr[0] ?? null;
    vozEhAntonio = Boolean(antonio);
    atualizarStatus();
  }

  if (temSintese) {
    speechSynthesis.onvoiceschanged = escolherVoz;
    escolherVoz();
  }

  // ---------- Fluidez: limpeza de marcação + blocos maiores ----------

  // Fala é texto corrido (contrato do upgrade): a marcação fica na TELA, não
  // na boca — nada de ler asterisco, cerquilha, crase ou colchete de link.
  // Emoji e setas também não se leem; viram nada ou pausa.
  function limparParaFala(texto) {
    return texto
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link markdown: só o texto visível
      .replace(/[*`#~]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')            // marcador de lista
      .replace(/\|/g, ', ')                    // linha de tabela vira enumeração
      .replace(/_/g, ' ')
      .replace(/[→⇒]/g, ', ')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  // Blocos maiores e naturais (a queixa real do dono era fala picada):
  // parágrafo (linha em branco) corta sempre — é respiração natural; fim de
  // sentença (.!?… + espaço — não corta "3.5" nem "01:32") ou quebra de linha
  // só cortam depois de acumular o mínimo. O primeiro bloco sai na primeira
  // sentença para a fala não demorar a começar.
  const MIN_BLOCO = 160;

  function acharCorte(texto, minimo) {
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '\n') {
        let j = i + 1;
        while (j < texto.length && (texto[j] === ' ' || texto[j] === '\t')) j++;
        if (texto[j] === '\n') return i; // parágrafo: corta mesmo curto
        if (i + 1 >= minimo) return i;
      } else if ('.!?…'.includes(c) && i + 1 < texto.length && /\s/.test(texto[i + 1])) {
        if (i + 1 >= minimo) return i;
      }
    }
    return -1;
  }

  // ---------- Locutor (um por resposta) ----------

  let locutorAtivo = null;

  // Acumula tokens e fala por bloco — nem espera a resposta inteira, nem
  // fragmenta por token. Cada bloco tenta a ElevenLabs; na falha cai para o
  // Antônio declarando; sem nada, o texto já está na tela.
  function criarLocutor({ aoFalha } = {}) {
    let buffer = '';
    let vivo = true;
    let avisou = false;
    let primeiroBloco = true;
    let audioTocando = null;
    // A fila é uma cadeia de promises: os downloads dos blocos correm em
    // PARALELO (o próximo baixa enquanto o atual toca — a pausa entre blocos
    // vira respiração, não travada), mas o áudio toca em ORDEM.
    let filaAudio = Promise.resolve();
    const abortador = new AbortController();

    function avisarUmaVez(motivo) {
      if (avisou) return;
      avisou = true;
      aoFalha?.(motivo);
    }

    async function sintetizarEleven(texto) {
      const resposta = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto }),
        signal: abortador.signal,
      });
      if (!resposta.ok) {
        let motivo = 'ElevenLabs falhou';
        try {
          const corpo = await resposta.json();
          motivo = MOTIVOS_TTS[corpo.motivo] ?? motivo;
        } catch { /* resposta sem JSON: fica o motivo genérico */ }
        throw new Error(motivo);
      }
      return resposta.blob();
    }

    function tocar(blob) {
      return new Promise((resolve) => {
        if (!vivo) {
          resolve();
          return;
        }
        const audio = new Audio(URL.createObjectURL(blob));
        audioTocando = audio;
        const encerrar = () => {
          URL.revokeObjectURL(audio.src);
          if (audioTocando === audio) audioTocando = null;
          resolve();
        };
        audio.onended = encerrar;
        audio.onerror = encerrar;
        audio.play().catch(() => {
          // autoplay bloqueado: declara uma vez e segue só no texto
          avisarUmaVez('o navegador bloqueou o áudio — clique na página e pergunte de novo');
          encerrar();
        });
      });
    }

    function falarBlocoEleven(texto) {
      const pedido = sintetizarEleven(texto);
      pedido.catch(() => {}); // a rejeição é tratada dentro da fila, na vez do bloco
      filaAudio = filaAudio.then(async () => {
        if (!vivo) return;
        // Alguém já caiu enquanto este bloco esperava a vez: não mistura
        // motores fora de ordem.
        if (elevenDisponivel === false) {
          falarBlocoAntonio(texto);
          return;
        }
        try {
          const blob = await pedido;
          await tocar(blob);
        } catch (erro) {
          if (!vivo) return; // abort do calar() não é queda
          if (cairParaAntonio(erro.message)) {
            avisarUmaVez(`a voz caiu para o Antônio — ${erro.message}`);
          }
          falarBlocoAntonio(texto);
        }
      });
    }

    function falarBlocoAntonio(texto) {
      // Sem síntese ou sem voz pt-BR: degrada calado — a linha de status já
      // declarou "só texto" com o motivo; a resposta segue na tela.
      if (!vivo || !temSintese || !vozEscolhida) return;
      const fala = new SpeechSynthesisUtterance(texto);
      fala.voice = vozEscolhida;
      fala.lang = vozEscolhida.lang;
      fala.rate = 1; // decisão do dono: velocidade e tom padrão
      fala.pitch = 1;
      fala.onerror = (e) => {
        if (e.error === 'canceled' || e.error === 'interrupted') return; // calar() não é falha
        // O Antônio é voz online: sem internet a síntese cai aqui. Avisa uma
        // vez, esvazia a fila e a resposta segue só no texto.
        vivo = false;
        speechSynthesis.cancel();
        avisarUmaVez('a voz falhou (o Antônio precisa de internet) — seguindo só no texto');
      };
      speechSynthesis.speak(fala); // a fila do navegador toca em ordem
    }

    function falarBloco(bruto) {
      const texto = limparParaFala(bruto);
      if (!texto || !vivo) return;
      // null (sonda em voo) tenta a ElevenLabs mesmo assim: o POST responde a
      // mesma verdade e a queda é tratada declarando.
      if (elevenDisponivel !== false) falarBlocoEleven(texto);
      else falarBlocoAntonio(texto);
    }

    function despejar(ateOFim) {
      let corte;
      while (vivo && (corte = acharCorte(buffer, primeiroBloco ? 1 : MIN_BLOCO)) !== -1) {
        falarBloco(buffer.slice(0, corte + 1));
        buffer = buffer.slice(corte + 1);
        primeiroBloco = false;
      }
      if (ateOFim && buffer.trim()) {
        falarBloco(buffer);
        buffer = '';
      }
    }

    const locutor = {
      alimentar(texto) {
        if (!vivo) return;
        buffer += texto;
        despejar(false);
      },
      concluir() {
        despejar(true);
      },
      matar() {
        vivo = false;
        buffer = '';
        abortador.abort(); // download em voo de áudio que ninguém vai ouvir
        if (audioTocando) {
          audioTocando.pause();
          audioTocando = null;
        }
      },
    };
    locutorAtivo = locutor;
    return locutor;
  }

  // Corta a fala na hora — usado antes de nova pergunta e antes de ouvir o
  // microfone (senão o reconhecimento captura a própria voz do Severino).
  function calar() {
    locutorAtivo?.matar();
    if (temSintese) speechSynthesis.cancel();
  }

  // ---------- Reconhecimento (Severino ouvindo) ----------

  const ClasseReconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
  const temReconhecimento = Boolean(ClasseReconhecimento);

  // Erro de reconhecimento vira mensagem clara na UI, não console silencioso
  // (contrato). O reconhecimento do Edge/Chrome é serviço online: rede conta.
  const ERROS_RECONHECIMENTO = {
    'not-allowed': 'o navegador está sem permissão de microfone — libere nas configurações do site e tente de novo',
    'service-not-allowed': 'o serviço de reconhecimento de voz está bloqueado neste navegador',
    network: 'o reconhecimento de voz precisa de internet e não alcançou o serviço',
    'no-speech': 'não ouvi nada, patrão — clique no microfone e fale de novo',
    'audio-capture': 'não achei microfone nesta máquina',
    'language-not-supported': 'este navegador não reconhece fala em pt-BR',
  };

  // Push-to-talk do contrato: UMA captura por clique (continuous: false),
  // encerra sozinha no silêncio — nunca sempre-ouvindo, sem hotword.
  function ouvir({ aoParcial, aoFinal, aoErro, aoFim } = {}) {
    const rec = new ClasseReconhecimento();
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
        aoFinal?.(definitivo.trim());
      } else if (parcial) {
        aoParcial?.(parcial);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return; // o próprio usuário cancelou no botão
      aoErro?.(ERROS_RECONHECIMENTO[e.error] ?? `o reconhecimento de voz falhou (${e.error})`);
    };
    rec.onend = () => aoFim?.();
    rec.start();
    // Segundo clique é cancelar (abort), não concluir: com continuous: false a
    // captura já termina sozinha no silêncio — clicar de novo é desistência.
    return { parar: () => rec.abort() };
  }

  // ---------- Status declarado na UI ----------

  // A linha de status diz sempre a camada ATIVA e, se houve queda, o motivo:
  // "voz: ElevenLabs" / "voz: Antônio — ElevenLabs sem chave" / "só texto — …"
  // (contrato do upgrade).
  function atualizarStatus() {
    const partes = [];
    if (!temReconhecimento) partes.push('microfone indisponível neste navegador — use Edge ou Chrome');

    if (elevenDisponivel === true) {
      partes.push('voz: ElevenLabs');
    } else if (elevenDisponivel === null) {
      partes.push('voz: conferindo a ElevenLabs…');
    } else if (temSintese && vozEscolhida) {
      partes.push(vozEhAntonio
        ? `voz: Antônio — ${motivoQuedaEleven}`
        : `voz: "${vozEscolhida.name}" — ${motivoQuedaEleven}, e o Antônio não está neste navegador`);
    } else if (temSintese && !speechSynthesis.getVoices().length) {
      partes.push(`${motivoQuedaEleven} — procurando voz do navegador…`);
    } else {
      partes.push(`só texto — ${motivoQuedaEleven}, e ${temSintese
        ? 'nenhuma voz pt-BR neste navegador'
        : 'a síntese de voz não existe neste navegador'}`);
    }

    statusVoz.textContent = partes.join(' · ');
    statusVoz.classList.toggle('atencao', !temReconhecimento || elevenDisponivel !== true);
  }

  atualizarStatus();

  return { temReconhecimento, temSintese, criarLocutor, calar, ouvir };
})();
