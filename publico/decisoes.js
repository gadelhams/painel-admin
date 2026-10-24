// Aba Decisões (Tela 5 do reskin "Industry HUD", 21/08/2026) — todas as
// decisões paradas do painel, agrupadas por projeto. Reaproveita
// `dadosDecisoes`/`dadosProjetos` (app.js) e `formatar`/`idadeCurta`
// (projeto.js) — nada buscado aqui, é só apresentação sobre o cache.

const abaDecisoesEl = document.getElementById('aba-decisoes');

function tituloDoProjeto(pasta) {
  return dadosProjetos.find((p) => p.pasta === pasta)?.titulo ?? pasta;
}

function projetoCongelado(pasta) {
  return dadosProjetos.find((p) => p.pasta === pasta)?.congelado === true;
}

function arquivoDoProjeto(pasta) {
  return dadosBacklog?.projetos.find((p) => p.pasta === pasta)?.backlog ?? '';
}

function agruparDecisoesPorProjeto(decisoes) {
  const porProjeto = new Map();
  for (const d of decisoes) {
    if (!porProjeto.has(d.projeto)) porProjeto.set(d.projeto, []);
    porProjeto.get(d.projeto).push(d);
  }
  for (const lista of porProjeto.values()) {
    lista.sort((a, b) => {
      if (a.desde === null) return 1;
      if (b.desde === null) return -1;
      return new Date(a.desde) - new Date(b.desde);
    });
  }
  // Grupos ordenados por contagem (README) — mais decisões primeiro.
  return [...porProjeto.entries()].sort((a, b) => b[1].length - a[1].length);
}

function linkIssue(d) {
  const a = el('a', { class: 'id-rastreador', href: d.url, target: '_blank', rel: 'noopener' }, d.identificador);
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function linhaDecisaoTabela(d) {
  const linha = el(
    'div',
    { class: 'linha-decisoes-tab', tabindex: '0', role: 'button' },
    el('span', { class: 'idade-decisoes-tab' }, d.desde ? `${new Date(d.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${idadeCurta(d.desde)}` : '—'),
    el(
      'div',
      { class: 'texto-decisoes-tab' },
      el('div', { class: 'texto-decisao-principal' }, ...formatar(d.texto)),
      el(
        'div',
        { class: 'contexto-decisao' },
        // O link não pode abrir o console junto (a linha inteira é botão).
        ...(d.url ? [linkIssue(d), ' · '] : []),
        `${d.feature}`,
      ),
    ),
    chipTag({ tag: d.tag, detalhe: d.detalhe }),
  );
  const abrir = () => abrirConsoleComDecisao(d);
  linha.addEventListener('click', abrir);
  linha.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  return linha;
}

// Primeiros 3 grupos (por contagem, já ordenados) abertos; o resto colapsa
// junto num grupo "Outros N projetos" — critério meu, o handoff não dá o
// número exato de grupos sempre expandidos.
// Bloco "Astargne" (decisão do dono, 24/10/2026): o que depende dele, separado do que
// o orquestrador resolve. Classificação por etiqueta e por verbos do título — heurística,
// dita como tal na tela: "contas externas e chaves" vem do catálogo de chaves (rotações
// pendentes), "push/deploy/sudo", "provas suas" e "decisões de produto" dos cards abertos
// com ASTARGNE/EMPÍRICA.
const SEM_CHAVES = { pendentes: [], feitas: [] };
let chavesCache = { quando: 0, dados: SEM_CHAVES };
async function lerChaves() {
  if (Date.now() - chavesCache.quando < 60_000) return chavesCache.dados;
  try {
    const r = await fetch('/api/chaves');
    const dados = await r.json();
    chavesCache = { quando: Date.now(), dados: r.ok ? { pendentes: dados.pendentes ?? [], feitas: dados.rotacoesFeitas ?? [] } : SEM_CHAVES };
  } catch { chavesCache = { quando: Date.now(), dados: SEM_CHAVES }; }
  return chavesCache.dados;
}
const RE_PUSH = /\b(push|deploy|publicar|sudo|instalar|borda|unit de usu)/i;
const RE_PROVA = /\b(prova|aceite|conferir|conferência|exercitar|retestar|testar|entra no|aprova|convidar|olho humano|rotulad|revisada e aceita|medir|real)\b/i;
function classificarAstargne(decisoes, { pendentes, feitas }) {
  const cardsDeChave = new Set(pendentes.map(c => c.card));
  const feitaPorCard = new Map(feitas.map(f => [f.card, f]));
  const grupos = { chaves: [], feitas: [], push: [], provas: [], produto: [] };
  for (const d of decisoes) {
    if (d.estado !== 'aberto' || !['ASTARGNE', 'EMPÍRICA'].includes(d.tag) || projetoCongelado(d.projeto)) continue;
    if (feitaPorCard.has(d.identificador)) grupos.feitas.push({ ...d, feita: feitaPorCard.get(d.identificador) });
    else if (cardsDeChave.has(d.identificador)) grupos.chaves.push(d);
    else if (RE_PUSH.test(d.texto)) grupos.push.push(d);
    else if (d.tag === 'EMPÍRICA' || RE_PROVA.test(d.texto)) grupos.provas.push(d);
    else grupos.produto.push(d);
  }
  return grupos;
}
// Aberto/fechado é conveniência deste navegador (localStorage); começa aberto.
const CHAVE_ASTARGNE_ABERTO = 'painel-astargne-aberto';
function astargneAberto() { try { return localStorage.getItem(CHAVE_ASTARGNE_ABERTO) !== 'nao'; } catch { return true; } }
function painelAstargne(grupos, { pendentes }) {
  const lista = (itens, vazio) => itens.length ? el('ul', {}, ...itens.map(d => el('li', {}, ...(d.url ? [linkIssue(d), ' '] : []), `${tituloDoProjeto(d.projeto)} · ${d.texto.slice(0, 110)}`))) : el('p', { class: 'discreto' }, vazio);
  const chaves = pendentes.length
    ? el('ul', {}, ...pendentes.map(c => el('li', {}, el('a', { href: '#/chaves', class: 'id-rastreador' }, c.card), ` ${c.projeto} · `, el('code', {}, c.nome), ` — ${c.motivo}`)))
    : el('p', { class: 'discreto' }, 'nenhuma rotação pendente.');
  // Rotação já registrada na aba Chaves com o card ainda aberto no Plane: não é
  // mais pendência sua — é o orquestrador que fecha o card no próximo fecho.
  const feitas = grupos.feitas.length
    ? el('ul', { class: 'astargne-feitas' }, ...grupos.feitas.map(d => el('li', {}, ...(d.url ? [linkIssue(d), ' '] : []), `${tituloDoProjeto(d.projeto)} · rotação registrada${d.feita.quando ? ` em ${new Date(d.feita.quando).toLocaleDateString('pt-BR')}` : ''} — card a fechar pelo orquestrador`)))
    : null;
  const total = pendentes.length + grupos.push.length + grupos.provas.length + grupos.produto.length;
  const painel = el('details', { class: 'astargne-painel', ...(astargneAberto() ? { open: '' } : {}) },
    el('summary', { class: 'astargne-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'pagina-kicker' }, 'ASTARGNE · O QUE DEPENDE DE VOCÊ'), el('span', { class: 'selo-contagem' }, String(total))),
    el('h3', {}, `Chaves e contas externas (${pendentes.length})`), chaves, ...(feitas ? [feitas] : []),
    el('h3', {}, `Push, deploy e sudo (${grupos.push.length})`), lista(grupos.push, 'nada esperando push, deploy ou sudo.'),
    el('h3', {}, `Provas suas (${grupos.provas.length})`), lista(grupos.provas, 'nenhuma prova humana pendente.'),
    el('h3', {}, `Decisões de produto (${grupos.produto.length})`), lista(grupos.produto, 'nenhuma decisão de produto pendente.'),
    el('p', { class: 'kicker' }, 'classificação por etiqueta e verbo do título; projetos congelados ficam de fora; o resto da aba é o orquestrador quem resolve.'));
  painel.addEventListener('toggle', () => { try { localStorage.setItem(CHAVE_ASTARGNE_ABERTO, painel.open ? 'sim' : 'nao'); } catch { /* sem armazenamento: só não lembra */ } });
  return painel;
}

function desenharDecisoes() {
  if (!decisoesDisponiveis) {
    abaDecisoesEl.replaceChildren(el('p', { class: 'discreto' }, 'não consegui carregar as decisões agora.'));
    return;
  }
  // Toggle todas/abertas (app.js) filtra ANTES de agrupar/contar — grupo,
  // contagem e "mais velha" refletem só o que está visível no modo atual.
  const visiveis = dadosDecisoes.filter((d) => decisaoVisivel(d) && !projetoCongelado(d.projeto));
  const toggle = elToggleFiltro(desenharDecisoes);

  if (!visiveis.length) {
    abaDecisoesEl.replaceChildren(
      el('div', { class: 'decisoes-cabecalho' }, el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 03 / DECISÕES'), el('h2', { class: 'titulo-secao' }, '0 decisões paradas')), toggle),
      el('p', { class: 'discreto' }, modoFiltroTag === 'aberto' ? 'nenhuma decisão aberta — tudo pronto ou congelado.' : 'nenhuma decisão parada — tudo limpo.'),
    );
    return;
  }

  const grupos = agruparDecisoesPorProjeto(visiveis);
  const maisVelhaGeral = [...visiveis].sort((a, b) => {
    if (a.desde === null) return 1;
    if (b.desde === null) return -1;
    return new Date(a.desde) - new Date(b.desde);
  })[0];

  const principais = grupos.slice(0, 3);
  const resto = grupos.slice(3);

  const detalhesProjeto = ([pasta, decisoes], aberto) => el(
    'details',
    { class: 'grupo-projeto-decisoes', ...(aberto ? { open: '' } : {}) },
    el(
      'summary',
      { class: 'grupo-projeto-cab' },
      el('span', { class: 'chev' }, '›'),
      el('span', { class: 'grupo-projeto-titulo' }, tituloDoProjeto(pasta)),
      el('span', { class: 'kicker grupo-projeto-arquivo' }, arquivoDoProjeto(pasta)),
      el('span', { class: 'selo-contagem' }, String(decisoes.length)),
    ),
    el('div', { class: 'lista-decisoes-tab' }, ...decisoes.map(linhaDecisaoTabela)),
  );

  const blocos = principais.map((g) => detalhesProjeto(g, true));

  if (resto.length) {
    const totalResto = resto.reduce((soma, [, d]) => soma + d.length, 0);
    blocos.push(el(
      'details',
      { class: 'grupo-projeto-decisoes' },
      el(
        'summary',
        { class: 'grupo-projeto-cab' },
        el('span', { class: 'chev' }, '›'),
        el('span', { class: 'grupo-projeto-titulo' }, `Outros ${resto.length} projetos`),
        el('span', { class: 'kicker grupo-projeto-arquivo' }, resto.map(([p, d]) => `${tituloDoProjeto(p)} ${d.length}`).join(' · ')),
        el('span', { class: 'selo-contagem' }, String(totalResto)),
      ),
      ...resto.map((g) => detalhesProjeto(g, false)),
    ));
  }

  const astargneEl = el('div', { class: 'astargne-ancora' });
  lerChaves().then(chaves => { if (astargneEl.isConnected) astargneEl.replaceChildren(painelAstargne(classificarAstargne(dadosDecisoes, chaves), chaves)); });
  abaDecisoesEl.replaceChildren(
    el(
      'div',
      { class: 'decisoes-cabecalho' },
      el(
        'div',
        {},
        el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 03 / DECISÕES'),
        el('h2', { class: 'titulo-secao' }, `${visiveis.length} decisões paradas`),
        el('p', { class: 'kicker' }, `agrupadas por projeto${maisVelhaGeral?.desde ? ` · a mais velha é de ${new Date(maisVelhaGeral.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}`),
      ),
      toggle,
    ),
    astargneEl,
    ...blocos,
  );
}
