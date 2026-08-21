// Chat do Severino — vanilla, zero dependências. EventSource não faz POST,
// então o SSE é lido na mão de um fetch com ReadableStream.
// IIFE (21/08/2026): desde que o markup passou a poder ser embutido na
// mesma página do dashboard (app.js/backlog.js/grafo.js/projeto.js, também
// scripts soltos), os globais deste arquivo precisam ficar isolados — sem
// isso, dois "mundos" de script solto na mesma página arriscam colisão de
// nome. voz.js já é IIFE (só expõe o global `Voz`); este segue o mesmo padrão.
(() => {

const historico = document.getElementById('historico');
const formulario = document.getElementById('formulario');
const entrada = document.getElementById('entrada');
const enviar = document.getElementById('enviar');
const microfone = document.getElementById('microfone');

// Continuidade da conversa: o motor devolve o id da sessão e a gente devolve
// ele no próximo turno. Sobrevive a F5 dentro da mesma aba.
let sessao = sessionStorage.getItem('severino-sessao') || undefined;

// Lido pelo `finally` de mandarMensagem (abaixo) para não reabilitar o botão
// de push-to-talk depois de cada resposta quando o modo copiloto (mais
// abaixo no arquivo) está no comando do microfone.
let modoCopilotoAtivo = false;

function adicionarFala(classe, texto = '') {
  const div = document.createElement('div');
  div.className = `fala ${classe}`;
  div.textContent = texto;
  historico.appendChild(div);
  historico.scrollTop = historico.scrollHeight;
  return div;
}

function adicionarNota(classe, texto) {
  const div = document.createElement('div');
  div.className = classe;
  div.textContent = texto;
  historico.appendChild(div);
  historico.scrollTop = historico.scrollHeight;
  return div;
}

// Interpreta o fluxo SSE: blocos separados por linha em branco, cada um com
// "event:" e "data:". Devolve os eventos completos e guarda o resto no buffer.
function extrairEventosSse(buffer) {
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

async function mandarMensagem(mensagem) {
  adicionarFala('usuario', mensagem);
  const pensando = adicionarNota('pensando', 'C-3PO está calculando');
  pensando.insertAdjacentHTML('beforeend', '<span class="pontos"></span>');

  let falaSeverino = null;
  enviar.disabled = true;
  microfone.disabled = true;

  // Fase 2: a resposta também é falada — corta fala anterior e abre um
  // locutor novo para esta resposta (acumula tokens, fala por sentença).
  Voz.calar();
  const locutor = Voz.criarLocutor({
    aoFalha: (motivo) => adicionarNota('aviso-voz', motivo),
  });

  try {
    const resposta = await fetch('/api/conversa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensagem, sessao }),
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
      const { eventos, resto } = extrairEventosSse(buffer);
      buffer = resto;

      for (const { evento, dados } of eventos) {
        if (evento === 'token') {
          if (!falaSeverino) falaSeverino = adicionarFala('severino');
          falaSeverino.textContent += dados.texto;
          historico.scrollTop = historico.scrollHeight;
          locutor.alimentar(dados.texto); // voz é adição: o texto acima segue igual
        } else if (evento === 'ferramenta') {
          adicionarNota('ferramenta', `consultando ${dados.nome}`);
        } else if (evento === 'inicio' || evento === 'fim') {
          if (dados.sessao) {
            sessao = dados.sessao;
            sessionStorage.setItem('severino-sessao', sessao);
          }
        } else if (evento === 'erro') {
          adicionarFala('erro', dados.mensagem);
        }
      }
    }
  } catch (erro) {
    adicionarFala('erro', `Deu ruim na conversa: ${erro.message}`);
  } finally {
    locutor.concluir(); // fala o rabo do buffer (última sentença sem pontuação)
    pensando.remove();
    enviar.disabled = false;
    microfone.disabled = modoCopilotoAtivo || !Voz.temReconhecimento;
    entrada.focus();
  }
}

formulario.addEventListener('submit', (e) => {
  e.preventDefault();
  const mensagem = entrada.value.trim();
  if (!mensagem || enviar.disabled) return;
  entrada.value = '';
  mandarMensagem(mensagem);
});

// ---------- Push-to-talk (fase 2) ----------
// O texto reconhecido entra no MESMO fluxo do chat: mandarMensagem → POST
// /api/conversa. Sem SpeechRecognition o botão fica desabilitado com motivo
// visível (title + linha de status que o voz.js preenche).

if (!Voz.temReconhecimento) {
  microfone.disabled = true;
  microfone.title = 'reconhecimento de voz indisponível neste navegador — use Edge ou Chrome';
} else {
  let escuta = null;
  const placeholderOriginal = entrada.placeholder;

  microfone.addEventListener('click', () => {
    if (escuta) {
      escuta.parar(); // segundo clique cancela; onend limpa o estado abaixo
      return;
    }
    Voz.calar(); // senão o mic captura a própria fala do Severino
    microfone.classList.add('ouvindo');
    entrada.placeholder = 'pode falar, tô ouvindo…';
    escuta = Voz.ouvir({
      aoParcial: (texto) => { entrada.value = texto; },
      aoFinal: (texto) => {
        entrada.value = '';
        // O mic fica desabilitado durante uma resposta, mas se uma captura
        // terminar com envio em andamento, o texto espera no campo em vez de
        // atropelar a conversa.
        if (enviar.disabled) entrada.value = texto;
        else mandarMensagem(texto);
      },
      aoCorrecao: (trocas) => adicionarNota('aviso-voz', `corrigi o que ouvi: ${trocas.join(', ')}`),
      aoErro: (motivo) => adicionarNota('aviso-voz', motivo),
      aoFim: () => {
        escuta = null;
        microfone.classList.remove('ouvindo');
        entrada.placeholder = placeholderOriginal;
      },
    });
  });
}

// ---------- Modo copiloto (pedido do dono, 21/08/2026) ----------
// "Fica ouvindo, tipo um amigo no Discord, enquanto eu jogo/codo." Escuta
// contínua (Voz.ouvirContinuo) em vez de clique por frase. Dois estados:
// - dormente: nada do que é ouvido vai pro Severino, só é vasculhado em
//   busca do gatilho "C3PO" (Voz.detectarGatilho) — é o padrão, pra não
//   mandar pra API tudo que se fala perto do micro (custo e ruído: você
//   narrando o jogo não é conversa com ele).
// - ativa: qualquer turno reconhecido vai direto pro chat, sem gatilho —
//   like uma conversa de verdade, sem ficar repetindo o nome dele.
// Um hiato sem fala (TEMPO_HIATO_MS) devolve o estado a dormente: é o que
// evita "ficou ouvindo pra sempre" sem reintroduzir hotword-sempre-ligado
// (a escuta em si é a mesma Web Speech API do navegador, sem engine extra —
// só o gatilho de RETOMADA que estava sendo cogitado como hotword antes).
const modoCopilotoCaixa = document.getElementById('modo-copiloto');
const rotuloCopiloto = document.getElementById('rotulo-copiloto');
const statusCopiloto = document.getElementById('status-copiloto');
const TEMPO_HIATO_MS = 90_000; // 1min30 sem fala: volta a exigir "C3PO"

if (!Voz.temReconhecimento) {
  rotuloCopiloto.hidden = true;
} else {
  let escutaContinua = null;
  let estadoConversa = 'dormente';
  let ultimaAtividade = 0;
  let verificadorHiato = null;

  function atualizarStatusCopiloto() {
    statusCopiloto.hidden = false;
    if (estadoConversa === 'ativa') {
      statusCopiloto.textContent = 'copiloto: ouvindo, pode falar à vontade';
      statusCopiloto.classList.add('ativa');
    } else {
      statusCopiloto.textContent = 'copiloto: em espera — diga "C3PO" pra retomar';
      statusCopiloto.classList.remove('ativa');
    }
  }

  function tratarUtterance(texto) {
    // Resposta em andamento: não atropela a conversa em curso — quem falou
    // repete depois, como faria com uma pessoa ocupada respondendo.
    if (enviar.disabled) return;

    if (estadoConversa === 'dormente') {
      const { encontrado, resto } = Voz.detectarGatilho(texto);
      if (!encontrado) return;
      estadoConversa = 'ativa';
      ultimaAtividade = Date.now();
      atualizarStatusCopiloto();
      if (resto) mandarMensagem(resto);
      return;
    }

    ultimaAtividade = Date.now();
    mandarMensagem(texto);
  }

  function ligar() {
    Voz.calar(); // se ele estava falando quando o dono ligou o copiloto, não fica se ouvindo
    modoCopilotoAtivo = true;
    microfone.disabled = true; // modos mutuamente exclusivos: um ou outro
    microfone.title = 'desligue o modo copiloto pra usar o push-to-talk';
    estadoConversa = 'dormente';
    atualizarStatusCopiloto();
    escutaContinua = Voz.ouvirContinuo({
      aoParcial: () => {}, // sem eco no campo de texto em modo copiloto: seria ruído constante
      aoUtterance: tratarUtterance,
      aoCorrecao: (trocas) => adicionarNota('aviso-voz', `corrigi o que ouvi: ${trocas.join(', ')}`),
      aoErro: (motivo) => adicionarNota('aviso-voz', motivo),
    });
    verificadorHiato = setInterval(() => {
      if (estadoConversa === 'ativa' && Date.now() - ultimaAtividade > TEMPO_HIATO_MS) {
        estadoConversa = 'dormente';
        atualizarStatusCopiloto();
      }
    }, 5000);
  }

  function desligar() {
    modoCopilotoAtivo = false;
    escutaContinua?.parar();
    escutaContinua = null;
    clearInterval(verificadorHiato);
    verificadorHiato = null;
    statusCopiloto.hidden = true;
    microfone.disabled = false;
    microfone.title = 'clique e fale (push-to-talk)';
  }

  modoCopilotoCaixa.addEventListener('change', () => {
    if (modoCopilotoCaixa.checked) ligar();
    else desligar();
  });
}

// Único ponto de saída da IIFE (21/08/2026) — o console overlay (app.js)
// injeta a primeira mensagem (digest ou contexto de decisão) sem duplicar a
// lógica de SSE/streaming que mandarMensagem já tem.
window.mandarMensagemSeverino = mandarMensagem;

})();
