// Backlog — o markdown de cada projeto é a VERDADE; toda tela aqui é
// projeção. Nada guarda estado: todo número é derivado do JSON no momento
// de desenhar (docs/02_ABA_BACKLOG.md). Reskin "Industry HUD" (21/08/2026):
// a aba Backlog e o painel de projeto (projeto.js) agora mostram o backlog
// de UM projeto por vez — o mesmo `projetoSelecionado` de app.js — em vez do
// quadro multi-projeto/kanban de antes. `desenharNodo`/`placar`/`nosComTag`
// abaixo são as primitivas recursivas que sobrevivem à troca de layout: já
// eram independentes de apresentação, só a casca ao redor delas mudou.

const abaBacklogEl = document.getElementById('aba-backlog');

let dadosBacklog = null;
let tagAtivaBacklog = null; // filtro local à aba Backlog; reseta ao trocar de projeto (nunca esconde o novo projeto em silêncio)
let ultimaPastaBacklog = null;

// A árvore mora em backlog-nodo.js. Aqui fica a aba de um projeto.

function blocoFeatureExpandido(f) {
  const corpo = tagAtivaBacklog
    ? nosComTag(f.itens, tagAtivaBacklog).map((nodo) => desenharNodo(nodo, false))
    : f.itens.map((nodo) => desenharNodo(nodo));
  const p = placar(f.itens);
  return el(
    'div',
    { class: 'feature-bloco' },
    el(
      'div',
      { class: 'feature-cab' },
      el('span', { class: 'feature-token' }, f.estado === 'pronto' ? '[x]' : '[ ]'),
      el('h3', { class: 'feature-titulo' }, ...formatar(f.titulo)),
      el('span', { class: 'placar' }, `${p.prontos}/${p.total}`),
    ),
    el('div', { class: 'feature-itens' }, ...corpo),
  );
}

function desenharBacklogDoProjeto(pasta) {
  // Só zera o filtro numa troca DE VERDADE de projeto — o próprio clique
  // nos chips chama esta função de novo pra re-desenhar com o filtro novo,
  // e zerar ali apagaria o clique que acabou de acontecer.
  if (pasta !== ultimaPastaBacklog) {
    tagAtivaBacklog = null;
    ultimaPastaBacklog = pasta;
  }
  if (!dadosBacklog) {
    abaBacklogEl.replaceChildren(el('p', { class: 'discreto' }, 'backlog ainda carregando…'));
    return;
  }
  const pr = dadosBacklog.projetos.find((p) => p.pasta === pasta);
  const doCatalogo = dadosProjetos.find((p) => p.pasta === pasta);
  const titulo = doCatalogo?.titulo ?? pasta;

  if (!pr) {
    abaBacklogEl.replaceChildren(el('p', { class: 'discreto' }, `${titulo} não tem o campo backlog no catálogo.`));
    return;
  }
  if (pr.estado !== 'ok') {
    const mensagem = mensagemFalhaBacklog(pr);
    abaBacklogEl.replaceChildren(
      el('h2', { class: 'titulo-secao' }, `Backlog — ${titulo}`),
      el('div', { class: 'sonda' }, el('span', { class: 'luz falha' }), el('span', {}, mensagem)),
    );
    return;
  }

  const contagem = new Map();
  for (const f of pr.features) contarTags(f.itens, contagem);

  const chips = [
    el('button', { type: 'button', class: `filtro${tagAtivaBacklog ? '' : ' ativa'}`, 'data-tag': '' }, 'todas'),
    ...TAGS_CANONICAS.map((tag) => el(
      'button',
      { type: 'button', class: `filtro${tag === 'ASTARGNE' ? ' filtro-astargne' : ''}${tagAtivaBacklog === tag ? ' ativa' : ''}`, 'data-tag': tag },
      `${tag} · ${contagem.get(tag) ?? 0}`,
    )),
  ];
  for (const b of chips) {
    b.addEventListener('click', () => {
      tagAtivaBacklog = b.dataset.tag || null;
      desenharBacklogDoProjeto(pasta);
    });
  }

  const features = tagAtivaBacklog
    ? pr.features.filter((f) => nosComTag(f.itens, tagAtivaBacklog).length)
    : pr.features;

  abaBacklogEl.replaceChildren(
    el(
      'div',
      { class: 'backlog-cabecalho' },
      el(
        'div',
        {},
        el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 02 / DEMANDAS'),
        pr.url
          ? el('p', { class: 'kicker' }, `${pr.pasta} · `, el('a', { href: pr.url, target: '_blank', rel: 'noopener' }, pr.backlog))
          : el('p', { class: 'kicker' }, `${pr.pasta} · ${pr.backlog}`),
        el('h2', { class: 'titulo-secao' }, `Backlog — ${titulo}`),
      ),
      el(
        'div',
        { class: 'linha-filtro-tags' },
        el('div', { class: 'filtro-tags' }, ...chips),
        elToggleFiltro(() => desenharBacklogDoProjeto(pasta)),
      ),
    ),
    features.length
      ? el('div', { class: 'grid-backlog' }, ...features.map(blocoFeatureExpandido))
      : el('p', { class: 'discreto' }, `nenhuma feature com (${tagAtivaBacklog})`),
    pr.fonte === 'plane'
      ? el('p', { class: 'nota-cru' }, 'lido do Plane (a verdade) — módulo = feature, sub-work item = filho; edite lá, o painel só lê.')
      : el('p', { class: 'nota-cru' }, 'linhas fora da gramática aparecem verbatim, sem chip — o parser nunca esconde o que não entendeu.'),
  );
}

async function carregarBacklog() {
  const resposta = await fetch('/api/backlog');
  dadosBacklog = await resposta.json();
}
