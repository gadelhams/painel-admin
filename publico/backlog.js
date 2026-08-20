// Aba Backlog (fase 1, só-leitura). O markdown de cada projeto é a VERDADE;
// este quadro é projeção. Nada aqui guarda estado: todo número na tela é
// derivado do JSON no momento de desenhar. Redesenho de 20/08/2026: item com
// filhos vira card expansível (<details>/<summary> nativo, sem JS de
// estado); folha continua linha simples. "Card por story" sem depender do
// `nivel` bater com épico/story/task — nem sempre bate nos arquivos reais.

const quadroBacklog = document.getElementById('quadro-backlog');
const filtroTags = document.getElementById('filtro-tags');
const filtroProjetos = document.getElementById('filtro-projetos');

let dadosBacklog = null;
let tagAtiva = null;
// Filtro de projeto (pedido do dono, 16/08/2026): client-side como o de tag;
// null = todos. Guarda a PASTA (chave estável do catálogo), não o título.
let projetoAtivo = null;

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

// Esquema de cores por tag (redesenho 20/08/2026): cada tag canônica do
// PADROES-BACKLOG.md ganha uma cor distinta, reaproveitando os tokens já
// existentes — só SEM ESCOPO ("brainstorm registrado") ganha token novo
// (--ideia), porque é conceitualmente diferente das outras (não é estado
// operacional, é ideia ainda não comprometida) e a mesma cor reaparece na
// seção "Brainstorm" da página de projeto (projeto.js).
const TAG_CLASSE = {
  DONO: 'tag-dono',
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

function conteudoNodo(nodo) {
  const partes = [];
  if (nodo.tipo === 'item') {
    partes.push(el('span', { class: `marca ${nodo.estado}` }, nodo.estado === 'pronto' ? '☑' : '☐'));
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

function nosComTag(nodos, tag, achados = []) {
  for (const nodo of nodos) {
    if (nodo.tags.some((t) => t.tag === tag)) achados.push(nodo);
    nosComTag(nodo.filhos ?? [], tag, achados);
  }
  return achados;
}

function colunaFeature(f, projeto) {
  // Com filtro ativo a coluna mostra SÓ as linhas com a tag (aceite 3 da
  // spec) — a linha é a unidade, filho não vem de carona.
  let corpo;
  if (tagAtiva) {
    const achados = nosComTag(f.itens, tagAtiva);
    if (!achados.length) return null;
    corpo = achados.map((nodo) => desenharNodo(nodo, false));
  } else {
    corpo = f.itens.map((nodo) => desenharNodo(nodo));
  }
  const p = placar(f.itens);
  return el(
    'div',
    { class: 'coluna' },
    // Subtítulo discreto com o projeto dono (pedido do dono, 16/08/2026):
    // com vários projetos no quadro, a coluna rolada para longe do cabeçalho
    // do bloco precisa se identificar sozinha.
    el('div', { class: 'coluna-projeto' }, projeto.titulo),
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
  if (pr.estado !== 'ok') {
    // Estado nomeado NA TELA (aceite 4), com o nome CERTO para a causa:
    // sem_arquivo = não existe no disco; erro_leitura = existe (ou não deu
    // para saber), mas a leitura falhou — a tela não mente a causa.
    const mensagem = pr.estado === 'sem_arquivo'
      ? `sem arquivo — ${pr.pasta}/${pr.backlog} não existe no disco`
      : `falha ao ler ${pr.pasta}/${pr.backlog} — ${pr.erro ?? pr.estado}`;
    return el(
      'div',
      { class: 'backlog-projeto' },
      cabecalho,
      el(
        'div',
        { class: 'sonda' },
        el('span', { class: 'luz falha' }),
        el('span', {}, mensagem),
      ),
    );
  }
  const colunas = pr.features.map((f) => colunaFeature(f, pr)).filter(Boolean);
  if (tagAtiva && !colunas.length) return null;
  return el('div', { class: 'backlog-projeto' }, cabecalho, el('div', { class: 'quadro' }, ...colunas));
}

// Os dois filtros compõem: o de projeto decide QUAIS blocos entram, o de tag
// decide quais linhas dentro deles. Tudo derivado do JSON na hora de desenhar.
function projetosVisiveis() {
  return dadosBacklog.projetos.filter((pr) => !projetoAtivo || pr.pasta === projetoAtivo);
}

function contarTags(nodos, contagem) {
  for (const nodo of nodos) {
    for (const t of nodo.tags) contagem.set(t.tag, (contagem.get(t.tag) ?? 0) + 1);
    contarTags(nodo.filhos ?? [], contagem);
  }
}

// Chips de projeto no mesmo padrão visual do filtro de tag; "todos" por
// padrão. Um chip por projeto COM backlog no catálogo — inclusive os em
// sem_arquivo/erro_leitura, para o filtro nunca esconder um estado de falha.
function desenharFiltroProjetos() {
  const botoes = [
    el('button', { class: `filtro${projetoAtivo ? '' : ' ativa'}`, type: 'button', 'data-pasta': '' }, 'todos'),
    ...dadosBacklog.projetos.map((pr) =>
      el(
        'button',
        { class: `filtro${projetoAtivo === pr.pasta ? ' ativa' : ''}`, type: 'button', 'data-pasta': pr.pasta },
        pr.titulo,
      ),
    ),
  ];
  for (const b of botoes) {
    b.addEventListener('click', () => {
      projetoAtivo = b.dataset.pasta || null;
      desenharBacklog();
    });
  }
  filtroProjetos.replaceChildren(...botoes);
}

function desenharFiltro() {
  const contagem = new Map();
  // As contagens de tag seguem o filtro de projeto: com um projeto ativo, o
  // chip diz quantas linhas a tag tem NAQUELE recorte, não no total.
  for (const pr of projetosVisiveis()) {
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
  desenharFiltroProjetos();
  desenharFiltro();
  const blocos = projetosVisiveis().map(blocoProjeto).filter(Boolean);
  quadroBacklog.replaceChildren(
    ...(blocos.length
      ? blocos
      : [el('p', { class: 'discreto' }, tagAtiva
          ? `nenhuma linha com (${tagAtiva})${projetoAtivo ? ` em ${projetoAtivo}` : ''}`
          : 'nenhum projeto do catálogo tem o campo backlog')]),
  );
}

async function carregarBacklog() {
  const resposta = await fetch('/api/backlog');
  dadosBacklog = await resposta.json();
  desenharBacklog();
}
