// Chat do Severino — vanilla, zero dependências. EventSource não faz POST,
// então o SSE é lido na mão de um fetch com ReadableStream.

const historico = document.getElementById('historico');
const formulario = document.getElementById('formulario');
const entrada = document.getElementById('entrada');
const enviar = document.getElementById('enviar');
const microfone = document.getElementById('microfone');

// Continuidade da conversa: o motor devolve o id da sessão e a gente devolve
// ele no próximo turno. Sobrevive a F5 dentro da mesma aba.
let sessao = sessionStorage.getItem('severino-sessao') || undefined;

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
  const pensando = adicionarNota('pensando', 'Severino tá pensando');
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
    microfone.disabled = !Voz.temReconhecimento;
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
