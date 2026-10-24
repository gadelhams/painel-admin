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
let ultimaPastaBacklog = null; // guarda se a chamada é troca de projeto ou só o próprio clique de filtro re-desenhando

// Placar n/m SEMPRE derivado aqui, na hora de desenhar — contagem armazenada
// viraria segunda fonte de verdade (regra do docs/02_ABA_BACKLOG.md). Também
// reaproveitado pela página de projeto (projeto.js) para o placar de stats.
function placar(nodos) {
  let total = 0;
  let prontos = 0;
  for (const nodo of nodos) {
    if (nodo.tipo === 'item') {
      total += 1;
      if (nodo.estado === 'pronto') prontos += 1;
    }
    // Cru também carrega filhos (hierarquia do arquivo preservada): um item
    // aninhado sob linha crua ainda conta no placar.
    const sub = placar(nodo.filhos ?? []);
    total += sub.total;
    prontos += sub.prontos;
  }
  return { total, prontos };
}

// As 6 tags canônicas do PADROES-BACKLOG.md — usadas como filtro fixo na
// aba Backlog (README Tela 4: "incluindo os de contagem zero, porque são
// filtros"), diferente dos chips de resumo do painel de projeto (Tela 3.2),
// que escondem contagem zero.
const TAGS_CANONICAS = ['ASTARGNE', 'BLOQUEADA', 'EMPÍRICA', 'CONGELADA', 'SEM ESCOPO', 'PÓS-PLAYTEST'];

const TAG_CLASSE = {
  ASTARGNE: 'tag-astargne',
  BLOQUEADA: 'tag-bloqueada',
  CONGELADA: 'tag-congelada',
  'EMPÍRICA': 'tag-empirica',
  'PÓS-PLAYTEST': 'tag-empirica', // mesmo sentido: depende de sinal de uso real
  'SEM ESCOPO': 'tag-sem-escopo',
};

function chipTag({ tag, detalhe }) {
  const classe = TAG_CLASSE[tag];
  return el(
    'span',
    { class: `etiqueta tag${classe ? ` ${classe}` : ''}`, ...(detalhe ? { title: detalhe } : {}) },
    tag,
  );
}

// Compartilhada com o painel de projeto (projeto.js): a falha diz a fonte
// verdadeira — arquivo no disco ou API do Plane.
function mensagemFalhaBacklog(pr) {
  if (pr.estado === 'erro_plane') return `falha ao consultar o Plane — ${pr.erro ?? pr.estado}`;
  return pr.estado === 'sem_arquivo'
    ? `sem arquivo — ${pr.pasta}/${pr.backlog} não existe no disco`
    : `falha ao ler ${pr.pasta}/${pr.backlog} — ${pr.erro ?? pr.estado}`;
}

function conteudoNodo(nodo) {
  const partes = [];
  if (nodo.tipo === 'item') {
    partes.push(el('span', { class: `marca ${nodo.estado}` }, nodo.estado === 'pronto' ? '☑' : '☐'));
  }
  // Item vindo do Plane leva o identificador (ex.: CORRE-7) como link para o work item —
  // é lá que se edita; o painel só lê.
  if (nodo.identificador) {
    partes.push(el('a', { class: 'id-rastreador', href: nodo.url, target: '_blank', rel: 'noopener' }, nodo.identificador));
  }
  partes.push(el('span', { class: 'item-texto' }, ...formatar(nodo.texto)));
  const p = placar(nodo.filhos ?? []);
  if (p.total) partes.push(el('span', { class: 'placar' }, `${p.prontos}/${p.total}`));
  partes.push(...nodo.tags.map(chipTag));
  return partes;
}

// Nó com filhos vira <details> (card expansível, sem JS de estado); nó folha
// vira linha simples. `comFilhos = false` é usado pelo filtro de tag: mostra
// só a linha que casou, sem puxar a subárvore inteira pra tela.
function desenharNodo(nodo, comFilhos = true) {
  const classeTipo = nodo.tipo === 'cru' ? ' cru' : '';
  const classeEstado = nodo.tipo === 'item' ? ` ${nodo.estado}` : '';
  const temFilhos = comFilhos && (nodo.filhos ?? []).length > 0;
  if (temFilhos) {
    return el(
      'details',
      { class: `item${classeEstado}${classeTipo}` },
      el('summary', { class: 'item-linha' }, ...conteudoNodo(nodo)),
      el('div', { class: 'item-filhos' }, ...nodo.filhos.map((f) => desenharNodo(f))),
    );
  }
  return el('div', { class: `item-linha folha${classeEstado}${classeTipo}` }, ...conteudoNodo(nodo));
}

// `modoFiltroTag` (app.js) é lido direto, mesmo padrão de estado
// compartilhado que `dadosProjetos`/`dadosBacklog` já usam — sem passar
// parâmetro por toda a cadeia de chamada. Cru (sem `.estado`) sempre conta/
// aparece: não tem checkbox pra estar "pronto" ou não.
function nodoVisivelNoModo(nodo) {
  return modoFiltroTag === 'todos' || nodo.tipo !== 'item' || nodo.estado !== 'pronto';
}

function nosComTag(nodos, tag, achados = []) {
  for (const nodo of nodos) {
    if (nodo.tags.some((t) => t.tag === tag) && nodoVisivelNoModo(nodo)) achados.push(nodo);
    nosComTag(nodo.filhos ?? [], tag, achados);
  }
  return achados;
}

function contarTags(nodos, contagem) {
  for (const nodo of nodos) {
    if (nodoVisivelNoModo(nodo)) {
      for (const t of nodo.tags) contagem.set(t.tag, (contagem.get(t.tag) ?? 0) + 1);
    }
    contarTags(nodo.filhos ?? [], contagem);
  }
}

// ---------- painel de projeto (Tela 3.2): <details> por feature, primeira aberta ----------
// Chamada por projeto.js — vive aqui porque reaproveita desenharNodo/placar
// direto, sem duplicar a recursão. `tagAtiva` opcional (21/08/2026, pedido
// do dono): os chips de resumo do cabeçalho do projeto viraram filtro
// também, mesmo padrão de nosComTag que já filtrava a aba Backlog.
function outlineFeatureDetalhes(f, aberta, tagAtiva) {
  const p = placar(f.itens);
  const corpo = tagAtiva
    ? nosComTag(f.itens, tagAtiva).map((nodo) => desenharNodo(nodo, false))
    : f.itens.map((nodo) => desenharNodo(nodo));
  return el(
    'details',
    { class: 'feature-outline', ...(aberta ? { open: '' } : {}) },
    el(
      'summary',
      { class: 'feature-outline-cab' },
      el('span', { class: 'chev' }, '›'),
      el('span', { class: 'feature-token' }, f.estado === 'pronto' ? '[x]' : '[ ]'),
      el('span', { class: 'feature-outline-titulo' }, ...formatar(f.titulo)),
      el('span', { class: 'placar' }, `${p.prontos}/${p.total}`),
    ),
    el('div', { class: 'feature-outline-corpo' }, ...corpo),
  );
}

// ---------- aba Backlog (Tela 4): duas colunas, sempre expandido, um projeto só ----------

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
