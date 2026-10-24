// Interface de leitura, proposta e confirmação explícita de perfil no card.
// Informação variável entra como texto; nenhuma rota despacha tarefas.
(() => {
  const $ = id => document.getElementById(id);
  const criar = (tag, texto = '', classe = '') => {
    const no = document.createElement(tag);
    no.textContent = texto;
    if (classe) no.className = classe;
    return no;
  };
  const estado = { fila: null, triagem: null, carta: null, topico: 'demanda', opcoes: [], modeloDados: null,
    confirmacao: null, confirmacaoHandoff: null, confirmacaoGate: null,
    confirmacaoDespacho: null, gravacao: null, transcricao: null, ultimoResultado: null, abortos: {} };

  // Trocar de carta ou de tópico em sequência não pode deixar respostas antigas chegarem
  // depois das novas: cada leitura pesada aborta a anterior do mesmo nome.
  function sinal(nome) {
    estado.abortos[nome]?.abort();
    estado.abortos[nome] = new AbortController();
    return estado.abortos[nome].signal;
  }
  const abortado = erro => erro?.name === 'AbortError';

  async function json(url, opcoes) {
    const resposta = await fetch(url, opcoes);
    const dados = await resposta.json();
    if (!resposta.ok) { const erro = new Error(dados.erro ?? `HTTP ${resposta.status}`); erro.status = resposta.status; throw erro; }
    return dados;
  }

  function mensagem(id, texto) { $(id).replaceChildren(criar('p', texto, 'orq-ajuda')); }

  function mostrarTopico(nome) {
    estado.topico = nome;
    for (const botao of document.querySelectorAll('[data-orq-topico]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.orqTopico === nome));
    }
    for (const secao of document.querySelectorAll('.orq-topico')) secao.hidden = secao.id !== `orq-topico-${nome}`;
    if (nome === 'conversa') carregarConversa();
    if (nome === 'modelos') carregarModelos();
    if (nome === 'consumo') carregarConsumo();
    if (nome === 'legado') carregarLegado();
  }

  function renderProjetos() {
    const select = $('orq-projeto');
    const anterior = select.value;
    select.replaceChildren(new Option('Todos', ''));
    for (const p of estado.fila.projetos) {
      const opcao = new Option(`${p.nome} · ${p.candidatas}/${p.cartas}${p.acessivel ? '' : ' · sem acesso'}`, p.id);
      select.add(opcao);
    }
    select.value = anterior;
  }

  function cartasVisiveis() {
    const projeto = $('orq-projeto').value;
    const filtro = $('orq-filtro').value;
    const categoria = $('orq-categoria').value;
    const busca = $('orq-busca').value.trim().toLocaleLowerCase('pt-BR');
    return estado.fila.itens.filter(c => {
      if (projeto && c.projetoId !== projeto) return false;
      const temGate = c.labels.includes('READY TO DEV') || c.labels.includes('READY TO TEST');
      if (filtro === 'candidatas' && !temGate) return false;
      if (filtro === 'sem-gate' && temGate) return false;
      if (categoria && !estado.triagem?.porId.get(c.id)?.categorias.includes(categoria)) return false;
      return !busca || [c.identificador, c.titulo, c.projeto, ...c.motivos].join(' ').toLocaleLowerCase('pt-BR').includes(busca);
    });
  }

  function renderCartas() {
    const lista = $('orq-cartas');
    lista.replaceChildren();
    const visiveis = cartasVisiveis();
    if (!visiveis.length) return mensagem('orq-cartas', 'Nenhuma carta nesse filtro.');
    for (const c of visiveis.slice(0, 100)) {
      const botao = criar('button', '', 'orq-carta');
      botao.type = 'button';
      const principal = estado.triagem?.porId.get(c.id)?.principal;
      const nomePrincipal = estado.triagem?.categorias.find(x => x.codigo === principal)?.nome;
      botao.append(criar('strong', c.identificador), criar('span', c.titulo),
        criar('small', nomePrincipal ?? (c.elegivel ? 'Elegível' : c.motivos[0] ?? 'Impedida')));
      botao.setAttribute('aria-pressed', String(estado.carta?.id === c.id));
      botao.addEventListener('click', () => selecionarCarta(c));
      lista.append(botao);
    }
    if (visiveis.length > 100) lista.append(criar('p', `Mostrando 100 de ${visiveis.length}; refine a busca.`, 'orq-ajuda'));
  }

  function renderDemanda() {
    const c = estado.carta;
    const alvo = $('orq-elegibilidade');
    alvo.replaceChildren();
    const estadoAtual = criar('p', `${c.estado} · ${c.gate ?? 'sem gate'} · ${c.elegivel ? 'elegível' : 'impedida'}`);
    const motivos = criar('ul');
    for (const motivo of c.motivos) motivos.append(criar('li', motivo));
    if (!c.motivos.length) motivos.append(criar('li', 'Todos os portões de leitura passaram. Execução ainda indisponível.'));
    alvo.append(estadoAtual);
    if (estado.ultimoResultado?.cartaId === c.id) alvo.append(criar('p', estado.ultimoResultado.texto, 'orq-resultado'));
    alvo.append(motivos);
    const triagem = estado.triagem?.porId.get(c.id);
    if (triagem) {
      const categorias = criar('div', '', 'orq-categoria-dev');
      categorias.append(criar('h3', 'Pendências para READY TO DEV'));
      const lista = criar('ul');
      for (const codigo of triagem.categorias) {
        lista.append(criar('li', estado.triagem.categorias.find(x => x.codigo === codigo)?.nome ?? codigo));
      }
      categorias.append(lista, criar('p', 'Triagem estrutural só-leitura; escopo e aceite precisam de evidência no card.', 'orq-ajuda'));
      alvo.append(categorias);
    }
    const discutir = criar('button', 'Discutir pendências com C-3PO', 'orq-acao');
    discutir.type = 'button';
    discutir.addEventListener('click', () => window.abrirConsoleOrquestracao?.(c.identificador));
    alvo.append(discutir);
    const deps = criar('div', '', 'orq-dependencias');
    deps.append(criar('h3', 'Dependências'));
    // Carta sem gate só tem relações lidas pela triagem; sem isto o bloco dizia
    // 'nenhuma relação' logo abaixo de 'dependência formal pendente'.
    const vistas = new Set();
    const dependencias = [...c.dependencias, ...(triagem?.dependencias ?? [])]
      .filter(d => { const k = `${d.id}|${d.estado}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
    for (const d of dependencias) deps.append(criar('p', `${d.id}: ${d.estado} — ${d.motivo}`));
    if (!dependencias.length) deps.append(criar('p', 'Nenhuma relação exibida.'));
    alvo.append(deps);
    for (const gate of ['READY TO DEV', 'READY TO TEST']) {
      const botao = criar('button', `Pré-checar ${gate}`, 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', async () => {
        const saida = $('orq-prontidao');
        saida.textContent = 'Consultando…';
        try {
          const dados = await json(`/api/orquestracao/prontidao?carta=${encodeURIComponent(c.id)}&gate=${encodeURIComponent(gate)}`, { signal: sinal('prontidao') });
          if (estado.carta?.id !== c.id) return;
          estado.confirmacaoGate = null;
          saida.replaceChildren(criar('strong', gate), criar('h3', 'Pendências para marcar o gate'));
          const pendencias = criar('ul');
          for (const texto of dados.pendenciasDoGate) pendencias.append(criar('li', texto));
          if (!pendencias.childNodes.length) {
            pendencias.append(criar('li', dados.gatesAtuais?.length && !dados.gatePodeSerMarcado
              ? `Gate ${dados.gatesAtuais.join(' e ')} já presente; veja os ajustes abaixo.`
              : 'Nenhuma pendência estrutural detectada. Evidência ainda deve ser registrada.'));
          }
          saida.append(pendencias);
          if (dados.ajustesDoGate?.length) {
            const ajustes = criar('ul');
            for (const texto of dados.ajustesDoGate) ajustes.append(criar('li', texto));
            saida.append(criar('h3', 'Ajustes de gate e evidência'), ajustes);
          }
          saida.append(criar('h3', 'Impedimentos para despacho após o gate'));
          const despacho = criar('ul');
          for (const texto of dados.pendenciasTecnicas) despacho.append(criar('li', texto));
          if (!despacho.childNodes.length) despacho.append(criar('li', 'Nenhum impedimento adicional na prévia; despacho continua desligado.'));
          saida.append(despacho);
          if (dados.gatePodeSerMarcado && dados.podeRegistrarGate) {
            const justificativa = criar('textarea');
            justificativa.maxLength = 2000;
            justificativa.minLength = 10;
            justificativa.rows = 3;
            justificativa.setAttribute('aria-label', 'Justificativa do gate (mínimo 10 caracteres)');
            const evidencias = criar('textarea');
            evidencias.rows = 3;
            evidencias.setAttribute('aria-label', 'Evidências do gate, uma por linha (1 a 10, mínimo 5 caracteres cada)');
            // Editar depois de preparar invalida a confirmação: o que seria gravado já não é o que está na tela.
            for (const campo of [justificativa, evidencias]) campo.addEventListener('input', () => {
              estado.confirmacaoGate = null;
              saida.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(n => n.remove());
            });
            const preparar = criar('button', `Preparar marcação ${gate}`, 'orq-acao');
            preparar.type = 'button';
            preparar.addEventListener('click', () => prepararGate(c.id, dados.versaoCarta, gate,
              justificativa.value, evidencias.value, saida));
            saida.append(criar('p', 'Justificativa (mínimo 10 caracteres)'), justificativa,
              criar('p', 'Evidências (uma por linha; 1 a 10, mínimo 5 caracteres cada)'), evidencias, preparar);
          } else if (dados.gatePodeSerMarcado) {
            saida.append(criar('p', 'Gate estruturalmente pronto, mas a identidade restrita de escrita não está configurada para este projeto.'));
          }
        } catch (erro) { if (!abortado(erro)) saida.textContent = erro.message; }
      });
      alvo.append(botao);
    }
    const pronta = criar('div', '', 'orq-prontidao');
    pronta.id = 'orq-prontidao';
    alvo.append(pronta);
    const despacho = criar('div', '', 'orq-despacho');
    despacho.append(criar('h3', 'Portão de execução'));
    if (!estado.fila?.execucaoHabilitada) {
      despacho.append(criar('p', 'Desligado: falta o executor aprovado, identidade restrita e piloto offline. Nenhum comando será iniciado.'));
    } else if (!c.elegivel) {
      despacho.append(criar('p', 'Carta impedida; resolva os portões acima antes de preparar.'));
    } else {
      const comando = criar('select');
      comando.setAttribute('aria-label', 'Comando do contrato');
      for (const id of c.comandos) comando.add(new Option(id, id));
      const botao = criar('button', 'Preparar despacho', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => prepararDespacho(c, comando.value, despacho));
      despacho.append(comando, botao, criar('p', 'Confirmar exibirá o plano exato e exigirá uma segunda ação explícita.'));
    }
    alvo.append(despacho);
  }

  async function prepararDespacho(carta, comando, alvo) {
    estado.confirmacaoDespacho = null;
    alvo.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(n => n.remove());
    const status = criar('p', 'Revalidando carta, contrato, perfil e executor…', 'orq-preparo');
    alvo.append(status);
    try {
      const dados = await json('/api/orquestracao/despacho/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta: carta.id,
          comando, versaoCarta: carta.atualizadoEm }) });
      if (estado.carta?.id !== carta.id) return;
      estado.confirmacaoDespacho = dados.confirmacaoId;
      const caixa = criar('div', '', 'orq-confirmacao');
      const plano = criar('ul');
      for (const [papel, escolha] of Object.entries(dados.plano.papeis)) {
        plano.append(criar('li', `${papel}: ${escolha.provedor}/${escolha.modelo}/${escolha.esforco} · ${escolha.agenteId}`));
      }
      const botao = criar('button', 'Confirmar tentativa real', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => confirmarDespacho(carta.id, dados.confirmacaoId, status, botao));
      caixa.append(criar('strong', `${dados.carta} · comando ${dados.comando}`), plano,
        criar('p', `Perfil do card ${dados.perfilComentarioId}. ${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.append(caixa);
      status.textContent = 'Confira os três papéis, comando e carta antes de confirmar.';
    } catch (erro) { status.textContent = erro.message; }
  }

  async function confirmarDespacho(carta, confirmacaoId, status, botao) {
    if (estado.confirmacaoDespacho !== confirmacaoId || estado.carta?.id !== carta) {
      status.textContent = 'Confirmação substituída ou expirada; prepare de novo.';
      return;
    }
    estado.confirmacaoDespacho = null;
    botao.disabled = true;
    status.textContent = 'Tentativa em curso; não repita a confirmação…';
    try {
      const dados = await json('/api/orquestracao/despacho/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId }) });
      const texto = `${estado.carta?.identificador ?? dados.carta ?? ''}: tentativa ${dados.tentativaId} · ${dados.resultado ?? dados.observacao ?? 'resultado pendente'}${dados.duplicada ? ' (repetida, não reexecutada)' : ''}.`;
      // O re-render da carta apaga este bloco; o resultado fica no estado e volta no topo da Demanda.
      estado.ultimoResultado = { cartaId: carta, texto };
      status.textContent = texto;
      await carregar();
    } catch (erro) { status.textContent = erro.message; }
  }

  async function prepararGate(carta, versaoCarta, gate, justificativa, evidencias, alvo) {
    estado.confirmacaoGate = null;
    alvo.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(n => n.remove());
    const status = criar('p', 'Verificando sessão, versão e evidências…', 'orq-preparo');
    alvo.append(status);
    const limite = limitesDeTexto(justificativa, evidencias.split('\n').map(x => x.trim()).filter(Boolean), 'justificativa');
    if (limite) { status.textContent = limite; return; }
    try {
      const dados = await json('/api/orquestracao/gates/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta, versaoCarta,
          proposta: { gate, justificativa, evidencias: evidencias.split('\n').map(x => x.trim()).filter(Boolean) } }) });
      if (estado.carta?.id !== carta) return;
      estado.confirmacaoGate = dados.confirmacaoId;
      const caixa = criar('div', '', 'orq-confirmacao');
      const lista = criar('ul');
      for (const evidencia of dados.proposta.evidencias) lista.append(criar('li', evidencia));
      const botao = criar('button', 'Confirmar etiqueta no Plane', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => confirmarGate(carta, dados.confirmacaoId, status, botao));
      caixa.append(criar('strong', `${dados.carta} · ${dados.proposta.gate}`),
        criar('p', dados.proposta.justificativa), lista,
        criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.append(caixa);
      status.textContent = 'Confira e confirme em uma segunda ação.';
    } catch (erro) { status.textContent = erro.message; }
  }

  async function confirmarGate(carta, confirmacaoId, status, botao) {
    if (estado.confirmacaoGate !== confirmacaoId || estado.carta?.id !== carta) {
      status.textContent = 'Confirmação substituída ou expirada; prepare de novo.';
      return;
    }
    estado.confirmacaoGate = null;
    botao.disabled = true;
    status.textContent = 'Aplicando gate com evidência no card…';
    try {
      const dados = await json('/api/orquestracao/gates/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId }) });
      const texto = `${dados.gate} registrado. Comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      estado.ultimoResultado = { cartaId: carta, texto };
      status.textContent = texto;
      await carregar();
    } catch (erro) { status.textContent = erro.message; }
  }

  // Os limites são os de validarHandoff/validarPropostaGate no servidor; conferir aqui
  // evita que uma recusa por tamanho pareça falha de sessão ou de identidade.
  function limitesDeTexto(resumo, evidencias, nome) {
    if (resumo.trim().length < 10 || resumo.length > 2000) return `${nome[0].toUpperCase()}${nome.slice(1)} precisa de 10 a 2000 caracteres.`;
    if (!evidencias.length || evidencias.length > 10) return 'Informe de 1 a 10 evidências, uma por linha.';
    if (evidencias.some(x => x.length < 5 || x.length > 500)) return 'Cada evidência precisa de 5 a 500 caracteres.';
    return null;
  }

  function renderHistorico() {
    const alvo = $('orq-historico');
    const disponiveis = (estado.carta.agentesDisponiveis ?? []).map(a => a.id).join(', ') || 'nenhum';
    alvo.replaceChildren(criar('p', `Lease: ${estado.carta.leaseSituacao ?? 'desconhecido'} · Agentes disponíveis: ${disponiveis} · Responsável pela tentativa: ${estado.carta.lease?.agente ?? 'não atribuído'}`));
    for (const e of estado.carta.historico ?? []) alvo.append(criar('p', `${e.quando ?? '?'} · ${e.tipo} · ${e.resultado ?? e.tentativaId ?? ''}`));
    if (!estado.carta.historico?.length) alvo.append(criar('p', 'Nenhuma tentativa registrada.'));
  }

  function selecionarCarta(carta) {
    if (estado.carta?.id !== carta.id) descartarGravacao();
    estado.carta = carta;
    limparConfirmacao();
    limparConfirmacaoHandoff();
    estado.confirmacaoGate = null;
    estado.confirmacaoDespacho = null;
    const cab = $('orq-card-cabecalho');
    cab.replaceChildren();
    const link = criar('a', carta.identificador);
    link.href = carta.url;
    link.target = '_blank';
    link.rel = 'noopener';
    cab.append(link, criar('h2', carta.titulo), criar('p', carta.projeto));
    renderCartas();
    renderDemanda();
    renderHistorico();
    mensagem('orq-conversa', 'Abra o tópico para ler as interações deste card.');
    mensagem('orq-modelos', 'Abra o tópico para escolher os modelos.');
    $('orq-voz-texto').textContent = '';
    $('orq-voz-usar').hidden = true;
    estado.transcricao = null;
    $('orq-validar-modelos').disabled = true;
    $('orq-preparar-modelos').disabled = true;
    if (estado.topico === 'conversa') carregarConversa();
    if (estado.topico === 'modelos') carregarModelos();
  }

  function descartarGravacao() {
    const gravacao = estado.gravacao;
    if (!gravacao) return;
    gravacao.descartar = true;
    clearTimeout(gravacao.limite);
    if (gravacao.recorder.state !== 'inactive') gravacao.recorder.stop();
    gravacao.stream.getTracks().forEach(t => t.stop());
    estado.gravacao = null;
    $('orq-voz-gravar').textContent = 'Iniciar gravação';
    $('orq-voz-status').textContent = 'Gravação descartada ao trocar de carta.';
  }

  async function alternarGravacao() {
    if (estado.gravacao) {
      const atual = estado.gravacao;
      clearTimeout(atual.limite);
      if (atual.recorder.state !== 'inactive') atual.recorder.stop();
      $('orq-voz-gravar').disabled = true;
      $('orq-voz-status').textContent = 'Transcrevendo áudio…';
      return;
    }
    if (!estado.carta) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      $('orq-voz-status').textContent = 'Gravação indisponível neste navegador ou origem.';
      return;
    }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(x => MediaRecorder.isTypeSupported(x));
    if (!tipo) { $('orq-voz-status').textContent = 'Nenhum formato de áudio compatível.'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: tipo });
      const gravacao = { recorder, stream, cartaId: estado.carta.id, partes: [], descartar: false, limite: null };
      estado.gravacao = gravacao;
      recorder.ondataavailable = e => { if (e.data.size) gravacao.partes.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearTimeout(gravacao.limite);
        if (gravacao.descartar || estado.carta?.id !== gravacao.cartaId) return;
        estado.gravacao = null;
        $('orq-voz-gravar').disabled = false;
        $('orq-voz-gravar').textContent = 'Iniciar gravação';
        const audio = new Blob(gravacao.partes, { type: tipo });
        if (audio.size > 8 * 1024 * 1024) { $('orq-voz-status').textContent = 'Áudio excede 8 MiB; descartado.'; return; }
        try {
          const dados = await json('/api/orquestracao/voz/transcrever', { method: 'POST',
            headers: { 'content-type': tipo }, body: audio });
          if (estado.carta?.id !== gravacao.cartaId) return;
          estado.transcricao = dados.texto;
          $('orq-voz-texto').textContent = dados.texto;
          $('orq-voz-usar').hidden = false;
          $('orq-voz-status').textContent = `${dados.fonte} · somente proposta textual. Nenhuma ação executada.`;
        } catch (erro) { $('orq-voz-status').textContent = erro.message; }
      };
      recorder.start();
      gravacao.limite = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 45_000);
      $('orq-voz-gravar').textContent = 'Parar e transcrever';
      $('orq-voz-status').textContent = 'Gravando até 45 segundos; pressione novamente para parar.';
    } catch { $('orq-voz-status').textContent = 'Microfone recusado ou indisponível.'; }
  }

  async function carregarConversa() {
    if (!estado.carta) return;
    const id = estado.carta.id;
    mensagem('orq-conversa', 'Lendo comentários do Plane…');
    try {
      const canal = await json(`/api/orquestracao/canal?carta=${encodeURIComponent(id)}&projeto=${encodeURIComponent(estado.carta.projetoId)}`, { signal: sinal('conversa') });
      if (estado.carta?.id !== id) return;
      const alvo = $('orq-conversa');
      alvo.replaceChildren();
      const estruturados = new Map((canal.handoffs ?? []).map(h => [h.comentarioId, h]));
      for (const e of canal.interacoes) {
        const item = criar('article', '', 'orq-interacao');
        const handoff = estruturados.get(e.id);
        item.append(criar('strong', `${e.papel} · ${e.autor}`), criar('time', e.quando ? new Date(e.quando).toLocaleString('pt-BR') : ''));
        if (handoff) {
          item.append(criar('p', `${handoff.resultado} · tentativa ${handoff.tentativaId ?? 'não iniciada'} · ${handoff.resumo}`));
          const evidencias = criar('ul');
          for (const evidencia of handoff.evidencia) evidencias.append(criar('li', evidencia));
          item.append(evidencias);
        } else item.append(criar('p', e.texto));
        alvo.append(item);
      }
      if (!canal.interacoes.length) mensagem('orq-conversa', 'O card ainda não tem comentários.');
    } catch (erro) { if (abortado(erro)) return; if (estado.carta?.id === id) mensagem('orq-conversa', `Canal indisponível: ${erro.message}`); }
  }

  function limparConfirmacaoHandoff() {
    estado.confirmacaoHandoff = null;
    $('orq-handoff-confirmacao').replaceChildren();
    $('orq-handoff-confirmacao').hidden = true;
  }

  function entradaHandoff() {
    return { papel: $('orq-handoff-papel').value,
      tentativaId: $('orq-handoff-tentativa').value.trim() || null,
      resultado: $('orq-handoff-resultado').value,
      resumo: $('orq-handoff-resumo').value.trim(),
      evidencia: $('orq-handoff-evidencias').value.split('\n').map(x => x.trim()).filter(Boolean) };
  }

  async function prepararHandoff() {
    if (!estado.carta) return;
    limparConfirmacaoHandoff();
    const carta = estado.carta.id;
    $('orq-handoff-status').textContent = 'Verificando sessão, carta e evidências…';
    const entrada = entradaHandoff();
    const limite = limitesDeTexto(entrada.resumo, entrada.evidencia, 'resumo');
    if (limite) { $('orq-handoff-status').textContent = limite; return; }
    try {
      const dados = await json('/api/orquestracao/handoff/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carta, versaoCarta: estado.carta.atualizadoEm, entrada }) });
      if (estado.carta?.id !== carta) return;
      estado.confirmacaoHandoff = dados.confirmacaoId;
      const alvo = $('orq-handoff-confirmacao');
      const evidencias = criar('ul');
      for (const linha of dados.entrada.evidencia) evidencias.append(criar('li', linha));
      const botao = criar('button', 'Confirmar handoff no card', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', confirmarHandoff);
      alvo.replaceChildren(criar('strong', `${dados.carta} · ${dados.entrada.papel} · ${dados.entrada.resultado}`),
        criar('p', dados.entrada.resumo), evidencias,
        criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.hidden = false;
      $('orq-handoff-status').textContent = 'Confira o conteúdo e confirme em uma segunda ação.';
    } catch (erro) { $('orq-handoff-status').textContent = erro.message; }
  }

  async function confirmarHandoff() {
    const id = estado.confirmacaoHandoff;
    if (!id) return;
    estado.confirmacaoHandoff = null;
    $('orq-handoff-confirmacao').querySelector('button').disabled = true;
    $('orq-handoff-status').textContent = 'Registrando no card…';
    try {
      const dados = await json('/api/orquestracao/handoff/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId: id }) });
      limparConfirmacaoHandoff();
      $('orq-handoff-status').textContent = `${dados.carta}: handoff no comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      await carregarConversa();
    } catch (erro) { limparConfirmacaoHandoff(); $('orq-handoff-status').textContent = erro.message; }
  }

  async function carregarModelos() {
    if (!estado.carta) return;
    const id = estado.carta.id;
    limparConfirmacao();
    mensagem('orq-modelos', 'Lendo opções do contrato…');
    $('orq-validar-modelos').disabled = true;
    $('orq-preparar-modelos').disabled = true;
    try {
      const dados = await json(`/api/orquestracao/modelos?carta=${encodeURIComponent(id)}`, { signal: sinal('modelos') });
      if (estado.carta?.id !== id) return;
      const alvo = $('orq-modelos');
      alvo.replaceChildren();
      estado.opcoes = dados.opcoes;
      estado.modeloDados = dados;
      if (dados.impedimentos.length || !dados.opcoes.length) return mensagem('orq-modelos', dados.impedimentos.join('; ') || 'Sem modelos declarados no contrato.');
      const provedores = [...new Set(dados.opcoes.map(opcao => opcao.provedor))];
      const campo = (nome, seletor) => {
        const label = criar('label', '', 'orq-campo');
        label.append(criar('span', nome, 'orq-campo-titulo'), seletor);
        return label;
      };
      const selecaoAlterada = () => {
        limparConfirmacao();
        $('orq-modelos-status').textContent = 'Seleção alterada. Valide ou prepare novamente; nenhum perfil foi gravado.';
      };
      for (const papel of dados.papeis) {
        const linha = criar('div', '', 'orq-papel');
        linha.dataset.papel = papel;
        const rotulo = criar('span', papel.replaceAll('_', ' '), 'orq-papel-nome');
        const provedor = criar('select');
        provedor.className = 'orq-seletor-provedor';
        provedor.setAttribute('aria-label', `Provedor para ${papel.replaceAll('_', ' ')}`);
        for (const nome of provedores) provedor.add(new Option(nome === 'openai' ? 'OpenAI' : nome === 'claude' ? 'Claude' : nome, nome));
        const modelo = criar('select');
        modelo.className = 'orq-seletor-modelo';
        modelo.setAttribute('aria-label', `Modelo para ${papel.replaceAll('_', ' ')}`);
        const esforco = criar('select');
        esforco.className = 'orq-seletor-esforco';
        esforco.setAttribute('aria-label', `Esforço para ${papel.replaceAll('_', ' ')}`);
        const preencherEsforcos = () => {
          const opcao = dados.opcoes.find(op => op.provedor === provedor.value && op.modelo === modelo.value);
          if (!opcao) return esforco.replaceChildren();
          esforco.replaceChildren(...opcao.esforcos.map(e => new Option(e === 'xhigh' ? 'extreme high' : e, e)));
          esforco.value = opcao.esforcoPadrao;
        };
        const preencherModelos = () => {
          modelo.replaceChildren(...dados.opcoes.filter(op => op.provedor === provedor.value)
            .map(op => new Option(`${op.modelo}${op.disponivel ? '' : ' · sem executor'}`, op.modelo)));
          preencherEsforcos();
        };
        provedor.addEventListener('change', () => { preencherModelos(); selecaoAlterada(); });
        modelo.addEventListener('change', () => { preencherEsforcos(); selecaoAlterada(); });
        esforco.addEventListener('change', selecaoAlterada);
        preencherModelos();
        // Perfil já gravado no card é vinculante: os seletores nascem com ele, não com os padrões.
        const registrado = dados.perfil?.selecoes?.[papel];
        if (registrado && dados.opcoes.some(op => op.provedor === registrado.provedor && op.modelo === registrado.modelo)) {
          provedor.value = registrado.provedor;
          preencherModelos();
          modelo.value = registrado.modelo;
          preencherEsforcos();
          if ([...esforco.options].some(o => o.value === registrado.esforco)) esforco.value = registrado.esforco;
        }
        linha.append(rotulo, campo('Provedor', provedor), campo('Modelo', modelo), campo('Esforço', esforco));
        alvo.append(linha);
      }
      $('orq-validar-modelos').disabled = false;
      $('orq-preparar-modelos').disabled = !dados.podeRegistrar;
      const quando = dados.perfil?.quando ? new Date(dados.perfil.quando).toLocaleString('pt-BR') : '';
      $('orq-modelos-status').textContent = dados.perfil
        ? `Perfil vinculante registrado no comentário ${dados.perfil.comentarioId}${quando ? ` em ${quando}` : ''}; os seletores mostram essa escolha. Alterar e preparar grava um novo perfil.`
        : dados.podeRegistrar
          ? 'Padrões: Claude max e OpenAI extreme high. Nenhum perfil gravado neste card. Para gravar, prepare e confirme em duas ações separadas.'
          : 'Identidade restrita de escrita não configurada para este projeto; só validação e simulação disponíveis.';
    } catch (erro) { if (!abortado(erro) && estado.carta?.id === id) mensagem('orq-modelos', erro.message); }
  }

  function lerSelecoes() {
    const selecoes = {};
    for (const linha of document.querySelectorAll('.orq-papel')) {
      selecoes[linha.dataset.papel] = {
        provedor: linha.querySelector('.orq-seletor-provedor').value,
        modelo: linha.querySelector('.orq-seletor-modelo').value,
        esforco: linha.querySelector('.orq-seletor-esforco').value,
      };
    }
    return selecoes;
  }

  function limparConfirmacao() {
    estado.confirmacao = null;
    $('orq-confirmacao-modelos').replaceChildren();
    $('orq-confirmacao-modelos').hidden = true;
  }

  async function validarProposta() {
    if (!estado.carta) return;
    const selecoes = lerSelecoes();
    $('orq-modelos-status').textContent = 'Validando proposta…';
    try {
      const dados = await json('/api/orquestracao/modelos/validar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta: estado.carta.id, selecoes }) });
      $('orq-modelos-status').textContent = `${dados.carta}: combinação permitida pelo contrato, mas ainda não gravada no card. ${dados.impedimentosExecucao.length ? `Despacho impedido: ${dados.impedimentosExecucao.join('; ')}.` : 'O perfil exato seria exigido, sem fallback.'}`;
    } catch (erro) { $('orq-modelos-status').textContent = erro.message; }
  }

  async function prepararPerfil() {
    if (!estado.carta || !estado.modeloDados?.podeRegistrar) return;
    limparConfirmacao();
    const carta = estado.carta.id;
    $('orq-modelos-status').textContent = 'Verificando sessão e preparando confirmação…';
    try {
      const dados = await json('/api/orquestracao/modelos/preparar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carta, versaoCarta: estado.modeloDados.versaoCarta, selecoes: lerSelecoes() }) });
      if (estado.carta?.id !== carta) return;
      estado.confirmacao = dados.confirmacaoId;
      const alvo = $('orq-confirmacao-modelos');
      const lista = criar('ul');
      for (const [papel, escolha] of Object.entries(dados.selecoes)) {
        lista.append(criar('li', `${papel}: ${escolha.provedor}/${escolha.modelo}/${escolha.esforco}`));
      }
      const botao = criar('button', 'Confirmar registro no card', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', confirmarPerfil);
      alvo.replaceChildren(criar('strong', `${dados.carta} · versão ${dados.versaoCarta}`), lista,
        criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.hidden = false;
      $('orq-modelos-status').textContent = 'Confira as três escolhas e confirme somente se estiverem corretas.';
    } catch (erro) {
      $('orq-modelos-status').textContent = erro.status === 401
        ? `${erro.message} Abra https://astargne.com/login e volte a esta carta.` : erro.message;
    }
  }

  async function confirmarPerfil() {
    const id = estado.confirmacao;
    if (!id) return;
    estado.confirmacao = null;
    $('orq-confirmacao-modelos').querySelector('button').disabled = true;
    $('orq-modelos-status').textContent = 'Confirmando no card do Plane…';
    try {
      const dados = await json('/api/orquestracao/modelos/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmacaoId: id }) });
      limparConfirmacao();
      $('orq-modelos-status').textContent = `${dados.carta}: perfil registrado no comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      if (estado.topico === 'conversa') carregarConversa();
    } catch (erro) {
      limparConfirmacao();
      $('orq-modelos-status').textContent = erro.message;
    }
  }

  // Canal legado (doc 59): lido só quando o tópico abre ou no botão — nunca no polling de 60 s.
  async function carregarLegado() {
    const status = $('orq-legado-status');
    const alvo = $('orq-legado');
    status.textContent = 'Lendo os canais do SupervisorHandoff (python só-leitura)…';
    try {
      const dados = await json('/api/orquestracao/legado', { signal: sinal('legado') });
      alvo.replaceChildren();
      for (const canal of dados.canais) {
        const caixa = criar('article', '', 'orq-legado-canal');
        caixa.append(criar('h3', `${canal.config}${canal.documento ? ` · ${canal.documento}` : ''}`));
        if (!canal.disponivel) { caixa.append(criar('p', `Indisponível: ${canal.motivo}`, 'orq-ajuda')); alvo.append(caixa); continue; }
        caixa.append(criar('p', `commit ${canal.commit ?? '?'} · HEAD ${canal.head ?? '?'} · origin ${canal.origin ?? '?'} · protocolo ${canal.protocolo ?? '?'} · último bloco ${canal.ultimoBloco ?? '?'}`));
        caixa.append(criar('p', `trava ${canal.trava.ativa ? `ativa há ${canal.trava.idadeSegundos ?? '?'} s` : 'livre'} · pausas ${Object.keys(canal.pausas).length || 'nenhuma'} · integridade ${canal.integridade.length ? canal.integridade.join('; ') : 'ok'}${canal.erro ? ` · leitura parcial: ${canal.erro}` : ''}`));
        const pend = criar('ul', '', 'orq-legado-pendencias');
        for (const p of canal.pendencias) pend.append(criar('li', `${p.card} · ${p.ator} · ${p.acao} · ${p.motivo} · tentativas ${p.tentativas}${p.bloqueado ? ' · BLOQUEADO' : ''}`));
        if (!canal.pendencias.length) pend.append(criar('li', 'Ninguém tem a vez.'));
        caixa.append(criar('h4', 'Quem tem a vez'), pend);
        if (canal.sugestoes.length) caixa.append(criar('p', `Sugestões: ${canal.sugestoes.map(s => typeof s === 'string' ? s : JSON.stringify(s)).join(' · ')}`, 'orq-ajuda'));
        const cards = criar('ul', '', 'orq-legado-cards');
        for (const c of canal.cards) cards.append(criar('li', `${c.id} · ${c.estado ?? '?'} · próximo ${c.proximoAtor ?? '—'}${c.titulo ? ` · ${c.titulo}` : ''}`));
        caixa.append(criar('h4', `Cards do controle (${canal.cards.length})`), cards);
        const tps = criar('ul', '', 'orq-legado-touchpoints');
        for (const t of canal.touchpoints) tps.append(criar('li', `${t.quando ?? '?'} · ${t.card ?? '?'} · ${t.ator ?? '?'} · ${t.acao ?? '?'} · ${t.resultado ?? '?'} · ${String(t.resumo ?? '').slice(0, 160)}`));
        if (!canal.touchpoints.length) tps.append(criar('li', 'Sem touchpoints.'));
        caixa.append(criar('h4', 'Últimos touchpoints'), tps);
        if (canal.execucao.arquivo) caixa.append(criar('p', `Saída mais recente: ${canal.execucao.arquivo} (há ${canal.execucao.modificadoHa ?? '?'} s)`, 'orq-ajuda'));
        alvo.append(caixa);
      }
      status.textContent = `${dados.fonte} · lido às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}. ${dados.observacao}`;
    } catch (erro) { if (!abortado(erro)) status.textContent = `Canal legado indisponível: ${erro.message}`; }
  }

  async function carregarConsumo() {
    mensagem('orq-consumo', 'Lendo fontes de consumo…');
    try {
      const dados = await json('/api/orquestracao/consumo');
      const alvo = $('orq-consumo');
      alvo.replaceChildren();
      for (const provedor of ['claude', 'openai']) {
        const item = dados[provedor];
        const caixa = criar('div', '', 'orq-medidor');
        caixa.append(criar('strong', provedor));
        if (item.disponivel) {
          for (const janela of item.janelas) {
            const barra = criar('progress');
            barra.max = 100;
            barra.value = janela.percentual;
            caixa.append(criar('span', `${janela.percentual}% da assinatura · ${janela.janela} · ${janela.fonte}`), barra);
          }
        } else caixa.append(criar('span', `— · ${item.motivo}`));
        alvo.append(caixa);
      }
    } catch (erro) { mensagem('orq-consumo', erro.message); }
  }

  async function carregar() {
    $('orq-status').textContent = 'Lendo fila do Plane…';
    try {
      estado.fila = await json('/api/orquestracao');
      estado.triagem = null;
      $('orq-categoria').replaceChildren(new Option('Todas as categorias', ''));
      $('orq-categoria').disabled = true;
      $('orq-triagem-resumo').replaceChildren();
      $('orq-triagem-status').textContent = 'Triagem geral sob demanda; nenhuma etiqueta será alterada.';
      renderProjetos();
      renderCartas();
      const candidatas = estado.fila.itens.filter(c => c.labels.includes('READY TO DEV') || c.labels.includes('READY TO TEST')).length;
      $('orq-status').textContent = `${estado.fila.projetos.length} projetos · ${estado.fila.itens.length} cartas · ${candidatas} candidatas · ${estado.fila.itens.filter(c => c.elegivel).length} elegíveis · leitura/simulação`;
      if (estado.carta) {
        const atual = estado.fila.itens.find(c => c.id === estado.carta.id);
        if (atual) selecionarCarta(atual);
      } else {
        const idDaUrl = new URL(location.href).searchParams.get('carta');
        const inicial = estado.fila.itens.find(c => c.id === idDaUrl || c.identificador === idDaUrl);
        if (inicial) selecionarCarta(inicial);
      }
    } catch (erro) {
      estado.fila = null;
      estado.triagem = null;
      $('orq-cartas').replaceChildren();
      $('orq-status').textContent = `Fila indisponível: ${erro.message}`;
    }
  }

  async function carregarTriagem() {
    const botao = $('orq-triagem-carregar');
    botao.disabled = true;
    $('orq-triagem-status').textContent = 'Lendo relações formais das folhas sem gate; isso pode levar alguns segundos…';
    try {
      const dados = await json('/api/orquestracao/triagem-dev');
      estado.triagem = { ...dados, porId: new Map(dados.itens.map(item => [item.id, item])) };
      const select = $('orq-categoria');
      select.replaceChildren(new Option('Todas as categorias', ''));
      for (const categoria of dados.categorias.filter(x => x.total)) {
        select.add(new Option(`${categoria.nome} · ${categoria.total}`, categoria.codigo));
      }
      select.disabled = false;
      $('orq-filtro').value = 'sem-gate';
      const resumo = $('orq-triagem-resumo');
      resumo.replaceChildren(criar('p', `${dados.total} ${dados.total === 1 ? 'carta aberta' : 'cartas abertas'} sem gate · ${dados.folhas} ${dados.folhas === 1 ? 'folha' : 'folhas'} · ${dados.total - dados.folhas} cartas-pai.`),
        criar('p', 'Categorias se sobrepõem; ASTARGNE não significa necessariamente decisão de produto.'));
      $('orq-triagem-status').textContent = `Triagem atualizada às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}. Nenhuma etiqueta alterada.`;
      if (estado.fila) renderCartas();
      if (estado.carta) renderDemanda();
    } catch (erro) {
      estado.triagem = null;
      $('orq-categoria').replaceChildren(new Option('Todas as categorias', ''));
      $('orq-categoria').disabled = true;
      $('orq-triagem-resumo').replaceChildren();
      $('orq-triagem-status').textContent = `Triagem indisponível: ${erro.message}`;
    } finally { botao.disabled = false; }
  }

  for (const botao of document.querySelectorAll('[data-orq-topico]')) botao.addEventListener('click', () => mostrarTopico(botao.dataset.orqTopico));
  for (const id of ['orq-projeto', 'orq-filtro', 'orq-busca']) $(id).addEventListener(id === 'orq-busca' ? 'input' : 'change', () => { if (estado.fila) renderCartas(); });
  $('orq-categoria').addEventListener('change', () => {
    if ($('orq-categoria').value) $('orq-filtro').value = 'sem-gate';
    if (estado.fila) renderCartas();
  });
  $('orq-triagem-carregar').addEventListener('click', carregarTriagem);
  $('orq-atualizar').addEventListener('click', carregar);
  $('orq-legado-atualizar').addEventListener('click', carregarLegado);
  $('orq-validar-modelos').addEventListener('click', validarProposta);
  $('orq-preparar-modelos').addEventListener('click', prepararPerfil);
  $('orq-handoff-preparar').addEventListener('click', prepararHandoff);
  $('orq-voz-gravar').addEventListener('click', alternarGravacao);
  $('orq-voz-usar').addEventListener('click', () => {
    if (!estado.transcricao) return;
    $('orq-handoff-resumo').value = estado.transcricao.slice(0, 2000);
    limparConfirmacaoHandoff();
    $('orq-handoff-status').textContent = 'Transcrição copiada como proposta. Acrescente evidências e confirme manualmente antes de registrar.';
  });
  for (const id of ['orq-handoff-papel', 'orq-handoff-tentativa', 'orq-handoff-resultado', 'orq-handoff-resumo', 'orq-handoff-evidencias']) {
    $(id).addEventListener('input', limparConfirmacaoHandoff);
  }
  window.carregarOrquestracao = carregar;
})();
