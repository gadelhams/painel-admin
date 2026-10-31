// Cliente e cache do Plane. A chave vai no cabeçalho e nunca volta na mensagem de erro.

const WEB = 'https://plane.vpn.astargne.com';
const SLUG = 'astargne';
const API = `${process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095'}/api/v1/workspaces/${SLUG}`;
const TIPO_ESTADO = { backlog: 'backlog', unstarted: 'unstarted', started: 'started', completed: 'completed', cancelled: 'canceled' };
const TTL_MS = 60_000;

let cache = { em: 0, dados: null };
let renovando = null;

// Fila, triagem, decisões e o Hangar disparam dezenas de GETs de uma vez (projeto ×
// módulo × itens, comentários por carta). Em rajada o Plane enfileira e alguma chamada
// passa do prazo ("aborted due to timeout", 31/10/2026). Todo cliente deste processo
// divide estas vagas, e o prazo de cada chamada só começa a contar quando ela sai da espera.
export const MAX_ABERTAS = 6;
let abertas = 0;
const espera = [];
const vaga = () => (abertas < MAX_ABERTAS ? (abertas++, Promise.resolve()) : new Promise((r) => espera.push(r)));
const soltar = () => { const proxima = espera.shift(); if (proxima) proxima(); else abertas--; };

export function criarClientePlane({ chave, fetchImpl = fetch, timeoutMs = 15_000 }) {
  return async function consultar(caminho) {
    await vaga();
    try {
      const resposta = await fetchImpl(`${API}${caminho}`, {
        headers: { 'X-API-Key': chave },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok || !corpo) {
        throw new Error(`Plane recusou a consulta (HTTP ${resposta.status})`);
      }
      return corpo;
    } finally { soltar(); }
  };
}

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
        updatedAt: w.updated_at ?? w.created_at,
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

export async function lerWorkspacePlane({ agora = Date.now(), consultar } = {}) {
  if (!consultar) {
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
    renovando.catch(() => {});
    return cache.dados;
  }
  return renovando;
}

export function limparCachePlane() {
  cache = { em: 0, dados: null };
  renovando = null;
}
