// Núcleo compartilhado do dashboard: helpers de DOM, a grade "Visão geral",
// produção/SSH, e o roteador (views + hash). Backlog vive em backlog.js,
// página de projeto em projeto.js — carregados depois deste, mesmo padrão
// de scripts globais já usado em publico/severino/ (voz.js + chat.js).
// O bootstrap inicial (atualizarTudo + rotear a primeira vez) fica no fim de
// projeto.js, o ÚLTIMO script carregado — só ali as funções dos três
// arquivos já existem todas em escopo global.

const grade = document.getElementById('grade-projetos');
const listaProducao = document.getElementById('lista-producao');
const botaoAtualizar = document.getElementById('botao-atualizar');
const botaoSsh = document.getElementById('botao-ssh');
const saidaSsh = document.getElementById('saida-ssh');
const atualizadoEm = document.getElementById('atualizado-em');

function el(tag, atributos = {}, ...filhos) {
  const nodo = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') nodo.className = valor;
    else nodo.setAttribute(chave, valor);
  }
  nodo.append(...filhos);
  return nodo;
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

// ---------- Visão geral: grade de projetos ----------

// Cache do último /api/projetos — a página de projeto reaproveita em vez de
// buscar de novo (mesmos dados, só filtrados pela pasta).
let dadosProjetos = [];

function cartaoProjeto(p) {
  const etiquetas = [];

  if (p.git.repositorio) {
    etiquetas.push(el('span', { class: 'etiqueta' }, `⎇ ${p.git.branch}`));
    etiquetas.push(
      p.git.arquivosSujos > 0
        ? el('span', { class: 'etiqueta alerta' }, `${p.git.arquivosSujos} não commitado(s)`)
        : el('span', { class: 'etiqueta ok' }, 'limpo'),
    );
  } else if (p.existe) {
    etiquetas.push(el('span', { class: 'etiqueta falha' }, 'sem git'));
  }

  for (const porta of p.portas) {
    etiquetas.push(
      el(
        'span',
        { class: `etiqueta ${porta.ativa ? 'ok' : ''}`, title: porta.servico },
        `${porta.ativa ? '●' : '○'} :${porta.porta}`,
      ),
    );
  }

  const linhas = [
    el('h3', {}, p.titulo),
    el('p', { class: 'descricao' }, p.descricao),
    el('div', { class: 'stack' }, p.stack),
  ];

  if (p.git.repositorio) {
    linhas.push(
      el(
        'div',
        { class: 'git-linha', title: p.git.ultimoCommit.assunto },
        `último commit ${tempoRelativo(p.git.ultimoCommit.data)} — ${p.git.ultimoCommit.assunto}`,
      ),
    );
  }
  if (!p.existe) linhas.push(el('div', { class: 'git-linha' }, 'pasta não sincronizada nesta máquina'));

  linhas.push(el('div', { class: 'etiquetas' }, ...etiquetas));

  // Clicável: abre a página de projeto (§9 do plano) — a URL é quem decide
  // a view, o clique só muda o hash (rotear cuida do resto).
  const cartao = el('div', { class: `cartao${p.existe ? '' : ' inexistente'}`, tabindex: '0', role: 'button' }, ...linhas);
  const abrir = () => { location.hash = `#/projeto/${encodeURIComponent(p.pasta)}`; };
  cartao.addEventListener('click', abrir);
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
  });
  return cartao;
}

async function carregarProjetos() {
  const resposta = await fetch('/api/projetos');
  const { projetos } = await resposta.json();
  dadosProjetos = projetos;
  grade.replaceChildren(...projetos.map(cartaoProjeto));
}

// ---------- Produção — astargne.com ----------

function linhaSonda(s) {
  const detalhe = s.ok ? `HTTP ${s.status} · ${s.ms} ms` : (s.erro ?? `HTTP ${s.status}`);
  return el(
    'div',
    { class: 'sonda' },
    el('span', { class: `luz ${s.ok ? 'ok' : 'falha'}` }),
    el('span', {}, s.rotulo, ' — '),
    el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.url),
    el('span', { class: 'detalhe' }, detalhe),
  );
}

async function carregarProducao() {
  const resposta = await fetch('/api/producao');
  const { sondas } = await resposta.json();
  listaProducao.replaceChildren(...sondas.map(linhaSonda));
}

// ---------- Roteador: views + hash leve ----------
// #/geral (padrão) · #/backlog · #/projeto/<pasta>. A URL é a única fonte de
// verdade de qual view está ativa — clique em card/aba só muda o hash.

const paineis = {
  geral: document.getElementById('aba-geral'),
  backlog: document.getElementById('aba-backlog'),
  projeto: document.getElementById('vista-projeto'),
};

function mostrarView(nome) {
  for (const [chave, painel] of Object.entries(paineis)) painel.hidden = chave !== nome;
  for (const botao of document.querySelectorAll('.aba')) botao.classList.toggle('ativa', botao.dataset.aba === nome);
}

for (const botao of document.querySelectorAll('.aba')) {
  botao.addEventListener('click', () => { location.hash = `#/${botao.dataset.aba}`; });
}

// `abrirProjeto` mora em projeto.js, mas já existe em escopo global quando
// `rotear` de fato roda (bootstrap no fim de projeto.js, o último script).
function rotear() {
  const [, view, param] = location.hash.slice(1).split('/');
  if (view === 'projeto' && param) {
    mostrarView('projeto');
    abrirProjeto(decodeURIComponent(param));
  } else {
    mostrarView(view === 'backlog' ? 'backlog' : 'geral');
  }
}
window.addEventListener('hashchange', rotear);

// ---------- Atualização geral ----------
// `carregarBacklog` mora em backlog.js — mesma lógica de escopo global do
// roteador acima: só é chamada depois que todos os scripts já carregaram.

async function atualizarTudo() {
  botaoAtualizar.disabled = true;
  try {
    await Promise.all([carregarProjetos(), carregarProducao(), carregarBacklog()]);
    atualizadoEm.textContent = `atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
    rotear(); // reflete o dado fresco na view atual (inclusive projeto aberto)
  } finally {
    botaoAtualizar.disabled = false;
  }
}

botaoAtualizar.addEventListener('click', atualizarTudo);

botaoSsh.addEventListener('click', async () => {
  botaoSsh.disabled = true;
  saidaSsh.hidden = false;
  saidaSsh.textContent = 'Consultando linuxuser@astargne.com…';
  try {
    const resposta = await fetch('/api/producao/ssh');
    const resultado = await resposta.json();
    saidaSsh.textContent = resultado.ok ? resultado.saida : `Falhou: ${resultado.erro}`;
  } catch (erro) {
    saidaSsh.textContent = `Falhou: ${erro.message}`;
  } finally {
    botaoSsh.disabled = false;
  }
});

if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'dark' });
