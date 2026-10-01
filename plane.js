// Backlog vindo do Plane (instância própria no Omarchy, workspace `astargne`,
// desde 30/09/2026 — antes era o Linear, congelado em leitura por 30 dias).
// O Plane é a VERDADE do aberto de cada projeto; o painel só lê, com o token
// do usuário "painel", papel Guest: a API recusa escrita com 403 (conferido
// de fora na criação). Devolve a MESMA forma que parsearBacklog() produz para
// o markdown (features → itens → filhos, com tags), para as abas Backlog,
// Decisões e a página de projeto não precisarem saber de onde veio.
//
// Mapeamento: projeto Plane = projeto do catálogo (campo `plane` = id do
// projeto), módulo = feature, work item sem pai = item de topo, sub-work item =
// filho, label com nome de tag canônica = chip. O detalhe de uma tag
// ("BLOQUEADA: motivo") vem da descrição — a migração copiou a linha original.

const WEB = 'https://astargne-linux.tail30484d.ts.net';
const SLUG = 'astargne';
const API = `${WEB}/api/v1/workspaces/${SLUG}`;

export const TAGS_CANONICAS = ['DONO', 'EMPÍRICA', 'BLOQUEADA', 'SEM ESCOPO', 'CONGELADA', 'PÓS-PLAYTEST'];
// O motivo é limitado a 200 caracteres e só o começo da descrição é varrido:
// com `[^)]*` livre, cada "(DONO" sem fecho varria até o fim do texto —
// quadrático, 6,8 s de event loop parado com 240 mil caracteres (medido).
const RE_TAG = /\((DONO|EMPÍRICA|SEM ESCOPO|CONGELADA|BLOQUEADA|PÓS-PLAYTEST)(?![\p{L}])([^)]{0,200})\)/gu;
const VARREDURA_MAX = 4000;
const TIPO_ESTADO = { backlog: 'backlog', unstarted: 'unstarted', started: 'started', completed: 'completed', cancelled: 'canceled' };

export function criarClientePlane({ chave, fetchImpl = fetch, timeoutMs = 15_000 }) {
  return async function consultar(caminho) {
    const resposta = await fetchImpl(`${API}${caminho}`, {
      headers: { 'X-API-Key': chave },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const corpo = await resposta.json().catch(() => null);
    // Mensagem de erro sem eco da requisição: a chave vai no cabeçalho e
    // nunca pode aparecer na tela nem no log.
    if (!resposta.ok || !corpo) {
      throw new Error(`Plane recusou a consulta (HTTP ${resposta.status})`);
    }
    return corpo;
  };
}

// Lista paginada da API v1 (cursor), 100 por página.
async function todas(consultar, caminho) {
  const itens = [];
  let cursor = null;
  do {
    const sep = caminho.includes('?') ? '&' : '?';
    const pagina = await consultar(`${caminho}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    itens.push(...pagina.results);
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return itens;
}

// Busca tudo e normaliza para a forma que montarFeatures() consome. A API
// não diz o módulo de um work item: a ligação vem de module-issues, uma
// consulta por módulo (61 em 30/09/2026) — por isso o cache de 60 s.
export async function buscarWorkspace(consultar) {
  const projetosPlane = await todas(consultar, '/projects/');
  const projetos = [];
  const milestones = [];
  const issues = [];
  await Promise.all(projetosPlane.map(async (p) => {
    projetos.push({ id: p.id, name: p.name, url: `${WEB}/${SLUG}/projects/${p.id}/issues/` });
    const [wis, mods] = await Promise.all([
      todas(consultar, `/projects/${p.id}/work-items/?expand=state,labels`),
      todas(consultar, `/projects/${p.id}/modules/`),
    ]);
    const moduloDe = new Map();
    await Promise.all(mods.map(async (m) => {
      // sort_order é a ordem da tela do Plane (arrastar muda); a migração
      // gravou nele a ordem original dos planos.
      milestones.push({ id: m.id, name: m.name, sortOrder: m.sort_order ?? 0, project: { id: p.id } });
      for (const wi of await todas(consultar, `/projects/${p.id}/modules/${m.id}/module-issues/`)) moduloDe.set(wi.id, m.id);
    }));
    for (const w of wis) {
      const identificador = `${p.identifier}-${w.sequence_id}`;
      issues.push({
        id: w.id,
        identifier: identificador,
        title: w.name,
        url: `${WEB}/${SLUG}/browse/${identificador}/`,
        description: w.description_html ?? '',
        createdAt: w.created_at,
        state: { name: w.state?.name ?? '?', type: TIPO_ESTADO[w.state?.group] ?? 'backlog' },
        labels: { nodes: (w.labels ?? []).map((l) => ({ name: l.name })) },
        project: { id: p.id },
        projectMilestone: moduloDe.has(w.id) ? { id: moduloDe.get(w.id) } : null,
        parent: w.parent ? { id: w.parent } : null,
      });
    }
  }));
  return { projetos, milestones, issues };
}

function tagsDaIssue(issue) {
  const rotulos = new Set(issue.labels.nodes.map((l) => l.name));
  const detalhes = new Map();
  for (const m of (issue.description ?? '').slice(0, VARREDURA_MAX).matchAll(RE_TAG)) {
    const detalhe = m[2].replace(/^[\s:;,—–-]+/, '').trim();
    if (detalhe && !detalhes.has(m[1])) detalhes.set(m[1], detalhe);
  }
  return TAGS_CANONICAS.filter((t) => rotulos.has(t))
    .map((tag) => (detalhes.has(tag) ? { tag, detalhe: detalhes.get(tag) } : { tag }));
}

// Pura (testável sem rede): recebe o que buscarWorkspace() devolveu e o id
// de UM projeto, devolve as features no formato de parsearBacklog().
// Cancelado/duplicado não entra — não é trabalho aberto nem feito.
// Ordem dentro da feature = ordem de criação, que na migração é a ordem do
// arquivo de origem.
export function montarFeatures({ projetos, milestones: todasMilestones, issues }, idProjeto) {
  const projeto = projetos.find((p) => p.id === idProjeto);
  if (!projeto) return null;

  const doProjeto = issues
    .filter((i) => i.project?.id === idProjeto && !['canceled', 'duplicate'].includes(i.state.type))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodos = new Map(doProjeto.map((i) => [i.id, {
    tipo: 'item',
    texto: i.title,
    estado: i.state.type === 'completed' ? 'pronto' : 'aberto',
    estadoRastreador: i.state.name,
    identificador: i.identifier,
    url: i.url,
    criadoEm: i.createdAt,
    tags: tagsDaIssue(i),
    filhos: [],
    nivel: 0,
  }]));

  const SEM_MODULO = '__sem__';
  const porModulo = new Map();
  for (const i of doProjeto) {
    const nodo = nodos.get(i.id);
    const pai = i.parent && nodos.get(i.parent.id);
    if (pai) {
      pai.filhos.push(nodo);
      continue;
    }
    const chave = i.projectMilestone?.id ?? SEM_MODULO;
    if (!porModulo.has(chave)) porModulo.set(chave, []);
    porModulo.get(chave).push(nodo);
  }
  const nivelar = (lista, nivel) => lista.forEach((n) => { n.nivel = nivel; nivelar(n.filhos, nivel + 1); });

  const modulos = todasMilestones.filter((m) => m.project?.id === idProjeto).sort((a, b) => a.sortOrder - b.sortOrder);
  const features = modulos.map((m) => ({ titulo: m.name, itens: porModulo.get(m.id) ?? [] }));
  if (porModulo.has(SEM_MODULO)) features.push({ titulo: 'Sem módulo', itens: porModulo.get(SEM_MODULO) });
  for (const f of features) {
    nivelar(f.itens, 0);
    f.estado = f.itens.length && f.itens.every((n) => n.estado === 'pronto') ? 'pronto' : 'aberto';
  }
  return { nome: projeto.name, url: projeto.url, features };
}

// Cache com renovação em segundo plano: a busca completa leva ~11 s (~100
// consultas; a API do Plane roda com 1 worker — medido em 30/09/2026). Com
// dado em mãos, devolve-o na hora e renova por trás, uma renovação por vez;
// só a primeira carga depois de subir espera. Falha na renovação mantém o
// dado anterior e reaparece como erro na próxima carga sem cache.
let cache = { em: 0, dados: null };
let renovando = null;
const TTL_MS = 60_000;

export async function lerWorkspacePlane({ agora = Date.now(), consultar } = {}) {
  if (!consultar) {
    // Segredo só no .env (regra do painel); token do usuário Guest "painel".
    const chave = process.env.PLANE_API_KEY?.trim();
    if (!chave) throw new Error('sem PLANE_API_KEY no .env do painel');
    consultar = criarClientePlane({ chave });
  }
  if (cache.dados && agora - cache.em < TTL_MS) return cache.dados;
  if (!renovando) {
    renovando = buscarWorkspace(consultar)
      .then((dados) => { cache = { em: Date.now(), dados }; return dados; })
      .finally(() => { renovando = null; });
  }
  if (cache.dados) {
    renovando.catch(() => {}); // o dado velho segue valendo até a próxima renovação dar certo
    return cache.dados;
  }
  return renovando;
}

export function limparCachePlane() {
  cache = { em: 0, dados: null };
  renovando = null;
}
