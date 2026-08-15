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
  return el('div', { class: `cartao${p.existe ? '' : ' inexistente'}` }, ...linhas);
}

async function carregarProjetos() {
  const resposta = await fetch('/api/projetos');
  const { projetos } = await resposta.json();
  grade.replaceChildren(...projetos.map(cartaoProjeto));
}

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

// ---------- aba Backlog (fase 1, só-leitura) ----------
// O markdown de cada projeto é a VERDADE; este quadro é projeção. Nada aqui
// guarda estado: todo número na tela é derivado do JSON no momento de desenhar.

const quadroBacklog = document.getElementById('quadro-backlog');
const filtroTags = document.getElementById('filtro-tags');
const paineisAbas = {
  geral: document.getElementById('aba-geral'),
  backlog: document.getElementById('aba-backlog'),
};

let dadosBacklog = null;
let tagAtiva = null;

for (const botao of document.querySelectorAll('.aba')) {
  botao.addEventListener('click', () => {
    for (const b of document.querySelectorAll('.aba')) b.classList.toggle('ativa', b === botao);
    for (const [nome, painel] of Object.entries(paineisAbas)) painel.hidden = nome !== botao.dataset.aba;
  });
}

// Negrito e `código` do markdown viram elementos de verdade — nunca innerHTML,
// mesmo vindo de arquivo local: texto de dado não ganha poder de marcação.
function formatar(texto) {
  const nos = [];
  texto.split('**').forEach((pedaco, i) => {
    const filhos = pedaco.split('`').map((s, j) => (j % 2 ? el('code', {}, s) : s));
    if (i % 2) nos.push(el('strong', {}, ...filhos));
    else nos.push(...filhos);
  });
  return nos;
}

// Placar n/m SEMPRE derivado aqui, na hora de desenhar — contagem armazenada
// viraria segunda fonte de verdade (regra do docs/02_ABA_BACKLOG.md).
function placar(nodos) {
  let total = 0;
  let prontos = 0;
  for (const nodo of nodos) {
    if (nodo.tipo !== 'item') continue;
    total += 1;
    if (nodo.estado === 'pronto') prontos += 1;
    const sub = placar(nodo.filhos);
    total += sub.total;
    prontos += sub.prontos;
  }
  return { total, prontos };
}

function chipTag({ tag, detalhe }) {
  return el(
    'span',
    { class: `etiqueta tag${tag === 'DONO' ? ' tag-dono' : ''}`, ...(detalhe ? { title: detalhe } : {}) },
    tag,
  );
}

// Linha que o parser não entendeu chega crua e é mostrada crua — o quadro
// não esconde o que não entendeu.
function nodoCru(nodo) {
  return el('div', { class: 'cru' }, ...formatar(nodo.texto), ...nodo.tags.map(chipTag));
}

function nodoItem(nodo, comFilhos = true) {
  const linha = el(
    'div',
    { class: 'item-linha' },
    el('span', { class: `marca ${nodo.estado}` }, nodo.estado === 'pronto' ? '☑' : '☐'),
    el('span', { class: 'item-texto' }, ...formatar(nodo.texto)),
  );
  const p = placar(nodo.filhos);
  if (p.total) linha.append(el('span', { class: 'placar' }, `${p.prontos}/${p.total}`));
  linha.append(...nodo.tags.map(chipTag));
  return el(
    'div',
    { class: `item ${nodo.estado}` },
    linha,
    ...(comFilhos ? nodo.filhos.map(desenharNodo) : []),
  );
}

function desenharNodo(nodo) {
  return nodo.tipo === 'item' ? nodoItem(nodo) : nodoCru(nodo);
}

function nosComTag(nodos, tag, achados = []) {
  for (const nodo of nodos) {
    if (nodo.tags.some((t) => t.tag === tag)) achados.push(nodo);
    if (nodo.tipo === 'item') nosComTag(nodo.filhos, tag, achados);
  }
  return achados;
}

function colunaFeature(f) {
  // Com filtro ativo a coluna mostra SÓ as linhas com a tag (aceite 3 da
  // spec) — a linha é a unidade, filho não vem de carona.
  let corpo;
  if (tagAtiva) {
    const achados = nosComTag(f.itens, tagAtiva);
    if (!achados.length) return null;
    corpo = achados.map((nodo) => (nodo.tipo === 'item' ? nodoItem(nodo, false) : nodoCru(nodo)));
  } else {
    corpo = f.itens.map(desenharNodo);
  }
  const p = placar(f.itens);
  return el(
    'div',
    { class: 'coluna' },
    el(
      'div',
      { class: 'coluna-cab' },
      el('h4', {}, ...formatar(f.titulo)),
      el('span', { class: `etiqueta ${f.estado === 'pronto' ? 'ok' : ''}` }, f.estado === 'pronto' ? 'pronta' : 'aberta'),
      el('span', { class: 'placar' }, `${p.prontos}/${p.total}`),
    ),
    ...corpo,
  );
}

function blocoProjeto(pr) {
  const cabecalho = el(
    'div',
    { class: 'backlog-projeto-cab' },
    el('h3', {}, pr.titulo),
    el('span', { class: 'discreto' }, `${pr.pasta}/${pr.backlog}`),
  );
  if (pr.estado === 'sem_arquivo') {
    // Estado nomeado NA TELA (aceite 4): arquivo ausente nunca é quadro vazio mudo.
    return el(
      'div',
      { class: 'backlog-projeto' },
      cabecalho,
      el(
        'div',
        { class: 'sonda' },
        el('span', { class: 'luz falha' }),
        el('span', {}, `sem arquivo — ${pr.pasta}/${pr.backlog} não existe no disco`),
      ),
    );
  }
  const colunas = pr.features.map(colunaFeature).filter(Boolean);
  if (tagAtiva && !colunas.length) return null;
  return el('div', { class: 'backlog-projeto' }, cabecalho, el('div', { class: 'quadro' }, ...colunas));
}

function contarTags(nodos, contagem) {
  for (const nodo of nodos) {
    for (const t of nodo.tags) contagem.set(t.tag, (contagem.get(t.tag) ?? 0) + 1);
    if (nodo.tipo === 'item') contarTags(nodo.filhos, contagem);
  }
}

function desenharFiltro() {
  const contagem = new Map();
  for (const pr of dadosBacklog.projetos) {
    if (pr.estado === 'ok') for (const f of pr.features) contarTags(f.itens, contagem);
  }
  // DONO primeiro: a fila pessoal do dono é o motivo desta aba existir.
  const ordem = [...contagem.keys()].sort((a, b) =>
    a === 'DONO' ? -1 : b === 'DONO' ? 1 : a.localeCompare(b),
  );
  const botoes = [
    el('button', { class: `filtro${tagAtiva ? '' : ' ativa'}`, type: 'button', 'data-tag': '' }, 'todas'),
    ...ordem.map((tag) =>
      el(
        'button',
        {
          class: `filtro${tag === 'DONO' ? ' filtro-dono' : ''}${tagAtiva === tag ? ' ativa' : ''}`,
          type: 'button',
          'data-tag': tag,
        },
        `${tag} · ${contagem.get(tag)}`,
      ),
    ),
  ];
  for (const b of botoes) {
    b.addEventListener('click', () => {
      tagAtiva = b.dataset.tag || null;
      desenharBacklog();
    });
  }
  filtroTags.replaceChildren(...botoes);
}

function desenharBacklog() {
  if (!dadosBacklog) return;
  desenharFiltro();
  const blocos = dadosBacklog.projetos.map(blocoProjeto).filter(Boolean);
  quadroBacklog.replaceChildren(
    ...(blocos.length
      ? blocos
      : [el('p', { class: 'discreto' }, tagAtiva
          ? `nenhuma linha com (${tagAtiva})`
          : 'nenhum projeto do catálogo tem o campo backlog')]),
  );
}

async function carregarBacklog() {
  const resposta = await fetch('/api/backlog');
  dadosBacklog = await resposta.json();
  desenharBacklog();
}

async function atualizarTudo() {
  botaoAtualizar.disabled = true;
  try {
    await Promise.all([carregarProjetos(), carregarProducao(), carregarBacklog()]);
    atualizadoEm.textContent = `atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
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

atualizarTudo();
setInterval(atualizarTudo, 60_000);
