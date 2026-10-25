// Voz do Severino — Web Speech API + camada ElevenLabs, zero dependências.
// Cadeia de degradação DECLARADA (upgrade de 14/08/2026): ElevenLabs (via
// POST /api/tts, áudio em fila sequencial, com 1 retry por bloco antes de
// declarar queda — 20/08/2026) → speechSynthesis (Antônio) → só texto — cada
// queda avisada na linha de status com o motivo. Reconhecimento (fala do
// dono) passa por correção de nomes próprios e termos técnicos contra um
// catálogo antes de sair (20/08/2026, ampliado 21/08/2026) — rec.lang fixo
// em pt-BR não entende termo em inglês, então corrige depois, declarando a
// troca. Modo copiloto (21/08/2026): escuta contínua opcional com gatilho de
// retomada ("C3PO") depois de um hiato — ver `ouvirContinuo`/`detectarGatilho`
// mais abaixo; o push-to-talk (`ouvir`) continua existindo como modo padrão.
// Carrega ANTES de chat.js: define o global `Voz` que o chat consome. Nunca
// quebra o texto.

const Voz = (() => {
  const statusVoz = document.getElementById('status-voz');
  // Diagnóstico no journal do painel (POST /api/diagnostico/voz): o que o
  // navegador vê e o servidor não. Nunca áudio, nunca o texto da conversa.
  function diag(evento, dados = {}) {
    try {
      const corpo = JSON.stringify({ evento, t: new Date().toISOString(), ua: navigator.userAgent.slice(0, 80), ...dados });
      if (!navigator.sendBeacon?.('/api/diagnostico/voz', new Blob([corpo], { type: 'application/json' }))) {
        fetch('/api/diagnostico/voz', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
      }
    } catch { /* diagnóstico nunca atrapalha */ }
  }

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

  // Queda em runtime (depois do retry único de `sintetizarEleven` já ter
  // falhado 2x): desliga a camada para o resto da sessão — insistir bloco
  // após bloco além do retry seria pausa longa em toda sentença — e declara
  // o motivo. Devolve true só na PRIMEIRA queda — quem chamou avisa uma vez.
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

  // Quantos blocos de fala estão em voo (baixando ou tocando) agora — usado
  // pelo modo copiloto (`ouvirContinuo` abaixo) para não escutar a própria
  // voz do Severino enquanto ele fala. Contador, não booleano: blocos de
  // ElevenLabs baixam em paralelo mas tocam em ordem, então mais de um pode
  // estar "em voo" ao mesmo tempo.
  let blocosEmFala = 0;
  const mudarBlocosEmFala = (delta) => { blocosEmFala = Math.max(0, blocosEmFala + delta); };

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

    async function tentarSintese(texto) {
      const resposta = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto }),
        signal: abortador.signal,
      });
      diag('tts-resposta', { status: resposta.status, tipo: resposta.headers.get('content-type') });
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

    // Falha isolada (rede com solavanco, 5xx passageiro) não deve trocar de
    // motor no meio da fala: UMA retentativa antes de declarar queda de
    // verdade — decisão do dono (20/08/2026), preferindo um pouco mais de
    // latência num bloco raro a perder a voz boa pro resto da conversa por
    // um blip. Só a segunda falha desce para `cairParaAntonio`.
    async function sintetizarEleven(texto) {
      try {
        return await tentarSintese(texto);
      } catch (erro) {
        if (abortador.signal.aborted) throw erro; // calar(): não insiste
        return await tentarSintese(texto);
      }
    }

    function tocar(blob) {
      return new Promise((resolve) => {
        if (!vivo) {
          resolve();
          return;
        }
        const audio = new Audio(URL.createObjectURL(blob));
        audioTocando = audio;
        mudarBlocosEmFala(1);
        const encerrar = () => {
          URL.revokeObjectURL(audio.src);
          if (audioTocando === audio) audioTocando = null;
          mudarBlocosEmFala(-1);
          resolve();
        };
        audio.onended = () => { diag('tts-tocou', { bytes: blob.size }); encerrar(); };
        audio.onerror = () => {
          // Blob chegou mas o elemento não tocou (formato/decodificador): sem
          // declarar, a resposta vira "só texto" sem explicação.
          diag('tts-audio-erro', { bytes: blob.size, tipo: blob.type, codigo: audio.error?.code ?? null });
          avisarUmaVez('o navegador não conseguiu tocar o áudio da ElevenLabs — seguindo só no texto');
          encerrar();
        };
        audio.play().catch((erro) => {
          // autoplay bloqueado: declara uma vez e segue só no texto
          diag('tts-play-recusado', { erro: erro?.name ?? String(erro) });
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
      mudarBlocosEmFala(1);
      fala.onend = () => mudarBlocosEmFala(-1);
      fala.onerror = (e) => {
        mudarBlocosEmFala(-1);
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
    blocosEmFala = 0; // matar()/cancel() não disparam onended/onend — zera na marra
  }

  // ---------- Correção de nomes próprios (catálogo de projetos.js) ----------

  // A Web Speech API não faz reconhecimento bilíngue: com `rec.lang` fixo em
  // pt-BR (abaixo), nome de projeto em inglês (SistemaLoreEngine,
  // DiscordTranscriber…) sai com encaixe fonético torto ("sistema lory
  // endine"). Corrige DEPOIS do reconhecimento, por distância de edição
  // contra o catálogo real (`GET /api/projetos` — mesma fonte da aba
  // Projetos, sem lista de nomes duplicada aqui) — nunca silenciosa: quem
  // ouve o resultado final recebe o texto corrigido E a lista do que mudou.
  let catalogoNomes = [];

  // Termos técnicos comuns nos projetos da raiz (21/08/2026, pedido do dono:
  // captura de termo em inglês era "bem bosta"). Palavra única aqui é aceita
  // — ao contrário do catálogo de projetos abaixo — mas com limiar mais alto
  // (ver SIMILARIDADE_MINIMA_PALAVRA_UNICA) para não corrigir palavra comum
  // que só soa parecida. Cobre o vocabulário dos CLAUDE.md da raiz; se um
  // termo continuar saindo torto, é questão de somar a esta lista.
  const TERMOS_TECNICOS_CONHECIDOS = [
    'Fastify', 'Drizzle', 'PostGIS', 'pgRouting', 'Tailscale', 'ElevenLabs',
    'Vultr', 'RackNerd', 'Mermaid', 'systemd', 'Caddy', 'TypeScript',
    'React', 'Vite', 'Docker', 'GitHub', 'Ollama', 'Whisper', 'Anthropic',
    'Claude', 'Postgres', 'MariaDB', 'rAthena', 'Capacitor', 'Tizen',
  ];

  const SIMILARIDADE_MINIMA_PALAVRA_UNICA = 0.82;

  fetch('/api/projetos')
    .then((r) => r.json())
    .then((corpo) => {
      const vistos = new Set();
      const doCatalogo = (corpo.projetos ?? [])
        .flatMap((p) => [p.pasta, p.titulo])
        .filter((nome) => nome && !vistos.has(nome) && vistos.add(nome))
        .map((nome) => ({ exibicao: nome, falado: separarPalavras(nome) }))
        .filter((alvo) => alvo.falado.length >= 2); // 1 palavra: risco alto de falso positivo
      const doGlossario = TERMOS_TECNICOS_CONHECIDOS
        .map((nome) => ({ exibicao: nome, falado: separarPalavras(nome), limiar: SIMILARIDADE_MINIMA_PALAVRA_UNICA }));
      catalogoNomes = [...doCatalogo, ...doGlossario];
    })
    .catch(() => { /* sem catálogo: correção fica desligada, reconhecimento cru segue */ });

  // "SistemaLoreEngine" -> ['sistema','lore','engine']; "Mapa Khorvaire" ->
  // mesma coisa a partir do espaço — cobre tanto `pasta` quanto `titulo`.
  function separarPalavras(nome) {
    return normalizar(nome)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((p) => p.toLowerCase());
  }

  function distanciaEdicao(a, b) {
    const linha = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) linha[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let anterior = linha[0];
      linha[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = linha[j];
        linha[j] = a[i - 1] === b[j - 1]
          ? anterior
          : 1 + Math.min(anterior, linha[j], linha[j - 1]);
        anterior = temp;
      }
    }
    return linha[b.length];
  }

  // Troca janelas de N palavras do texto reconhecido pelo nome oficial quando
  // a distância de edição (normalizada pelo tamanho) indica que é o mesmo
  // nome dito torto pelo reconhecedor.
  const SIMILARIDADE_MINIMA = 0.72;

  function corrigirNomesProprios(texto) {
    if (!catalogoNomes.length) return { texto, trocas: [] };
    const palavras = texto.split(/(\s+)/); // mantém os espaços pra remontar depois
    const indices = palavras.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i !== -1);
    const trocas = [];

    for (const alvo of catalogoNomes) {
      for (let ini = 0; ini + alvo.falado.length <= indices.length; ini++) {
        const fim = ini + alvo.falado.length;
        const janelaTexto = indices.slice(ini, fim).map((i) => palavras[i]).join(' ');
        const juntoJanela = normalizar(janelaTexto).replace(/[^a-z0-9]/gi, '');
        const juntoAlvo = alvo.falado.join('');
        if (!juntoJanela) continue;
        const distancia = distanciaEdicao(juntoJanela, juntoAlvo);
        const similaridade = 1 - distancia / Math.max(juntoJanela.length, juntoAlvo.length);
        if (similaridade >= (alvo.limiar ?? SIMILARIDADE_MINIMA) && janelaTexto.toLowerCase() !== alvo.exibicao.toLowerCase()) {
          palavras[indices[ini]] = alvo.exibicao;
          for (let k = ini + 1; k < fim; k++) palavras[indices[k]] = '';
          trocas.push(`"${janelaTexto}" → "${alvo.exibicao}"`);
          break; // já casou essa janela com um alvo; não tenta outro nela
        }
      }
    }

    return { texto: palavras.join('').replace(/\s{2,}/g, ' ').trim(), trocas };
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
    'no-speech': 'não captei nenhum som, Mestre — clique no microfone e fale de novo',
    'audio-capture': 'não achei microfone nesta máquina',
    'language-not-supported': 'este navegador não reconhece fala em pt-BR',
  };

  // Push-to-talk do contrato: UMA captura por clique (continuous: false),
  // encerra sozinha no silêncio — nunca sempre-ouvindo, sem hotword.
  // Erros que não se resolvem repetindo: o motor do navegador não serve nesta
  // máquina/navegador (Brave e Chromium sem chaves do Google devolvem
  // `network` na hora; Firefox nem tem a API). O chamador cai para a xAI.
  const ERROS_FATAIS = new Set(['network', 'service-not-allowed', 'not-allowed', 'audio-capture', 'language-not-supported']);

  function ouvir({ aoParcial, aoFinal, aoCorrecao, aoErro, aoFim, aoFalha } = {}) {
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
        const { texto: corrigido, trocas } = corrigirNomesProprios(definitivo.trim());
        if (trocas.length) aoCorrecao?.(trocas);
        aoFinal?.(corrigido);
      } else if (parcial) {
        aoParcial?.(parcial);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return; // o próprio usuário cancelou no botão
      diag('navegador-erro', { erro: e.error, modo: 'ptt' });
      aoErro?.(ERROS_RECONHECIMENTO[e.error] ?? `o reconhecimento de voz falhou (${e.error})`);
      if (ERROS_FATAIS.has(e.error)) aoFalha?.(e.error);
    };
    rec.onend = () => aoFim?.();
    rec.start();
    // Segundo clique é cancelar (abort), não concluir: com continuous: false a
    // captura já termina sozinha no silêncio — clicar de novo é desistência.
    return { parar: () => rec.abort() };
  }

  // ---------- Modo copiloto: escuta contínua + gatilho de retomada ----------
  // Pedido do dono (21/08/2026): ligado, fica ouvindo em segundo plano
  // enquanto ele joga/coda — sem clicar a cada frase. "C3PO" (o nome já
  // escolhido pra persona nova) reabre a conversa depois de um hiato; dentro
  // da janela quente, tudo que é dito vai direto pro Severino, sem gatilho.
  // Quem decide QUANDO exigir o gatilho é o chamador (chat.js guarda o
  // estado dormente/ativo); aqui só existem os dois blocos que ele precisa:
  // reconhecer o gatilho num texto, e ouvir sem parar sozinho no silêncio.

  // Variações fonéticas plausíveis do jeito que o reconhecedor pt-BR pode
  // transcrever "C3PO" dito em voz alta — não existe forma de saber a
  // priori qual sai, então a lista é um chute educado. Se o gatilho estiver
  // falhando na prática, é aqui que se soma uma variante nova.
  const GATILHO_VARIANTES = ['c3po', 'cetrepo', 'cetrepio', 'sipio', 'sepio', 'cepeo', 'ceotrepeo']
    .map((v) => v.replace(/[^a-z0-9]/g, ''));
  // Mais tolerante que nome próprio (a palavra é curta e o chute é
  // grosseiro), mas não tão solto a ponto de qualquer palavra curta do dia a
  // dia disparar sozinha (ex.: "cepo" bate perto de "cepeo" com limiar
  // baixo demais) — 0.65 é o meio-termo escolhido sem dado real de uso;
  // ajuste se o gatilho estiver disparando à toa ou não disparando nunca.
  const GATILHO_SIMILARIDADE_MINIMA = 0.65;

  // Acha o gatilho em QUALQUER janela de 1 a 4 palavras do texto (o
  // reconhecedor pode partir "C3PO" em vários pedaços) e devolve o que foi
  // dito DEPOIS dele, se algo foi — vira a primeira frase da conversa que
  // reabre, sem esperar um novo turno.
  function detectarGatilho(texto) {
    const palavras = texto.split(/(\s+)/);
    const indices = palavras.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i !== -1);
    for (let tam = 1; tam <= 4 && tam <= indices.length; tam++) {
      for (let ini = 0; ini + tam <= indices.length; ini++) {
        const fim = ini + tam;
        const janela = indices.slice(ini, fim).map((i) => palavras[i]).join('');
        const normal = normalizar(janela).replace(/[^a-z0-9]/g, '');
        if (!normal) continue;
        for (const variante of GATILHO_VARIANTES) {
          const distancia = distanciaEdicao(normal, variante);
          const similaridade = 1 - distancia / Math.max(normal.length, variante.length);
          if (similaridade >= GATILHO_SIMILARIDADE_MINIMA) {
            const resto = indices.slice(fim).map((i) => palavras[i]).join(' ').trim();
            return { encontrado: true, resto };
          }
        }
      }
    }
    return { encontrado: false, resto: '' };
  }

  // Pausa curta de fala NÃO fecha o turno (era a queixa: "ele responde na
  // pausa") — só fecha depois de TEMPO_SILENCIO_TURNO_MS sem nenhum
  // resultado final novo, dando espaço pra respirar no meio de uma ideia.
  const TEMPO_SILENCIO_TURNO_MS = 900;

  // Nunca para sozinha: diferente de `ouvir` (uma captura, um clique), esta
  // fica no ar até `parar()` ser chamado — reabrindo a sessão nativa quando
  // o navegador a encerra por conta própria (`continuous: true` não garante
  // isso em todo navegador). Ignora o que capta enquanto o Severino está
  // falando (`blocosEmFala`), senão o mic ouve a própria voz dele.
  function ouvirContinuo({ aoUtterance, aoParcial, aoErro, aoCorrecao, aoFalha } = {}) {
    let ativo = true;
    let rec = null;
    let bufferFinal = '';
    let timerSilencio = null;

    function fecharTurno() {
      const bruto = bufferFinal.trim();
      bufferFinal = '';
      if (!bruto) return;
      const { texto: corrigido, trocas } = corrigirNomesProprios(bruto);
      if (trocas.length) aoCorrecao?.(trocas);
      aoUtterance?.(corrigido);
    }

    function agendarFechamento() {
      clearTimeout(timerSilencio);
      timerSilencio = setTimeout(fecharTurno, TEMPO_SILENCIO_TURNO_MS);
    }

    function iniciar() {
      rec = new ClasseReconhecimento();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;

      rec.onresult = (e) => {
        if (blocosEmFala > 0) return; // provável eco da própria fala do Severino
        let parcial = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const resultado = e.results[i];
          if (resultado.isFinal) {
            bufferFinal += (bufferFinal ? ' ' : '') + resultado[0].transcript.trim();
            agendarFechamento();
          } else {
            parcial += resultado[0].transcript;
          }
        }
        if (parcial) aoParcial?.((bufferFinal ? bufferFinal + ' ' : '') + parcial);
      };
      rec.onerror = (e) => {
        // silêncio e cancelamento são normais em escuta contínua — não é erro
        // pra declarar; o onend abaixo já cuida de reabrir sozinho.
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        diag('navegador-erro', { erro: e.error, modo: 'copiloto' });
        aoErro?.(ERROS_RECONHECIMENTO[e.error] ?? `o reconhecimento de voz falhou (${e.error})`);
        // Fatal: parar de reabrir (era isto que repetia a mesma mensagem a
        // cada reabertura) e avisar o chamador para trocar de motor.
        if (ERROS_FATAIS.has(e.error)) { ativo = false; aoFalha?.(e.error); }
      };
      rec.onend = () => {
        if (ativo) iniciar(); // o navegador encerra a sessão de tempos em tempos: reabre na hora
      };
      rec.start();
    }

    iniciar();

    return {
      parar() {
        ativo = false;
        clearTimeout(timerSilencio);
        rec?.abort();
      },
    };
  }

  // ---------- Motor alternativo: gravação + transcrição xAI (25/10/2026) ----------
  // O reconhecimento do navegador depende do serviço do Google (Chrome/Edge);
  // no Brave, no Chromium sem chaves e no Firefox ele não existe ou devolve
  // `network`. O painel já tem transcrição por xAI para a aba Orquestração
  // (`POST /api/orquestracao/voz/transcrever`, exige a sessão do painel); aqui
  // ela vira o segundo motor do C-3PO: push-to-talk grava até o silêncio e
  // transcreve; o copiloto fatia o áudio por detecção de voz (energia) e
  // transcreve cada fala. Custo: em modo copiloto por xAI TUDO que se fala
  // perto do microfone é transcrito (pago) — inclusive em espera, porque o
  // gatilho "C3PO" só se detecta no texto. O status diz isso ao dono.
  const temGravacao = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  let xaiDisponivel = null; // null = ainda não perguntou
  fetch('/api/orquestracao/voz').then((r) => r.json()).then((i) => { xaiDisponivel = Boolean(i.xai); diag('motores', { reconhecimento: temReconhecimento, gravacao: temGravacao, tipo: TIPO_GRAVACAO, xai: xaiDisponivel, sintese: temSintese, origem: location.origin }); atualizarStatus(); })
    .catch(() => { xaiDisponivel = false; atualizarStatus(); });

  const TIPO_GRAVACAO = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? null;
  const VAD_LIMIAR_MINIMO = 0.012;    // RMS abaixo disso é silêncio em qualquer microfone
  const VAD_FATOR_RUIDO = 2.5;        // fala = bem acima do ruído de fundo medido
  const VAD_INICIO_MS = 250;          // energia alta por este tempo = começou a falar
  const VAD_SILENCIO_MS = 900;        // igual ao turno do motor do navegador
  const VAD_MINIMO_FALA_MS = 500;     // menos que isto é estalo, não frase
  const VAD_MAXIMO_FALA_MS = 30_000;  // corta e manda; a próxima fatia continua

  async function transcreverBlob(blob) {
    const r = await fetch('/api/orquestracao/voz/transcrever', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    if (r.status === 401) throw new Error('a transcrição xAI exige a sessão do painel: abra o C-3PO por painel.casa.astargne.com, logado no astargne.com');
    if (r.status === 503) throw new Error('a transcrição xAI não está configurada no painel (XAI_API_KEY)');
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro ?? `transcrição falhou (${r.status})`);
    return String(dados.texto ?? '').trim();
  }

  // Medidor de energia do microfone: RMS do domínio do tempo, com piso de ruído
  // adaptativo (média móvel do que foi medido em silêncio).
  function criarMedidor(stream) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Política de autoplay: o contexto pode nascer "suspended" (nível sempre
    // 0 → nunca detecta fala). Retoma e registra o estado.
    ctx.resume().then(() => diag('audiocontext', { estado: ctx.state })).catch((e) => diag('audiocontext-erro', { erro: String(e) }));
    const fonte = ctx.createMediaStreamSource(stream);
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    const dados = new Float32Array(analisador.fftSize);
    let ruido = 0.005;
    return {
      nivel() {
        analisador.getFloatTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i++) soma += dados[i] * dados[i];
        return Math.sqrt(soma / dados.length);
      },
      falando(rms) {
        const limiar = Math.max(VAD_LIMIAR_MINIMO, ruido * VAD_FATOR_RUIDO);
        if (rms < limiar) ruido = ruido * 0.95 + rms * 0.05; // só aprende o ruído no silêncio
        return rms >= limiar;
      },
      fechar() { ctx.close().catch(() => {}); },
    };
  }

  // Push-to-talk por xAI: grava até o silêncio depois da fala (ou até o
  // segundo clique) e transcreve uma vez. Mesmo contrato de `ouvir`.
  function ouvirXai({ aoParcial, aoFinal, aoCorrecao, aoErro, aoFim } = {}) {
    let recorder = null; let stream = null; let medidor = null; let cancelado = false;
    const partes = [];
    (async () => {
      try {
        if (!TIPO_GRAVACAO) throw new Error('nenhum formato de áudio compatível neste navegador');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        medidor = criarMedidor(stream);
        recorder = new MediaRecorder(stream, { mimeType: TIPO_GRAVACAO });
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
            else if (falou) { silencioDesde ||= agora; if (agora - silencioDesde > VAD_SILENCIO_MS) { clearInterval(laco); resolve(); } }
            if (agora - inicio > VAD_MAXIMO_FALA_MS + 15_000) { clearInterval(laco); resolve(); } // ninguém falou: desiste
          }, 100);
        });
        if (recorder.state !== 'inactive') recorder.stop();
        await fim;
        if (cancelado) return;
        if (!falou) { aoErro?.('não captei nenhum som, Mestre — clique no microfone e fale de novo'); return; }
        aoParcial?.('(transcrevendo…)');
        const texto = await transcreverBlob(new Blob(partes, { type: TIPO_GRAVACAO }));
        if (!texto) { aoErro?.('a transcrição voltou vazia — tente de novo'); return; }
        const { texto: corrigido, trocas } = corrigirNomesProprios(texto);
        if (trocas.length) aoCorrecao?.(trocas);
        aoFinal?.(corrigido);
      } catch (erro) {
        aoErro?.(erro.name === 'NotAllowedError' ? ERROS_RECONHECIMENTO['not-allowed'] : erro.message);
      } finally {
        medidor?.fechar(); stream?.getTracks().forEach((t) => t.stop()); aoFim?.();
      }
    })();
    return { parar: () => { cancelado = true; if (recorder && recorder.state !== 'inactive') recorder.stop(); } };
  }

  // Copiloto por xAI: um fluxo de microfone aberto; cada trecho de voz vira um
  // blob e uma transcrição. Ignora o que capta enquanto o C-3PO fala.
  function ouvirContinuoXai({ aoUtterance, aoErro, aoCorrecao, aoNivel } = {}) {
    let ativo = true; let stream = null; let medidor = null; let laco = null;
    (async () => {
      try {
        if (!TIPO_GRAVACAO) throw new Error('nenhum formato de áudio compatível neste navegador');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        diag('copiloto-xai-mic', { faixas: stream.getAudioTracks().map((t) => ({ rotulo: t.label.slice(0, 40), ativa: t.enabled, muda: t.muted, estado: t.readyState })) });
        medidor = criarMedidor(stream);
        let recorder = null; let partes = []; let inicioFala = 0; let altoDesde = 0; let silencioDesde = 0;
        let amostras = 0; let maximo = 0; let detectadas = 0; let ultimoResumo = Date.now();
        const fechar = async () => {
          const rec = recorder; recorder = null;
          if (!rec) return;
          const duracao = Date.now() - inicioFala;
          const fim = new Promise((resolve) => { rec.onstop = resolve; });
          rec.stop(); await fim;
          const blob = new Blob(partes, { type: TIPO_GRAVACAO }); partes = [];
          diag('copiloto-xai-trecho', { ms: duracao, bytes: blob.size, enviado: !(duracao < VAD_MINIMO_FALA_MS || blob.size < 1000 || !ativo) });
          if (duracao < VAD_MINIMO_FALA_MS || blob.size < 1000 || !ativo) return;
          try {
            const texto = await transcreverBlob(blob);
            diag('copiloto-xai-transcrito', { caracteres: texto.length });
            if (!texto || !ativo) return;
            const { texto: corrigido, trocas } = corrigirNomesProprios(texto);
            if (trocas.length) aoCorrecao?.(trocas);
            aoUtterance?.(corrigido);
          } catch (erro) { diag('copiloto-xai-erro', { erro: erro.message }); aoErro?.(erro.message); if (/sessão do painel|não está configurada/.test(erro.message)) ativo = false; }
        };
        laco = setInterval(() => {
          if (!ativo) { clearInterval(laco); if (recorder) fechar(); return; }
          const agora = Date.now();
          const rms = medidor.nivel();
          const alto = medidor.falando(rms);
          amostras++; if (rms > maximo) maximo = rms; if (alto) detectadas++;
          if (amostras % 3 === 0) aoNivel?.(rms, alto, blocosEmFala > 0);
          if (agora - ultimoResumo > 5000) { diag('copiloto-xai-nivel', { maximo: Number(maximo.toFixed(4)), amostras, altas: detectadas, gravando: Boolean(recorder), emFala: blocosEmFala }); ultimoResumo = agora; amostras = 0; maximo = 0; detectadas = 0; }
          if (blocosEmFala > 0) { altoDesde = 0; return; } // eco da própria voz dele
          if (!recorder) {
            if (alto) { altoDesde ||= agora; if (agora - altoDesde >= VAD_INICIO_MS) {
              recorder = new MediaRecorder(stream, { mimeType: TIPO_GRAVACAO });
              recorder.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
              recorder.start(250); inicioFala = altoDesde; silencioDesde = 0;
            } } else altoDesde = 0;
            return;
          }
          if (alto) silencioDesde = 0; else silencioDesde ||= agora;
          if ((silencioDesde && agora - silencioDesde > VAD_SILENCIO_MS) || agora - inicioFala > VAD_MAXIMO_FALA_MS) { altoDesde = 0; fechar(); }
        }, 100);
      } catch (erro) {
        ativo = false;
        diag('copiloto-xai-falha', { erro: erro.name ?? '', msg: String(erro.message).slice(0, 120) });
        aoErro?.(erro.name === 'NotAllowedError' ? ERROS_RECONHECIMENTO['not-allowed'] : erro.message);
      }
    })();
    return { parar() { ativo = false; clearInterval(laco); medidor?.fechar(); stream?.getTracks().forEach((t) => t.stop()); diag('copiloto-xai-parou'); } };
  }

  // ---------- Status declarado na UI ----------

  // A linha de status diz sempre a camada ATIVA e, se houve queda, o motivo:
  // "voz: ElevenLabs" / "voz: Antônio — ElevenLabs sem chave" / "só texto — …"
  // (contrato do upgrade).
  function atualizarStatus() {
    const partes = [];
    if (!temReconhecimento) {
      partes.push(temGravacao && xaiDisponivel ? 'microfone: transcrição xAI (este navegador não tem reconhecimento próprio)'
        : 'microfone indisponível neste navegador — use Edge ou Chrome');
    }

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

  return { temReconhecimento, temGravacao, xaiDisponivel: () => xaiDisponivel, temSintese, criarLocutor, calar, ouvir, ouvirContinuo, ouvirXai, ouvirContinuoXai, detectarGatilho };
})();
