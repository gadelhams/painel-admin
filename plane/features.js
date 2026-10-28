// Projeção pura do workspace do Plane para a forma do backlog.

export const TAGS_CANONICAS = ['ASTARGNE', 'EMPÍRICA', 'BLOQUEADA', 'SEM ESCOPO', 'CONGELADA', 'PÓS-PLAYTEST'];
const LEGADO = { DONO: 'ASTARGNE' };
const RE_TAG = /\((ASTARGNE|DONO|EMPÍRICA|SEM ESCOPO|CONGELADA|BLOQUEADA|PÓS-PLAYTEST)(?![\p{L}])([^)]{0,200})\)/gu;
const VARREDURA_MAX = 4000;

function tagsDaIssue(issue) {
  const rotulos = new Set(issue.labels.nodes.map((l) => LEGADO[l.name] ?? l.name));
  const detalhes = new Map();
  for (const m of (issue.description ?? '').slice(0, VARREDURA_MAX).matchAll(RE_TAG)) {
    const detalhe = m[2].replace(/^[\s:;,—–-]+/, '').trim();
    const tag = LEGADO[m[1]] ?? m[1];
    if (detalhe && !detalhes.has(tag)) detalhes.set(tag, detalhe);
  }
  return TAGS_CANONICAS.filter((t) => rotulos.has(t))
    .map((tag) => (detalhes.has(tag) ? { tag, detalhe: detalhes.get(tag) } : { tag }));
}

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
