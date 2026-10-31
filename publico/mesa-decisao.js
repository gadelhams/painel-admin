// Gaveta da mesa de decisão (PAINEL-53): a carta inteira à esquerda, o C-3PO à direita e o registro de decisão, que grava no Plane só por SSO + duas ações. Abre do Hangar ([data-mesa]) e da aba Decisões.
//
// Um componente só para as duas portas de entrada. O que vem do Plane chega como texto
// (o servidor tira o HTML) e entra por textContent. Os efeitos começam desmarcados sempre
// (abrir, rascunho do C-3PO): marcá-los é ato do dono.

(() => {
  const SEM_SESSAO = 'Sem a sessão do dono no Cadastro Único nada é gravado; entre em https://astargne.com e volte a esta aba.';
  const ESTADOS = ['Backlog', 'Todo', 'In Progress', 'Done', 'Cancelled'];
  const ETAPA = { pendente: 'o comentário pode não ter chegado', 'comentario-gravado': 'comentário gravado, mudanças por aplicar' };

  function el(tag, classe, ...filhos) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    for (const f of filhos) if (f !== null && f !== undefined && f !== false) e.append(f);
    return e;
  }
  const botao = (classe, texto) => Object.assign(el('button', classe, texto), { type: 'button' });

  async function postar(caminho, corpo) {
    const r = await fetch(caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    return { ok: r.ok, status: r.status, dados: await r.json().catch(() => ({})) };
  }
  const recusa = ({ status, dados }) => {
    const msg = dados?.erro || `HTTP ${status}`;
    return status === 401 || status === 403 ? `${msg}. ${SEM_SESSAO}` : msg;
  };

  let G = null; // a gaveta montada
  let atual = null;

  function montar() {
    if (G) return G;
    const $ = (id) => document.getElementById(id);
    const raiz = el('aside', 'mesa');
    raiz.id = 'mesa';
    raiz.hidden = true;
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-label', 'Mesa de decisão');
    raiz.innerHTML = `
      <header class="mesa-cab"><div><p class="mesa-olho">C-3PO · mesa de decisão</p><h2 class="mesa-titulo" id="mesa-titulo"></h2></div>
        <button type="button" class="mesa-fechar" id="mesa-fechar" aria-label="Fechar a mesa">fechar</button></header>
      <div class="mesa-corpo">
        <section class="mesa-carta" id="mesa-carta" aria-label="A carta"></section>
        <section class="mesa-lado">
          <div class="mesa-historico" id="mesa-historico" aria-live="polite"></div>
          <form class="mesa-pergunta" id="mesa-pergunta-form">
            <textarea id="mesa-pergunta" rows="2" maxlength="4000" placeholder="Pergunte ao C-3PO sobre esta decisão"></textarea>
            <button type="submit" class="mesa-acao" id="mesa-enviar">Enviar</button>
          </form>
          <form class="mesa-registro" id="mesa-registro" novalidate>
            <h3 class="mesa-sub">Registro de decisão</h3>
            <button type="button" class="mesa-acao mesa-secundaria" id="mesa-rascunho">Pedir rascunho ao C-3PO</button>
            <label class="mesa-rotulo" for="mesa-decisao">Decisão, em uma frase</label>
            <input id="mesa-decisao" maxlength="300" autocomplete="off">
            <label class="mesa-rotulo" for="mesa-motivo">Motivo</label>
            <textarea id="mesa-motivo" rows="3" maxlength="2000"></textarea>
            <fieldset class="mesa-efeitos"><legend>Efeitos (só estes; nada marcado = só o registro)</legend>
              <label class="mesa-opcao"><input type="checkbox" id="mesa-destravar"> destravar: tirar ASTARGNE e trocar o marcador da descrição</label>
              <label class="mesa-opcao">PRODUTO <select id="mesa-produto"><option value="manter">manter</option><option value="por">pôr</option><option value="tirar">tirar</option></select></label>
              <label class="mesa-opcao">estado <select id="mesa-estado"><option value="">não mudar</option></select></label>
            </fieldset>
            <p class="mesa-aviso" id="mesa-so-leitura" hidden></p>
            <button type="submit" class="mesa-acao" id="mesa-gravar">Gravar no Plane</button>
            <div class="mesa-preparo" id="mesa-preparo" hidden></div>
            <p class="mesa-situacao" id="mesa-situacao" hidden></p>
          </form>
        </section>
      </div>`;
    document.body.append(raiz);
    G = { raiz, $, conversa: new globalThis.ConversaMesa({ historico: $('mesa-historico'), enviar: $('mesa-enviar') }) };
    $('mesa-fechar').addEventListener('click', fechar);
    raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    $('mesa-pergunta-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = $('mesa-pergunta').value.trim();
      if (!t || $('mesa-enviar').disabled) return;
      $('mesa-pergunta').value = '';
      G.conversa.mandar(t);
    });
    $('mesa-rascunho').addEventListener('click', pedirRascunho);
    $('mesa-registro').addEventListener('submit', (e) => { e.preventDefault(); preparar(); });
    $('mesa-registro').addEventListener('input', () => { if (!$('mesa-preparo').hidden) limparPreparo('o formulário mudou: grave de novo para ver o resumo'); });
    return G;
  }

  function situacao(texto, classe = '') {
    const s = G.$('mesa-situacao');
    s.hidden = !texto;
    s.className = `mesa-situacao ${classe}`.trim();
    s.textContent = texto ?? '';
  }
  function limparPreparo(motivo) { G.$('mesa-preparo').hidden = true; G.$('mesa-preparo').replaceChildren(); situacao(motivo ?? null); }

  // Desmarcados: o estado inicial do formulário e o depois de qualquer rascunho.
  function efeitosDesmarcados() {
    G.$('mesa-destravar').checked = false;
    G.$('mesa-produto').value = 'manter';
    G.$('mesa-estado').value = '';
  }

  function desenharCarta(c) {
    const lista = (titulo, itens) => el('div', 'mesa-bloco', el('h4', 'mesa-sub', titulo), ...itens);
    const chips = el('p', 'mesa-chips', ...c.labels.map((l) => el('span', 'mesa-chip', l)));
    const comentarios = c.comentarios.length
      ? c.comentarios.map((x) => el('div', `mesa-comentario${x.mesa ? ' mesa-comentario-mesa' : ''}`,
        el('p', 'mesa-quando', `${x.quando ? new Date(x.quando).toLocaleString('pt-BR') : '—'}${x.mesa ? ` · ${x.mesa === 'recibo' ? 'recibo da mesa' : 'decisão da mesa'}` : ''}`),
        el('p', 'mesa-texto', x.texto)))
      : [el('p', 'mesa-vazio', 'Nenhum comentário.')];
    const link = el('a', 'mesa-link', 'abrir no Plane');
    link.href = c.url; link.target = '_blank'; link.rel = 'noopener';
    G.$('mesa-carta').replaceChildren(...[
      el('p', 'mesa-meta', `${c.identificador} · ${atual.modulo ? `módulo ${atual.modulo} · ` : ''}${c.estado ?? '?'}`),
      el('h3', 'mesa-carta-titulo', c.titulo), chips, link,
      c.esperaDecisao ? null : el('p', 'mesa-aviso', 'Esta carta não espera decisão do dono agora (sem ASTARGNE nem PRODUTO).'),
      lista('Descrição', [el('p', 'mesa-texto', c.descricao || '—')]),
      lista(`Comentários${c.comentariosOmitidos ? ` (os ${c.comentarios.length} últimos)` : ''}`, comentarios),
      c.pendentes.length ? lista('Aplicação pendente', c.pendentes.map(blocoPendente)) : null].filter(Boolean));
    const estado = G.$('mesa-estado');
    estado.replaceChildren(el('option', null, 'não mudar'), ...ESTADOS.filter((e) => c.estados.includes(e) && e !== c.estado).map((e) => el('option', null, e)));
    estado.firstChild.value = '';
    G.$('mesa-produto').querySelector('[value="por"]').disabled = !c.temProduto || c.labels.includes('PRODUTO');
    G.$('mesa-produto').querySelector('[value="tirar"]').disabled = !c.labels.includes('PRODUTO');
    G.$('mesa-destravar').disabled = !c.labels.some((l) => l === 'ASTARGNE' || l === 'DONO');
    const fechada = !c.escrita.habilitada || c.pendentes.length > 0 || !c.esperaDecisao;
    G.$('mesa-gravar').disabled = fechada;
    const so = G.$('mesa-so-leitura');
    so.hidden = !fechada;
    so.textContent = !c.escrita.habilitada ? `Só leitura: ${c.escrita.motivo}` : c.pendentes.length ? 'Há aplicação pendente desta carta: retome-a antes de gravar outra.' : 'Nada a gravar: a carta não espera decisão.';
  }

  async function carregarCarta() {
    const meu = atual;
    G.$('mesa-carta').replaceChildren(el('p', 'mesa-vazio', 'lendo a carta no Plane…'));
    let r;
    try { r = await fetch(`/api/decisao/carta?carta=${encodeURIComponent(meu.carta)}`); } catch { r = null; }
    if (meu !== atual) return;
    const dados = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      G.$('mesa-carta').replaceChildren(el('p', 'mesa-erro', dados.erro || 'o painel não respondeu'));
      G.$('mesa-gravar').disabled = true;
      return;
    }
    atual.dados = dados;
    desenharCarta(dados);
  }

  function pedido() {
    return { carta: atual.carta, decisao: G.$('mesa-decisao').value, motivo: G.$('mesa-motivo').value,
      efeitos: { destravar: G.$('mesa-destravar').checked, produto: G.$('mesa-produto').value, estado: G.$('mesa-estado').value || null } };
  }

  async function pedirRascunho() {
    const b = G.$('mesa-rascunho');
    b.disabled = true;
    situacao('pedindo o rascunho ao C-3PO…');
    try {
      const r = await G.conversa.rascunho();
      if (!r) { situacao('o C-3PO não devolveu um rascunho legível; escreva à mão ou peça de novo', 'mesa-erro'); return; }
      G.$('mesa-decisao').value = r.decisao;
      G.$('mesa-motivo').value = r.motivo;
      efeitosDesmarcados();
      limparPreparo('rascunho preenchido: confira e edite; os efeitos ficam desmarcados até você marcar');
    } finally { b.disabled = false; }
  }

  function resumo(d, rotuloConfirmar, aoConfirmar) {
    const caixa = G.$('mesa-preparo');
    const confirmar = botao('mesa-acao', rotuloConfirmar);
    const cancelar = botao('mesa-acao mesa-secundaria', 'Cancelar');
    caixa.replaceChildren(...[
      el('h4', 'mesa-sub', 'Vai mudar no Plane'),
      el('ul', 'mesa-lista', ...(d.mudancas?.length ? d.mudancas : ['nada além do comentário']).map((m) => el('li', null, m))),
      d.comentario ? el('h4', 'mesa-sub', 'Comentário que entra na carta') : null,
      d.comentario ? el('pre', 'mesa-comentario-previa', d.comentario) : null,
      ...(d.avisos ?? []).map((a) => el('p', 'mesa-aviso', a)),
      el('p', 'mesa-nota', d.aviso ?? ''),
      el('div', 'mesa-botoes', confirmar, cancelar)].filter(Boolean));
    caixa.hidden = false;
    cancelar.addEventListener('click', () => limparPreparo());
    confirmar.addEventListener('click', async () => {
      confirmar.disabled = true; cancelar.disabled = true;
      situacao('gravando…');
      let c;
      try { c = await aoConfirmar(); } catch { situacao('o painel não respondeu; veja "aplicação pendente" antes de repetir', 'mesa-erro'); return; }
      if (!c.ok) { situacao(recusa(c), 'mesa-erro'); return; }
      caixa.hidden = true;
      const x = c.dados;
      situacao(`Gravado no Plane · ${x.resultado}${x.mudancas?.length ? ` · ${x.mudancas.join(', ')}` : ''}${x.notas?.length ? ` · ${x.notas.join('; ')}` : ''}`,
        x.resultado === 'aplicado' || x.resultado === 'só registro' ? 'mesa-ok' : 'mesa-erro');
      G.conversa.linha('nota', `Decisão gravada no Plane (${x.resultado}).`);
      carregarCarta();
    });
  }

  async function preparar() {
    const b = G.$('mesa-gravar');
    b.disabled = true;
    situacao('preparando (a carta é relida no Plane; nada é gravado ainda)…');
    let r;
    try { r = await postar('/api/decisao/preparar', pedido()); } catch { r = null; }
    b.disabled = false;
    if (!r) { situacao('o painel não respondeu', 'mesa-erro'); return; }
    if (!r.ok) { situacao(recusa(r), 'mesa-erro'); return; }
    situacao(null);
    resumo(r.dados, 'Confirmar e gravar', () => postar('/api/decisao/confirmar', { confirmacaoId: r.dados.confirmacaoId }));
  }

  // Retomar mostra as mudanças recalculadas contra a carta de agora; Abandonar fecha a pendência
  // (carta mudou, sumiu ou congelou) sem aplicar nada. As duas pedem SSO + duas ações.
  function acaoPendente(p, rotulo, base, preparando, confirmar) {
    const b = botao('mesa-acao mesa-secundaria', rotulo);
    b.addEventListener('click', async () => {
      if (!G || G.raiz.hidden || atual?.carta !== p.identificador) await abrir({ carta: p.identificador });
      b.disabled = true;
      situacao(preparando);
      let r;
      try { r = await postar(`${base}/preparar`, { chave: p.chave }); } catch { r = null; }
      b.disabled = false;
      if (!r?.ok) { situacao(r ? recusa(r) : 'o painel não respondeu', 'mesa-erro'); return; }
      situacao(null);
      resumo(r.dados, confirmar, () => postar(`${base}/confirmar`, { confirmacaoId: r.dados.confirmacaoId }));
    });
    return b;
  }

  function blocoPendente(p) {
    return el('div', 'mesa-pendente', el('p', 'mesa-texto', `${p.identificador} · ${p.decisao} · ${ETAPA[p.etapa] ?? p.etapa}`),
      acaoPendente(p, 'Retomar', '/api/decisao/retomada', 'preparando a retomada (a carta é relida)…', 'Confirmar a retomada'),
      acaoPendente(p, 'Abandonar', '/api/decisao/abandono', 'preparando o abandono…', 'Confirmar o abandono'));
  }

  async function abrir({ carta, titulo, modulo }) {
    montar();
    atual = { carta, titulo: titulo ?? '', modulo: modulo ?? '' };
    G.$('mesa-titulo').textContent = `${carta}${titulo ? ` · ${titulo}` : ''}`;
    G.$('mesa-decisao').value = '';
    G.$('mesa-motivo').value = '';
    efeitosDesmarcados();
    limparPreparo();
    G.raiz.hidden = false;
    G.conversa.abrir({ carta, titulo });
    G.$('mesa-pergunta').focus();
    await carregarCarta();
  }

  function fechar() {
    if (!G) return;
    G.conversa.fechar();
    G.raiz.hidden = true;
    atual = null;
  }

  // Para a aba Decisões: as aplicações que ficaram pela metade (arranque, queda, timeout).
  function blocoPendentes() {
    const caixa = el('div', 'mesa-pendentes');
    fetch('/api/decisao/pendentes').then((r) => (r.ok ? r.json() : { pendentes: [] })).catch(() => ({ pendentes: [] })).then(({ pendentes }) => {
      if (!pendentes?.length) return;
      montar();
      caixa.replaceChildren(el('h3', 'mesa-sub', 'Mesa de decisão · aplicação pendente'), ...pendentes.map(blocoPendente));
    });
    return caixa;
  }

  // Hangar (módulo ES) e quem mais quiser: um botão com data-mesa="SIGLA-N" abre a gaveta.
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-mesa]');
    if (!b) return;
    e.preventDefault();
    abrir({ carta: b.dataset.mesa, titulo: b.dataset.mesaTitulo, modulo: b.dataset.mesaModulo });
  });

  globalThis.MesaDecisao = { abrir, fechar, blocoPendentes };
})();
