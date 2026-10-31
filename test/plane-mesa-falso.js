// Plane falso, em memória, só com as rotas que a mesa de decisão usa (Plane v1.4.2 lido no container em 31/10/2026): carta pelo identificador e pelo projeto, comentários (409 por external_id no PROJETO), labels, estados, atividades, users/me e o PATCH que apaga e recria as labels. Nunca abre rede.
import { randomUUID } from 'node:crypto';

export const ADMIN = '0b8d3f6e-1c2a-4e5f-9a7b-1234567890ab';
export const GUEST_KEY = 'plane_api_guestguestguest0001';
export const PROJ = 'c24e3d36-2e2a-4760-a3f3-53998297a245'; // PAINEL no catálogo
export const CARTA = '5c1b0f2e-7a3d-4b8c-9d0e-aaaaaaaaaaaa';
export const OUTRO_ATOR = '9f9f9f9f-1111-4222-8333-444444444444';

const lab = (name) => ({ id: randomUUID(), name });
const est = (name, group) => ({ id: randomUUID(), name, group });

export function criarPlaneFalso({ chaveAdmin = 'plane_api_adminadminadmin0002', meId = ADMIN } = {}) {
  const labels = ['ASTARGNE', 'DONO', 'PRODUTO', 'BLOQUEADA', 'READY TO DEV', 'C-3PO'].map(lab);
  const estados = [est('Backlog', 'backlog'), est('Todo', 'unstarted'), est('In Progress', 'started'), est('Done', 'completed'), est('Cancelled', 'cancelled')];
  const L = Object.fromEntries(labels.map(l => [l.name, l]));
  const S = Object.fromEntries(estados.map(e => [e.name, e]));
  const p = {
    labels, estados, L, S, chamadas: [], escritas: [], atividades: [], comentarios: [],
    carta: { id: CARTA, project: PROJ, sequence_id: 53, name: 'Mesa: qual fonte usar?', state: S.Todo.id, labels: [L.ASTARGNE.id, L['C-3PO'].id],
      description_html: '<p>Escolher a fonte (ASTARGNE: qual das duas?) antes de seguir.</p>', updated_at: '2026-10-31T10:00:00Z' },
    // Ganchos de teste: rodam antes da resposta de uma rota e podem mexer no estado ou falhar.
    antes: {}, falhar: {},
  };
  const expandir = c => ({ ...c, labels: c.labels.map(id => labels.find(l => l.id === id)).filter(Boolean),
    state: estados.find(e => e.id === c.state) ?? null });
  const resposta = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });
  const pagina = results => ({ results, next_page_results: false, next_cursor: null });

  async function fetchImpl(url, opcoes = {}) {
    const u = new URL(url);
    const metodo = opcoes.method ?? 'GET';
    const chave = opcoes.headers?.['X-API-Key'];
    const rota = u.pathname.replace('/api/v1', '');
    p.chamadas.push(`${metodo} ${rota}`);
    if (opcoes.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const [prefixo, gancho] of Object.entries(p.antes)) if (`${metodo} ${rota}`.startsWith(prefixo)) await gancho(p, opcoes);
    for (const [prefixo, falha] of Object.entries(p.falhar)) if (`${metodo} ${rota}`.startsWith(prefixo)) {
      if (falha === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      return resposta(falha, { error: 'falha simulada' });
    }
    const escrita = metodo !== 'GET';
    if (escrita && chave !== chaveAdmin) return resposta(403, { error: 'guest' });
    if (!escrita && chave !== chaveAdmin && chave !== GUEST_KEY) return resposta(401, {});
    if (rota === '/users/me/') return resposta(200, { id: chave === chaveAdmin ? meId : 'guest' });
    if (rota === '/workspaces/astargne/work-items/PAINEL-53/') return resposta(200, { ...p.carta });
    if (/^\/workspaces\/astargne\/work-items\/[A-Z]+-\d+\/$/.test(rota)) return resposta(404, {});
    const base = `/workspaces/astargne/projects/${PROJ}/work-items/${CARTA}`;
    if (rota === `${base}/` && metodo === 'GET') return resposta(200, expandir(p.carta));
    if (rota === `${base}/comments/` && metodo === 'GET') return resposta(200, pagina(p.comentarios.filter(c => c.issue === CARTA)));
    if (rota === `/workspaces/astargne/projects/${PROJ}/labels/`) return resposta(200, pagina(labels));
    if (rota === `/workspaces/astargne/projects/${PROJ}/states/`) return resposta(200, pagina(estados));
    if (rota === `${base}/activities/`) return resposta(200, pagina(p.atividades));
    const umComentario = rota.match(new RegExp(`^${base}/comments/([0-9a-f-]{36})/$`));
    if (umComentario && metodo === 'GET') {
      const c = p.comentarios.find(x => x.id === umComentario[1] && x.issue === CARTA);
      return c ? resposta(200, c) : resposta(404, {});
    }
    if (rota === `${base}/comments/` && metodo === 'POST') {
      const corpo = JSON.parse(opcoes.body);
      const existe = p.comentarios.find(c => c.external_source === corpo.external_source && c.external_id === corpo.external_id);
      if (existe) return resposta(409, { error: 'exists', id: existe.id });
      const c = { id: randomUUID(), issue: CARTA, project: PROJ, actor: meId, created_by: meId, created_at: new Date().toISOString(),
        edited_at: null, ...corpo };
      p.comentarios.push(c);
      p.escritas.push({ tipo: 'comentario', external_id: corpo.external_id, html: corpo.comment_html });
      return resposta(201, c);
    }
    if (rota === `${base}/` && metodo === 'PATCH') {
      const corpo = JSON.parse(opcoes.body);
      p.escritas.push({ tipo: 'patch', corpo });
      // O Plane v1 descarta em silêncio id de label de outro projeto e responde 200.
      if (corpo.labels) p.carta.labels = corpo.labels.filter(id => labels.some(l => l.id === id));
      if (corpo.state) p.carta.state = corpo.state;
      if ('description_html' in corpo) p.carta.description_html = corpo.description_html;
      p.carta.updated_at = new Date().toISOString();
      return resposta(200, expandir(p.carta));
    }
    return resposta(404, { error: `rota não simulada: ${metodo} ${rota}` });
  }
  p.fetchImpl = fetchImpl;
  return p;
}
