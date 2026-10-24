// Aba Decisões (Tela 5 do reskin "Industry HUD", 21/08/2026) — todas as
// decisões paradas do painel, agrupadas por projeto. Reaproveita
// `dadosDecisoes`/`dadosProjetos` (app.js) e `formatar`/`idadeCurta`
// (projeto.js) — nada buscado aqui, é só apresentação sobre o cache.

const abaDecisoesEl = document.getElementById('aba-decisoes');

function tituloDoProjeto(pasta) {
  return dadosProjetos.find((p) => p.pasta === pasta)?.titulo ?? pasta;
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
function desenharDecisoes() {
  if (!decisoesDisponiveis) {
    abaDecisoesEl.replaceChildren(el('p', { class: 'discreto' }, 'não consegui carregar as decisões agora.'));
    return;
  }
  // Toggle todas/abertas (app.js) filtra ANTES de agrupar/contar — grupo,
  // contagem e "mais velha" refletem só o que está visível no modo atual.
  const visiveis = dadosDecisoes.filter(decisaoVisivel);
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
    ...blocos,
  );
}
