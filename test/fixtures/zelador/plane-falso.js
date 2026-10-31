// Plane falso para o zelador: leitura Guest (`consultar`) e o fetch do escritor (chave, /users/me, comentários com external_id e 409, PATCH com atividade). Nada de rede.
import { randomUUID } from 'node:crypto';
import { ZELADOR_ATOR } from '../../../orquestrador/zelador-politica.js';

export const HUMANO = 'cd43e869-ed51-419e-b23b-0b10aea66231';

const resposta = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });

export function criarPlaneFalso({ projetoId, sigla, agora, chave = 'chave-do-zelador-de-teste-123', ator = ZELADOR_ATOR }) {
  const estados = [
    { id: randomUUID(), name: 'Todo', group: 'unstarted' }, { id: randomUUID(), name: 'In Progress', group: 'started' },
    { id: randomUUID(), name: 'Done', group: 'completed' }, { id: randomUUID(), name: 'Cancelled', group: 'cancelled' },
  ];
  const estado = nome => estados.find(e => e.name === nome);
  const labels = ['ASTARGNE', 'PRODUTO', 'BLOQUEADA', 'TAREFA DONO', 'READY TO DEV', 'READY TO TEST'].map(name => ({ id: randomUUID(), name }));
  const label = nome => labels.find(l => l.name === nome);
  const cartas = new Map();
  const comentarios = new Map();
  const atividades = new Map();
  const relacoes = new Map();
  // aoPedir: espia cada HTTP do escritor; sanitizar: imita o nh3 do Plane (decodifica o apóstrofo);
  // relacoesFalham: ids cuja leitura de relações falha sempre.
  const falhas = { mudarDepoisDoComentario: false, verificacaoMente: false, antesDoPatch: null, depoisDoComentario: null, antesDoComentario: null,
    aoPedir: null, sanitizar: false, relacoesFalham: new Set() };
  const nh3 = html => (falhas.sanitizar ? String(html).replaceAll('&#39;', "'") : html);
  const escritas = [];
  let seq = 0;
  const iso = (ms = agora()) => new Date(ms).toISOString();

  function novaCarta({ nome = `Carta ${seq + 1}`, estadoNome = 'Todo', etiquetas = [], descricao = '<p>Sem dependências.</p>', parent = null } = {}) {
    const id = randomUUID();
    const c = { id, sequence_id: ++seq, name: nome, state: { ...estado(estadoNome) }, labels: etiquetas.map(n => ({ ...label(n) })),
      description_html: descricao, parent, updated_at: iso(agora() - 5 * 86_400_000), created_at: iso(agora() - 9 * 86_400_000) };
    cartas.set(id, c); comentarios.set(id, []); atividades.set(id, []); relacoes.set(id, { blocked_by: [], blocking: [] });
    return c;
  }
  const identificador = c => `${sigla}-${c.sequence_id}`;
  const atividade = (cartaId, a) => atividades.get(cartaId).push({ id: randomUUID(), created_at: iso(), ...a });
  const comentar = (cartaId, { html, autor = HUMANO, quando = iso(), externalSource = null, externalId = null }) => {
    const c = { id: randomUUID(), comment_html: html, actor: autor, created_at: quando, external_source: externalSource, external_id: externalId };
    comentarios.get(cartaId).push(c);
    return c;
  };
  const relacionar = (bloqueada, bloqueadora) => {
    relacoes.get(bloqueada.id).blocked_by.push(bloqueadora.id);
    relacoes.get(bloqueadora.id).blocking.push(bloqueada.id);
  };
  const pagina = results => ({ results, next_page_results: false });

  async function consultar(url) {
    const caminho = url.split('?')[0];
    const pre = `/projects/${projetoId}`;
    if (caminho === `${pre}/work-items/`) return pagina([...cartas.values()].map(c => structuredClone(c)));
    if (caminho === `${pre}/states/`) return pagina(structuredClone(estados));
    const m = new RegExp(`^${pre}/work-items/([0-9a-f-]{36})/(comments|activities|relations)?/?$`).exec(caminho);
    if (!m) throw new Error(`Plane falso: GET desconhecido ${url}`);
    // Como o cliente real (plane/cliente.js): carta apagada responde 404.
    if (!cartas.has(m[1])) throw new Error('Plane recusou a consulta (HTTP 404)');
    if (m[2] === 'comments') return pagina(structuredClone(comentarios.get(m[1])));
    if (m[2] === 'activities') return structuredClone(atividades.get(m[1]));
    if (m[2] === 'relations') {
      if (falhas.relacoesFalham.has(m[1])) throw new Error('Plane recusou a consulta (HTTP 502)');
      return structuredClone(relacoes.get(m[1]));
    }
    return structuredClone(cartas.get(m[1]));
  }

  async function fetchImpl(url, opcoes = {}) {
    const metodo = opcoes.method ?? 'GET';
    if (falhas.aoPedir) await falhas.aoPedir(metodo, new URL(url).pathname);
    if (opcoes.headers?.['X-API-Key'] !== chave) return resposta(401, { erro: 'chave' });
    const caminho = new URL(url).pathname.replace(/^\/api\/v1/, '');
    if (caminho === '/users/me/') return resposta(200, { id: ator });
    const pre = `/workspaces/astargne/projects/${projetoId}`;
    if (caminho === `${pre}/states/`) return resposta(200, pagina(structuredClone(estados)));
    if (caminho === `${pre}/labels/`) return resposta(200, pagina(structuredClone(labels)));
    const m = new RegExp(`^${pre}/work-items/([0-9a-f-]{36})/(comments/(?:([0-9a-f-]{36})/)?)?$`).exec(caminho);
    if (!m || !cartas.has(m[1])) return resposta(404, {});
    const carta = cartas.get(m[1]);
    if (m[2] && metodo === 'POST') {
      const corpo = JSON.parse(opcoes.body);
      const igual = comentarios.get(carta.id).find(c => c.external_source === corpo.external_source && c.external_id === corpo.external_id);
      if (igual) return resposta(409, { id: igual.id, erro: 'external_id' });
      if (falhas.antesDoComentario) await falhas.antesDoComentario(carta, corpo);
      escritas.push(`comentario:${identificador(carta)}`);
      const c = comentar(carta.id, { html: nh3(corpo.comment_html), autor: ator, externalSource: corpo.external_source, externalId: corpo.external_id });
      if (falhas.depoisDoComentario) await falhas.depoisDoComentario(carta);
      return resposta(201, structuredClone(c));
    }
    if (m[3]) { const c = comentarios.get(carta.id).find(x => x.id === m[3]); return c ? resposta(200, structuredClone(c)) : resposta(404, {}); }
    if (m[2] && metodo === 'GET') return resposta(200, pagina(structuredClone(comentarios.get(carta.id))));
    if (metodo === 'PATCH') {
      if (falhas.mudarDepoisDoComentario) throw new Error('queda simulada entre a intenção e a mudança');
      if (falhas.antesDoPatch) await falhas.antesDoPatch(carta);
      const corpo = JSON.parse(opcoes.body);
      if (corpo.state) {
        const de = carta.state; const para = estados.find(e => e.id === corpo.state);
        carta.state = { ...para };
        atividade(carta.id, { field: 'state', verb: 'updated', old_value: de.name, new_value: para.name, old_identifier: de.id, new_identifier: para.id, actor: ator });
      }
      if (corpo.labels) {
        const antes = carta.labels.map(l => l.name);
        carta.labels = corpo.labels.map(id => ({ ...labels.find(l => l.id === id) }));
        const depois = carta.labels.map(l => l.name);
        // Como o Plane real: o id da etiqueta vai em new_identifier/old_identifier (o recibo do gate amarra por ele, J55).
        for (const n of depois.filter(x => !antes.includes(x))) atividade(carta.id, { field: 'labels', verb: 'updated', old_value: '', new_value: n, new_identifier: label(n).id, actor: ator });
        for (const n of antes.filter(x => !depois.includes(x))) atividade(carta.id, { field: 'labels', verb: 'updated', old_value: n, new_value: '', old_identifier: label(n).id, actor: ator });
      }
      if (corpo.description_html !== undefined) {
        atividade(carta.id, { field: 'description', verb: 'updated', old_value: carta.description_html, new_value: nh3(corpo.description_html), actor: ator });
        carta.description_html = nh3(corpo.description_html);
      }
      carta.updated_at = iso();
      escritas.push(`patch:${identificador(carta)}:${Object.keys(corpo).sort().join('+')}`);
      return resposta(200, structuredClone(carta));
    }
    const lida = structuredClone(carta);
    if (falhas.verificacaoMente && escritas.some(e => e.startsWith(`patch:${identificador(carta)}`))) lida.labels = [];
    return resposta(200, lida);
  }

  const apagar = carta => { cartas.delete(carta.id); };
  return { consultar, fetchImpl, chave, estados, estado, labels, label, cartas, comentarios, atividades, relacoes, falhas, escritas,
    novaCarta, identificador, atividade, comentar, relacionar, apagar, projetoId, sigla };
}
