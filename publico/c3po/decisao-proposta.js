// Cartão "Decisão proposta" do chat do C-3PO (PAINEL-65): mostra a decisão, o motivo e os efeitos que o C-3PO propôs, prepara sozinho para exibir o que muda no Plane e grava com UM toque do dono. Não propõe nem decide; sem a sessão do dono nada é gravado.
//
// Usado pelo /c3po/, pelo popup do Hangar e pela gaveta da mesa. As rotas são as mesmas duas
// ações da gaveta (/api/decisao/preparar e /confirmar): o cartão só poupa o formulário. Todo
// texto entra por textContent: carta, prosa, mudanças e mensagens de erro vêm de fora.
//
// O preparo vale 2 min. Se o toque chegar depois, o cartão prepara de novo e só grava direto
// quando o que muda é o mesmo que estava na tela; se a carta mudou, mostra o novo e espera
// outro toque.

(() => {
  const SEM_SESSAO = 'Sem a sessão do dono no Cadastro Único nada é gravado; abra o painel por https://painel.vpn.astargne.com, entre e tente de novo.';
  const ESTADOS_OK = new Set(['aplicado', 'só registro']);

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  async function postar(caminho, corpo) {
    const r = await fetch(caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados };
  }

  // Os efeitos pedidos, em português claro; o que muda de fato na carta vem do preparo.
  function efeitosPedidos(e = {}) {
    const linhas = [];
    if (e.destravar) linhas.push('Destravar a carta: sai a trava do dono e ela pode ficar despachável para a frota');
    if (e.produto === 'por') linhas.push('Pôr a label PRODUTO');
    if (e.produto === 'tirar') linhas.push('Tirar a label PRODUTO');
    if (e.estado) linhas.push(`Mudar o estado para ${e.estado}`);
    return linhas.length ? linhas : ['Só registrar o comentário; a carta não muda'];
  }

  // O que o dono viu: a versão da carta (a digital que o servidor calcula; muda com comentário,
  // descrição, título, labels e estado) e o que o preparo disse que muda.
  const assinatura = d => JSON.stringify([d.versao ?? null, d.mudancas ?? [], d.avisos ?? []]);
  // O 409 da mesa tem dois sentidos opostos e só o texto os separa: a recusa limpa começa assim;
  // o resto é "resultado incerto", que não se repete (vai para a aba Decisões).
  const NADA_GRAVADO = /^recusado; nada foi gravado/;
  // Cada preparo é um ssh do autorizador e um desafio pendente no servidor: uma rajada de
  // propostas não pode abrir dezenas. Além deste teto por janela, o cartão espera o toque.
  const JANELA_MS = 120_000;
  const MAX_AUTOMATICOS = 3;
  const automaticos = [];
  function podeAutomatico() {
    const agora = Date.now();
    while (automaticos.length && agora - automaticos[0] > JANELA_MS) automaticos.shift();
    if (automaticos.length >= MAX_AUTOMATICOS) return false;
    automaticos.push(agora);
    return true;
  }

  class CartaoDecisao {
    static criar(proposta) {
      const cartao = el('div', 'acao-cartao decisao-cartao');
      cartao.dataset.propostaDecisao = proposta.id;
      const titulo = el('p', 'acao-titulo', 'Decisão proposta para ');
      titulo.append(el('code', null, proposta.carta));
      const tituloCarta = el('p', 'decisao-carta');
      tituloCarta.hidden = true;
      const lista = el('dl', 'acao-lista');
      lista.append(el('dt', null, 'decisão'), el('dd', null, proposta.decisao));
      if (proposta.motivo) lista.append(el('dt', null, 'motivo'), el('dd', 'decisao-motivo', proposta.motivo));
      const efeitos = el('ul', 'decisao-efeitos');
      for (const linha of efeitosPedidos(proposta.efeitos)) efeitos.append(el('li', null, linha));
      const nota = el('p', 'acao-nota', 'O C-3PO redigiu e propôs os efeitos acima. Nada vai ao Plane sem o seu toque em Gravar.');
      const detalhe = el('div', 'acao-detalhe');
      const estado = el('p', 'acao-estado');
      const gravar = el('button', 'acao-confirmar decisao-gravar', 'Gravar no Plane');
      gravar.type = 'button';
      gravar.hidden = true;
      const refazer = el('button', 'acao-preparar', 'Preparar de novo');
      refazer.type = 'button';
      refazer.hidden = true;
      cartao.append(titulo, tituloCarta, lista, el('p', 'decisao-sub', 'Efeitos propostos'), efeitos, nota, detalhe, estado, gravar, refazer);

      let preparo = null;
      const avisar = (texto, classe = '') => { estado.hidden = !texto; estado.className = `acao-estado ${classe}`.trim(); estado.textContent = texto ?? ''; };
      const recusa = ({ status, dados }) => {
        const msg = dados?.erro || `HTTP ${status}`;
        avisar(status === 401 || status === 403 ? `${msg}. ${SEM_SESSAO}` : msg, 'acao-erro');
      };
      const pedido = () => ({ carta: proposta.carta, decisao: proposta.decisao, motivo: proposta.motivo ?? '', efeitos: proposta.efeitos });

      function mostrar(d) {
        // O título lido agora no Plane: é ele que diz ao dono QUAL carta o identificador aponta.
        tituloCarta.textContent = d.titulo ? `${proposta.carta} · ${d.titulo}` : '';
        tituloCarta.hidden = !d.titulo;
        const mudancas = el('ul', 'decisao-mudancas');
        for (const m of (d.mudancas?.length ? d.mudancas : ['nada além do comentário'])) mudancas.append(el('li', null, m));
        detalhe.replaceChildren(...[
          el('p', 'decisao-sub', 'Vai mudar no Plane'),
          mudancas,
          d.comentario ? el('p', 'decisao-sub', 'Comentário que entra na carta') : null,
          d.comentario ? el('pre', 'acao-saida', d.comentario) : null,
          ...(d.avisos ?? []).map(a => el('p', 'decisao-aviso', a))].filter(Boolean));
      }

      async function preparar() {
        gravar.hidden = true; refazer.hidden = true;
        avisar('preparando (a carta é relida no Plane; nada é gravado ainda)…');
        let r;
        try { r = await postar('/api/decisao/preparar', pedido()); }
        catch { avisar('o painel não respondeu', 'acao-erro'); refazer.hidden = false; return null; }
        if (!r.ok) { recusa(r); refazer.hidden = false; return null; }
        preparo = r.dados;
        mostrar(preparo);
        avisar(null);
        gravar.hidden = false; gravar.disabled = false;
        return preparo;
      }

      async function confirmar() {
        let c;
        try { c = await postar('/api/decisao/confirmar', { confirmacaoId: preparo.confirmacaoId }); }
        catch { avisar('o painel não respondeu; veja "aplicação pendente" na aba Decisões antes de repetir', 'acao-erro'); return; }
        // Preparo vencido (2 min) ou perdido num reinício: nada foi gravado. Prepara de novo e
        // só segue sozinho se o que muda é exatamente o que o dono viu antes de tocar.
        if (c.status === 404 || c.status === 410) {
          const visto = assinatura(preparo);
          const novo = await preparar();
          if (!novo) return;
          if (assinatura(novo) !== visto) { avisar('A carta mudou desde o preparo: confira de novo a carta e o que muda, e toque em Gravar outra vez.', 'acao-erro'); return; }
          gravar.disabled = true;
          avisar('gravando…');
          try { c = await postar('/api/decisao/confirmar', { confirmacaoId: novo.confirmacaoId }); }
          catch { avisar('o painel não respondeu; veja "aplicação pendente" na aba Decisões antes de repetir', 'acao-erro'); return; }
        }
        if (!c.ok) { recusa(c); if (c.status !== 409 || NADA_GRAVADO.test(c.dados?.erro ?? '')) refazer.hidden = false; return; }
        const x = c.dados;
        gravar.hidden = true;
        avisar(`Gravado no Plane · ${x.resultado}${x.mudancas?.length ? ` · ${x.mudancas.join(', ')}` : ''}${x.notas?.length ? ` · ${x.notas.join('; ')}` : ''}`,
          ESTADOS_OK.has(x.resultado) ? 'acao-ok' : 'acao-erro');
        cartao.dispatchEvent(new CustomEvent('decisao-gravada', { bubbles: true, detail: { carta: proposta.carta, resultado: x.resultado } }));
      }

      gravar.addEventListener('click', async () => {
        if (!preparo) return;
        gravar.disabled = true;
        avisar('gravando…');
        await confirmar();
      });
      refazer.addEventListener('click', () => { preparar(); });
      if (podeAutomatico()) preparar();
      else { refazer.textContent = 'Preparar'; refazer.hidden = false; avisar('Muitas propostas seguidas: toque em Preparar para ver o que esta muda no Plane.'); }
      return cartao;
    }
  }

  globalThis.CartaoDecisao = CartaoDecisao;
})();
