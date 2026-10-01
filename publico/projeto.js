// Painel do projeto focado (Tela 3.2 do reskin "Industry HUD", 21/08/2026) —
// substitui a antiga "página de projeto" separada: agora é a metade de baixo
// da aba Projetos, ao lado da tira de telemetria (app.js). Reaproveita
// `dadosProjetos`/`dadosDecisoes`/`dadosProducao` (app.js) e
// `dadosBacklog`/`outlineFeatureDetalhes`/`placar` (backlog.js) — só os docs
// e o git detalhado deste projeto são buscados aqui, sob demanda.

const painelPrincipal = document.getElementById('painel-projeto-principal');
const painelContexto = document.getElementById('painel-projeto-contexto');

const PROJETOS_COM_DIAGRAMA = new Set(['_oldSistemaLoreEngine', 'Mapa Khorvaire', 'DiscordTranscriber']);

// ---------- coluna principal ----------

// Filtro local ao painel de projeto (21/08/2026, pedido do dono — os chips
// de resumo do cabeçalho viraram clicáveis, mesmo padrão da aba Backlog).
// `selecionarProjeto` (app.js) zera isto ao trocar de projeto de verdade —
// nunca herda o filtro de um projeto pro outro em silêncio.
let tagAtivaProjeto = null;

// Toggle todas/abertas (app.js) muda o que entra na contagem, não só o que
// o clique no chip filtra depois — por isso filtra `decisoes` antes de
// contar, não só na hora de desenhar o outline.
function chipsResumoDecisoes(decisoes) {
  const visiveis = decisoes.filter(decisaoVisivel);
  const contagem = new Map();
  for (const d of visiveis) contagem.set(d.tag, (contagem.get(d.tag) ?? 0) + 1);
  // DONO primeiro e destacado — mesma régua da aba Backlog: é a fila pessoal do dono.
  const ordem = [...contagem.keys()].sort((a, b) => (a === 'DONO' ? -1 : b === 'DONO' ? 1 : a.localeCompare(b)));
  return ordem.map((tag) => {
    const chip = el(
      'span',
      {
        class: `chip-resumo${tag === 'DONO' ? ' hot' : ''}${tagAtivaProjeto === tag ? ' ativa' : ''}`,
        role: 'button',
        tabindex: '0',
      },
      `${tag} ${contagem.get(tag)}`,
    );
    const alternar = () => {
      tagAtivaProjeto = tagAtivaProjeto === tag ? null : tag; // clicar de novo limpa o filtro
      renderizarColunaPrincipal();
    };
    chip.addEventListener('click', alternar);
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') alternar(); });
    return chip;
  });
}

function secaoCabecalhoProjeto(projeto, prBacklog, decisoes) {
  const portas = projeto.portas.length ? ` · ${projeto.portas.map((p) => `:${p.porta}`).join(' ')}` : '';
  return el(
    'div',
    { class: 'cabecalho-projeto' },
    el(
      'div',
      { class: 'cabecalho-projeto-texto' },
      el('p', { class: 'kicker' }, prBacklog?.backlog ? `${projeto.pasta} · ${prBacklog.backlog}` : projeto.pasta),
      el('h1', { class: 'titulo-projeto' }, projeto.titulo),
      el('p', { class: 'sub-projeto' }, `${projeto.stack}${portas}`),
    ),
    el(
      'div',
      { class: 'linha-chips-resumo' },
      el('div', { class: 'chips-resumo' }, ...chipsResumoDecisoes(decisoes)),
      elToggleFiltro(() => { renderizarColunaPrincipal(); renderizarColunaContexto(); }),
    ),
  );
}

function secaoOutlineBacklog(prBacklog, tagAtiva) {
  if (!prBacklog) return el('p', { class: 'discreto' }, 'este projeto não tem o campo backlog no catálogo.');
  if (prBacklog.estado !== 'ok') {
    const mensagem = mensagemFalhaBacklog(prBacklog);
    return el('div', { class: 'sonda' }, el('span', { class: 'luz falha' }), el('span', {}, mensagem));
  }
  if (!prBacklog.features.length) return el('p', { class: 'discreto' }, 'backlog sem features ainda.');
  const features = tagAtiva
    ? prBacklog.features.filter((f) => nosComTag(f.itens, tagAtiva).length)
    : prBacklog.features;
  if (tagAtiva && !features.length) return el('p', { class: 'discreto' }, `nenhuma feature com (${tagAtiva}) neste projeto.`);
  return el(
    'div',
    { class: 'outline-backlog' },
    ...features.map((f, i) => outlineFeatureDetalhes(f, i === 0, tagAtiva)),
  );
}

// ---------- coluna de contexto (420px) ----------

// Bloco ```mermaid``` já vira <pre class="mermaid"> dentro de
// renderizarMarkdown (app.js) — reaproveita em vez de re-parsear.
function extrairPrimeiroMermaid(conteudoMd) {
  return renderizarMarkdown(conteudoMd).find((b) => b.tagName === 'PRE' && b.className === 'mermaid') ?? null;
}

function secaoArquitetura(projeto, docs) {
  const arquivo = PROJETOS_COM_DIAGRAMA.has(projeto.pasta)
    ? docs?.curados?.arquitetura?.find((a) => !a.erro)
    : null;
  const mermaidEl = arquivo ? extrairPrimeiroMermaid(arquivo.conteudo) : null;

  const moldura = el(
    'div',
    { class: 'moldura moldura-arquitetura' },
    el('i', { class: 'canto tl' }), el('i', { class: 'canto tr' }), el('i', { class: 'canto bl' }), el('i', { class: 'canto br' }),
    mermaidEl ?? el('span', { class: 'selo-arquitetura' }, arquivo ? arquivo.caminho : 'sem diagrama ainda'),
  );

  const linkProsa = el('a', { href: '#', class: 'link-prosa' }, 'prosa dos docs →');
  const listaModeladores = el('div', { class: 'lista-modeladores', hidden: '' });
  linkProsa.addEventListener('click', (e) => {
    e.preventDefault();
    listaModeladores.hidden = !listaModeladores.hidden;
    if (!listaModeladores.hidden && !listaModeladores.dataset.montado) {
      listaModeladores.dataset.montado = '1';
      listaModeladores.replaceChildren(secaoModeladores(projeto.pasta, docs?.modeladores ?? []));
    }
  });

  return el(
    'div',
    { class: 'bloco-contexto' },
    el('p', { class: 'rotulo-bloco' }, 'Arquitetura'),
    moldura,
    linkProsa,
    listaModeladores,
  );
}

// Lista de modeladores (CLAUDE.md/AGENTS.md/README.md/docs/*.md): clicável,
// busca o conteúdo sob demanda (?arquivo=) — o LoreEngine sozinho tem 53
// arquivos em docs/, nunca baixa tudo de cara.
function secaoModeladores(pasta, modeladores) {
  if (!modeladores.length) return el('p', { class: 'discreto' }, 'nenhum documento modelador (.md) visível.');
  const linhas = modeladores.map((caminho) => {
    const botao = el('button', { class: 'link-doc', type: 'button' }, caminho);
    const corpo = el('div', { class: 'doc-conteudo', hidden: '' });
    botao.addEventListener('click', async () => {
      if (!corpo.hidden) { corpo.hidden = true; return; }
      corpo.hidden = false;
      if (corpo.dataset.carregado) return; // já buscado antes neste view: não busca de novo
      corpo.replaceChildren(el('p', { class: 'discreto' }, 'Carregando…'));
      const resposta = await fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs?arquivo=${encodeURIComponent(caminho)}`);
      const dados = await resposta.json();
      corpo.dataset.carregado = '1';
      corpo.replaceChildren(dados.erro
        ? el('p', { class: 'discreto' }, dados.erro)
        : el('div', {}, ...renderizarMarkdown(dados.conteudo)));
      if (window.mermaid) mermaid.run();
    });
    return el('div', { class: 'doc-item' }, botao, corpo);
  });
  return el('div', { class: 'doc-lista' }, ...linhas);
}

function idadeCurta(iso) {
  if (!iso) return '—';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? 'hoje' : `${dias}d`;
}

// `abrirConsoleComDecisao` mora em app.js (Tela 6 — console overlay) — já
// existe em escopo global quando isto é chamado de fato (clique do usuário,
// bem depois do bootstrap).
function linhaDecisao(decisao, ehMaisVelha) {
  const classeCor = ['CONGELADA', 'SEM ESCOPO'].includes(decisao.tag) ? 'faint' : ehMaisVelha ? 'hot' : 'dim';
  const linha = el(
    'div',
    { class: `linha-decisao ${classeCor}`, tabindex: '0', role: 'button', title: decisao.texto },
    el('span', { class: 'idade-decisao' }, idadeCurta(decisao.desde)),
    el('span', { class: 'texto-decisao' }, ...formatar(decisao.texto)),
  );
  const abrir = () => abrirConsoleComDecisao(decisao);
  linha.addEventListener('click', abrir);
  linha.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  return linha;
}

function secaoDecisoesParadas(pasta) {
  const decisoes = decisoesDoProjeto(pasta)
    .filter(decisaoVisivel)
    // Mais velha primeiro; sem data (git não achou a linha) vai pro fim —
    // nunca finge que uma decisão sem histórico é recente.
    .sort((a, b) => {
      if (a.desde === null) return 1;
      if (b.desde === null) return -1;
      return new Date(a.desde) - new Date(b.desde);
    });
  const maisVelhaId = decisoes[0]?.id;
  return el(
    'div',
    { class: 'bloco-contexto' },
    el(
      'div',
      { class: 'rotulo-bloco-linha' },
      el('p', { class: 'rotulo-bloco' }, 'Decisões paradas'),
      el('span', { class: 'contagem-bloco' }, `${decisoes.length} neste projeto`),
    ),
    decisoes.length
      ? el('div', { class: 'lista-decisoes' }, ...decisoes.map((d) => linhaDecisao(d, d.id === maisVelhaId)))
      : el('p', { class: 'discreto' }, 'nenhuma.'),
  );
}

// Não existe sistema de jobs no painel (fase 3, "ações com portão", nem
// começou) — estado vazio honesto em vez de fabricar linha de fila
// (PADROES-GERAIS.md #8, mesma régua do gasto "—" no cabeçalho).
function secaoFilaDeJobs() {
  return el(
    'div',
    { class: 'bloco-contexto' },
    el('p', { class: 'rotulo-bloco' }, 'Fila de jobs'),
    el('p', { class: 'discreto' }, 'sem sistema de jobs ainda — fase 3 (ações com portão) não existe.'),
  );
}

// Sondas são do host inteiro (astargne.com), não só deste projeto — mesmo
// dado de sempre (/api/producao), só reposicionado pra coluna de contexto.
function secaoProducaoContexto() {
  const botao = el('button', { type: 'button', class: 'botao-ssh-ctx' }, 'consultar SSH (leitura)');
  const saida = el('pre', { class: 'saida-ssh-ctx', hidden: '' });
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    saida.hidden = false;
    saida.textContent = 'Consultando linuxuser@astargne.com…';
    try {
      const resposta = await fetch('/api/producao/ssh');
      const resultado = await resposta.json();
      saida.textContent = resultado.ok ? resultado.saida : `Falhou: ${resultado.erro}`;
    } catch (erro) {
      saida.textContent = `Falhou: ${erro.message}`;
    } finally {
      botao.disabled = false;
    }
  });
  return el(
    'div',
    { class: 'bloco-contexto' },
    el('p', { class: 'rotulo-bloco' }, 'Produção · astargne.com'),
    ...dadosProducao.map((s) => el(
      'div',
      { class: 'linha-sonda-ctx' },
      el('span', {}, s.rotulo),
      el('span', { class: s.ok ? 'hot' : 'faint' }, s.ok ? `${s.status} · ${s.ms}ms` : (s.erro ?? `HTTP ${s.status}`)),
    )),
    botao,
    saida,
  );
}

// ---------- montagem ----------

// Cache do último projeto aberto — o clique num chip de tag (acima) só
// precisa re-desenhar a coluna principal, sem refazer o lookup nem esperar
// os docs de novo.
let projetoAtual = null;
let prBacklogAtual = null;
let decisoesAtual = null;
let docsAtual = null; // null = ainda buscando; cacheado pra o toggle todas/abertas não refazer o fetch

function renderizarColunaPrincipal() {
  painelPrincipal.replaceChildren(
    secaoCabecalhoProjeto(projetoAtual, prBacklogAtual, decisoesAtual),
    secaoOutlineBacklog(prBacklogAtual, tagAtivaProjeto),
  );
}

function renderizarColunaContexto() {
  painelContexto.replaceChildren(
    docsAtual
      ? secaoArquitetura(projetoAtual, docsAtual)
      : el('div', { class: 'bloco-contexto' }, el('p', { class: 'rotulo-bloco' }, 'Arquitetura'), el('p', { class: 'discreto' }, 'carregando…')),
    secaoDecisoesParadas(projetoAtual.pasta),
    secaoFilaDeJobs(),
    secaoProducaoContexto(),
  );
  if (docsAtual && window.mermaid) mermaid.run();
}

async function abrirProjeto(pasta) {
  // Chamada só em troca DE VERDADE de projeto (selecionarProjeto, app.js) —
  // o próprio clique de filtro re-desenha via renderizarColunaPrincipal()/
  // renderizarColunaContexto(), não volta aqui. Seguro zerar sem guarda.
  tagAtivaProjeto = null;
  docsAtual = null;

  const projeto = dadosProjetos.find((p) => p.pasta === pasta);
  if (!projeto) {
    painelPrincipal.replaceChildren(el('p', { class: 'discreto' }, `Projeto "${pasta}" não encontrado no catálogo.`));
    painelContexto.replaceChildren();
    return;
  }

  projetoAtual = projeto;
  prBacklogAtual = dadosBacklog?.projetos.find((p) => p.pasta === pasta);
  decisoesAtual = decisoesDoProjeto(pasta);

  // Cabeçalho + outline aparecem na hora com o que já está em cache; docs
  // (mais lentos, sob demanda) chegam depois e só atualizam a Arquitetura.
  renderizarColunaPrincipal();
  renderizarColunaContexto();

  const docs = await fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs`).then((r) => r.json())
    .catch(() => ({ erro: 'falha ao buscar a documentação do projeto' }));

  // Se o dono já trocou de projeto enquanto isto buscava, não pisa no painel novo.
  if (projetoSelecionado !== pasta) return;
  docsAtual = docs;
  renderizarColunaContexto();
}

// Bootstrap inicial: só aqui, no fim do ÚLTIMO script carregado, é seguro
// chamar atualizarTudo/rotear — as funções dos três arquivos já existem
// todas em escopo global neste ponto.
atualizarTudo();
setInterval(atualizarTudo, 60_000);
