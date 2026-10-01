// Núcleo compartilhado do dashboard: helpers de DOM, a grade "Visão geral",
// produção/SSH, e o roteador (views + hash). Backlog vive em backlog.js,
// página de projeto em projeto.js — carregados depois deste, mesmo padrão
// de scripts globais já usado em publico/severino/ (voz.js + chat.js).
// O bootstrap inicial (atualizarTudo + rotear a primeira vez) fica no fim de
// projeto.js, o ÚLTIMO script carregado — só ali as funções dos três
// arquivos já existem todas em escopo global.

const tiraTelemetria = document.getElementById('tira-telemetria');
const toggleTema = document.getElementById('toggle-tema');
const abrirConsoleBtn = document.getElementById('abrir-console');
const textoSync = document.getElementById('texto-sync');
const placarDecisoes = document.getElementById('placar-decisoes');
const seloDecisoes = document.getElementById('selo-decisoes');

function el(tag, atributos = {}, ...filhos) {
  const nodo = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') nodo.className = valor;
    else nodo.setAttribute(chave, valor);
  }
  nodo.append(...filhos);
  return nodo;
}

// ---------- Toggle "todas / abertas" dos filtros de tag (21/08/2026) ----------
// Pedido do dono: um chip como EMPÍRICA trazia TUDO com a tag, pronto ou
// não — "vale pra tudo". Um estado só, lido por onde quer que filtre ou
// conte por tag: aba Backlog, painel de projeto (chips/outline/decisões
// paradas), aba Decisões, placar do cabeçalho.
let modoFiltroTag = 'todos'; // 'todos' | 'aberto'

function elToggleFiltro(aoMudar) {
  const par = el('div', { class: 'par-toggle-filtro' });
  const desenhar = () => {
    par.replaceChildren(
      el('button', { type: 'button', class: `toggle-filtro${modoFiltroTag === 'todos' ? ' ativa' : ''}` }, 'todas'),
      el('button', { type: 'button', class: `toggle-filtro${modoFiltroTag === 'aberto' ? ' ativa' : ''}` }, 'abertas'),
    );
    par.children[0].addEventListener('click', () => { modoFiltroTag = 'todos'; desenhar(); atualizarPlacarCabecalho(); desenharTiraTelemetria(); aoMudar(); });
    par.children[1].addEventListener('click', () => { modoFiltroTag = 'aberto'; desenhar(); atualizarPlacarCabecalho(); desenharTiraTelemetria(); aoMudar(); });
  };
  desenhar();
  return par;
}

// Cru (fora da gramática) não tem checkbox — decisoesDoBacklog (coletores.js)
// já manda "aberto" como padrão nesse caso, nunca inventa "pronto".
function decisaoVisivel(d) {
  return modoFiltroTag === 'todos' || d.estado !== 'pronto';
}

function tempoRelativo(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

// Negrito e `código` do markdown viram elementos de verdade — nunca innerHTML,
// mesmo vindo de arquivo local: texto de dado não ganha poder de marcação.
// Usado pelo backlog (texto já sem link, o parser tira antes — coletores.js).
function formatar(texto) {
  const nos = [];
  texto.split('**').forEach((pedaco, i) => {
    const filhos = pedaco.split('`').map((s, j) => (j % 2 ? el('code', {}, s) : s));
    if (i % 2) nos.push(el('strong', {}, ...filhos));
    else nos.push(...filhos);
  });
  return nos;
}

// ---------- markdown → DOM (docs de projeto, página de projeto) ----------
// Mesma disciplina de segurança de `formatar` (nunca innerHTML), estendida
// pra cobrir o que os docs modeladores realmente usam: heading, parágrafo,
// lista, link, bloco de código cercado. Sem lib de terceiro — decisão
// consciente, mesmo estilo hand-rolled do parser do backlog (coletores.js).

const RE_INLINE_MD = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]*)\]\(([^)]*)\)/g;

function formatarInlineMd(texto) {
  const nos = [];
  let ultimo = 0;
  for (const m of texto.matchAll(RE_INLINE_MD)) {
    if (m.index > ultimo) nos.push(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) nos.push(el('strong', {}, m[1]));
    else if (m[2] !== undefined) nos.push(el('code', {}, m[2]));
    else nos.push(el('a', { href: m[4], target: '_blank', rel: 'noopener' }, m[3]));
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) nos.push(texto.slice(ultimo));
  return nos;
}

// Bloco ```mermaid``` vira <pre class="mermaid"> com o código cru (sem
// formatarInlineMd dentro — é sintaxe de diagrama, não texto) pro
// mermaid.run() processar depois de inserido no DOM; qualquer outra
// linguagem cercada vira <pre><code> normal.
function renderizarMarkdown(texto) {
  const blocos = [];
  const linhas = texto.split(/\r?\n/);
  let i = 0;
  let paragrafo = [];
  let listaAtual = null;

  function fecharParagrafo() {
    if (paragrafo.length) {
      blocos.push(el('p', {}, ...formatarInlineMd(paragrafo.join(' '))));
      paragrafo = [];
    }
  }
  function fecharLista() {
    if (listaAtual) {
      blocos.push(listaAtual.elemento);
      listaAtual = null;
    }
  }

  while (i < linhas.length) {
    const linha = linhas[i];

    const cerca = linha.match(/^```\s*(\S*)\s*$/);
    if (cerca) {
      fecharParagrafo();
      fecharLista();
      const linguagem = cerca[1] || '';
      const codigo = [];
      i++;
      while (i < linhas.length && !/^```\s*$/.test(linhas[i])) {
        codigo.push(linhas[i]);
        i++;
      }
      i++; // pula a cerca de fechamento (ou o fim do texto, se truncado)
      const conteudo = codigo.join('\n');
      blocos.push(
        linguagem === 'mermaid' ? el('pre', { class: 'mermaid' }, conteudo) : el('pre', {}, el('code', {}, conteudo)),
      );
      continue;
    }

    const heading = linha.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      fecharParagrafo();
      fecharLista();
      const tag = `h${Math.min(heading[1].length + 2, 6)}`;
      blocos.push(el(tag, {}, ...formatarInlineMd(heading[2].trim())));
      i++;
      continue;
    }

    const itemLista = linha.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (itemLista) {
      fecharParagrafo();
      const ordenada = /\d+\./.test(itemLista[1]);
      const tag = ordenada ? 'ol' : 'ul';
      if (!listaAtual || listaAtual.tag !== tag) {
        fecharLista();
        listaAtual = { tag, elemento: el(tag, {}) };
      }
      listaAtual.elemento.append(el('li', {}, ...formatarInlineMd(itemLista[2])));
      i++;
      continue;
    }

    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      i++;
      continue;
    }

    paragrafo.push(linha.trim());
    i++;
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

// ---------- Aba Projetos: tira de telemetria (Tela 3.1) ----------
// Cache das três buscas cross-referenciadas (projetos/backlog/decisões) —
// telemetria e o painel focado (projeto.js) leem daqui, sem buscar de novo.
let dadosProjetos = [];
let dadosDecisoes = [];

// Estado compartilhado entre as abas Projetos e Backlog (README, "Estado
// necessário"): o projeto em foco na tira/painel é o MESMO que a aba Backlog
// usa pro outline — Decisões e Contas não o leem. `selecionarProjeto` (mais
// abaixo, depois do roteador) é quem muda isto e redesenha as duas abas.
let projetoSelecionado = null;

function decisoesDoProjeto(pasta) {
  return dadosDecisoes.filter((d) => d.projeto === pasta);
}

// README (Tela 3.1) descreve 3 projetos "fixados" em negrito por nome — mas
// isso viraria uma lista hardcoded que destoa assim que a contagem real
// mudar. Regra equivalente e derivável do dado: projeto com decisão parada
// pesa mais que projeto limpo, sem inventar um terceiro nível de destaque.
function celulaTelemetria(p) {
  const decisoes = decisoesDoProjeto(p.pasta).filter(decisaoVisivel);
  const partes = [];
  if (decisoes.length) partes.push(`${decisoes.length} dec`);
  if (p.producao) partes.push('prod ✓');
  if (!decisoes.length) partes.push('limpo');

  const nomeCurto = NOME_CURTO[p.pasta] ?? p.titulo;
  const celula = el(
    'button',
    {
      type: 'button',
      class: `celula-telemetria${decisoes.length ? ' com-decisao' : ' limpa'}${p.pasta === projetoSelecionado ? ' selecionada' : ''}`,
      'data-pasta': p.pasta,
    },
    el('span', { class: 'tt-nome' }, nomeCurto),
    el('span', { class: 'tt-meta' }, partes.join(' · ')),
  );
  celula.addEventListener('click', () => { location.hash = `#/projeto/${encodeURIComponent(p.pasta)}`; });
  return celula;
}

// Nomes encurtados pra tira (o nome cheio vive no título do painel focado) —
// README §3.1. Projeto sem entrada aqui usa o título cheio mesmo.
const NOME_CURTO = {
  LoreEngine: 'Lore Engine',
  _oldSistemaLoreEngine: 'Lore Engine antigo',
  ProjetoConversaComDeus: 'Conversa com Deus',
  'painel-admin': 'Painel + C-3PO',
  'Mapa Khorvaire': 'Khorvaire',
  DiscordTranscriber: 'Transcriber',
  'Corre do Tarado': 'Corre do Tarado',
  'alexa youtube': 'Alexa YT Music',
  PlayerForM3UList: 'Player M3U',
  RagPTdoZero: 'Ragnarok',
};

function desenharTiraTelemetria() {
  tiraTelemetria.replaceChildren(...dadosProjetos.map(celulaTelemetria));
}

async function carregarProjetos() {
  const resposta = await fetch('/api/projetos');
  const { projetos } = await resposta.json();
  dadosProjetos = projetos;
}

// Distingue "busquei e deu zero" (real) de "não consegui buscar" (mostra
// "—", nunca confunde com zero) — placarDecisoes/seloDecisoes leem esta flag.
let decisoesDisponiveis = false;

async function carregarDecisoes() {
  try {
    const resposta = await fetch('/api/decisoes');
    if (!resposta.ok) throw new Error('rota indisponível');
    const { decisoes } = await resposta.json();
    dadosDecisoes = decisoes;
    decisoesDisponiveis = true;
  } catch {
    dadosDecisoes = [];
    decisoesDisponiveis = false;
  }
}

// ---------- Produção — astargne.com ----------
// Cache só — quem desenha é projeto.js (bloco "Produção" da coluna de
// contexto, Tela 3.2 §4), não mais uma seção fixa da aba Projetos.
let dadosProducao = [];

async function carregarProducao() {
  const resposta = await fetch('/api/producao');
  const { sondas } = await resposta.json();
  dadosProducao = sondas;
}

// ---------- Roteador: views + hash leve ----------
// #/projetos (padrão) · #/backlog · #/decisoes · #/contas · #/projeto/<pasta>. A URL é
// a única fonte de verdade de qual view está ativa — clique em aba/tira só
// muda o hash. `grafo` saiu da nav (relacoes.js/grafo.js ficam no repo,
// desconectados — decisão do dono, 21/08/2026). "Projetos" e "página de
// projeto" são a MESMA view agora (tira + painel focado sempre juntos,
// README Tela 3) — não existe mais uma `vista-projeto` separada.

const paineis = {
  projetos: document.getElementById('aba-projetos'),
  backlog: document.getElementById('aba-backlog'),
  decisoes: document.getElementById('aba-decisoes'),
  contas: document.getElementById('aba-contas'),
};

// Qual view está na tela agora. A aba Contas precisa saber se está ENTRANDO
// (aí busca no servidor, via ssh) ou se é só o rotear() de 60s passando de
// novo pela mesma view (aí não busca — sem polling de ssh, por contrato).
let viewAtual = null;

function mostrarView(nome) {
  viewAtual = nome;
  for (const [chave, painel] of Object.entries(paineis)) painel.hidden = chave !== nome;
  for (const botao of document.querySelectorAll('.aba')) botao.classList.toggle('ativa', botao.dataset.aba === nome);
}

for (const botao of document.querySelectorAll('.aba')) {
  botao.addEventListener('click', () => { location.hash = `#/${botao.dataset.aba}`; });
}

// `abrirProjeto` (painel focado, projeto.js) e `desenharBacklogDoProjeto`
// (aba Backlog, backlog.js) já existem em escopo global quando isto roda de
// fato (bootstrap no fim de projeto.js, o último script). Atualiza as DUAS
// abas que dependem do projeto em foco, mesmo a que não está visível agora
// — trocar de aba nunca deve mostrar dado de um projeto diferente do focado.
function selecionarProjeto(pasta) {
  projetoSelecionado = pasta;
  desenharTiraTelemetria();
  abrirProjeto(pasta);
  if (window.desenharBacklogDoProjeto) desenharBacklogDoProjeto(pasta);
}

function rotear() {
  if (!projetoSelecionado && dadosProjetos.length) selecionarProjeto(dadosProjetos[0].pasta);

  const [, view, param] = location.hash.slice(1).split('/');
  if (view === 'projeto' && param) {
    mostrarView('projetos');
    const pasta = decodeURIComponent(param);
    if (pasta !== projetoSelecionado) selecionarProjeto(pasta);
  } else if (view === 'backlog' || view === 'decisoes') {
    mostrarView(view);
    if (view === 'decisoes' && window.desenharDecisoes) desenharDecisoes();
  } else if (view === 'contas') {
    const entrando = viewAtual !== 'contas';
    mostrarView('contas');
    if (entrando && window.carregarContas) carregarContas();
  } else {
    mostrarView('projetos');
  }
}
window.addEventListener('hashchange', rotear);

// ---------- Tema (claro/escuro) ----------
// Padrão escuro sem atributo; script inline no <head> já aplicou "light" no
// load se era o salvo, então aqui só reflete o estado atual no rótulo.

function aplicarRotuloTema() {
  const claro = document.documentElement.getAttribute('data-tema') === 'light';
  toggleTema.textContent = claro ? 'claro' : 'escuro';
}
aplicarRotuloTema();

toggleTema.addEventListener('click', () => {
  const claro = document.documentElement.getAttribute('data-tema') === 'light';
  if (claro) {
    document.documentElement.removeAttribute('data-tema');
    localStorage.setItem('painel-tema', 'dark');
  } else {
    document.documentElement.setAttribute('data-tema', 'light');
    localStorage.setItem('painel-tema', 'light');
  }
  aplicarRotuloTema();
});

// ---------- Tela 6 — console do Severino (overlay por ⌘K) ----------
// Reaproveita severino/voz.js + severino/chat.js inteiros (markup movido
// pra dentro do #console-scrim, 21/08/2026) — só a abertura/fechamento e a
// primeira mensagem (digest ou contexto de decisão) são novos aqui.
// mandarMensagemSeverino (chat.js) injeta essa primeira mensagem sem
// duplicar a lógica de SSE/streaming.

const consoleScrim = document.getElementById('console-scrim');
const consoleKicker = document.getElementById('console-kicker');
const consoleFechar = document.getElementById('console-fechar');
const consoleChips = document.getElementById('console-chips');

function abrirConsole() {
  consoleScrim.hidden = false;
  document.getElementById('entrada')?.focus();
}

function fecharConsole() {
  consoleScrim.hidden = true;
}

function desenharChipsSugestao(sugestoes) {
  consoleChips.replaceChildren(...sugestoes.map((texto) => {
    const chip = el('button', { type: 'button', class: 'chip-sugestao' }, texto);
    chip.addEventListener('click', () => window.mandarMensagemSeverino?.(texto));
    return chip;
  }));
}

// Estado A (digest matinal) — README: "derivado do working tree, não de
// memória". Não é rota nova: manda uma mensagem normal pro /api/conversa já
// existente, com as mesmas ferramentas de sempre — o motor grounded já faz
// o trabalho, sem precisar de um endpoint de digest dedicado.
function abrirConsoleDigest() {
  consoleKicker.textContent = `digest · ${new Date().toLocaleDateString('pt-BR')} · ${dadosProjetos.length || 9} projetos do working tree`;
  desenharChipsSugestao(['as decisões mais velhas', 'o que travou mais projetos', 'gasto por projeto']);
  abrirConsole();
  window.mandarMensagemSeverino?.(
    'Bom dia — resumo rápido: o que mudou desde ontem em cada projeto (git, portas, produção), e o que está parado (decisões)? Cite dado real, não invente.',
  );
}

// Estado B (decisão carregada) — o texto entra verbatim na mensagem; o
// motor só explica e pergunta (persona só-leitura até a fase 3), nunca decide.
function abrirConsoleComDecisao(decisao) {
  consoleKicker.textContent = 'decisão parada · lida do working tree';
  desenharChipsSugestao(['o que isso trava', 'o que você precisa de mim', 'outra decisão deste projeto']);
  abrirConsole();
  const contexto = `${decisao.projeto} · ${decisao.arquivo} · ${decisao.feature} · tag ${decisao.tag}${decisao.detalhe ? ` (${decisao.detalhe})` : ''}`;
  window.mandarMensagemSeverino?.(
    `Decisão parada — ${contexto}:\n"${decisao.texto}"\n\nO que isso trava, e o que você precisa de mim pra destravar? Não decida por mim, só explique e pergunte.`,
  );
}

abrirConsoleBtn.addEventListener('click', abrirConsoleDigest);
consoleFechar.addEventListener('click', fecharConsole);
consoleScrim.addEventListener('click', (e) => { if (e.target === consoleScrim) fecharConsole(); });

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    abrirConsoleDigest(); // ⌘K sempre reabre no digest, mesmo já aberto (README)
  } else if (e.key === 'Escape' && !consoleScrim.hidden) {
    fecharConsole();
  }
});

// ---------- Placar do cabeçalho (decisões) ----------
// Lê o cache já buscado por carregarDecisoes() — "—" honesto quando a busca
// falhou, nunca confundido com zero real (decisoesDisponiveis). Respeita o
// toggle todas/abertas (modoFiltroTag) — chamada de novo sempre que ele muda.
function atualizarPlacarCabecalho() {
  const texto = decisoesDisponiveis ? String(dadosDecisoes.filter(decisaoVisivel).length) : '—';
  placarDecisoes.textContent = texto;
  seloDecisoes.textContent = texto;
}

// ---------- Indicador de sincronia ("auto · Ns") ----------
let ultimaAtualizacao = Date.now();
setInterval(() => {
  const seg = Math.round((Date.now() - ultimaAtualizacao) / 1000);
  textoSync.textContent = `auto · ${seg}s`;
}, 1000);

// ---------- Atualização geral ----------
// `carregarBacklog` mora em backlog.js — mesma lógica de escopo global do
// roteador acima: só é chamada depois que todos os scripts já carregaram.
// Automático (bootstrap + 60s, no fim de projeto.js) — sem botão manual, o
// mock não tem um ("Refresh: automático e discreto"). As quatro buscas
// primeiro, o desenho depois — a tira de telemetria cruza projetos×decisões,
// então precisa das duas prontas antes de desenhar (não dá pra desenhar
// incremental aqui sem mostrar contagem parcial errada).
async function atualizarTudo() {
  await Promise.all([carregarProjetos(), carregarProducao(), carregarBacklog(), carregarDecisoes()]);
  atualizarPlacarCabecalho();
  ultimaAtualizacao = Date.now();
  rotear(); // reflete o dado fresco na view atual (inclusive projeto selecionado)
}

if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'dark' });
