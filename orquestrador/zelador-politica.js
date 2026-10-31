// Regras do zelador sobre uma carta: o que ele não toca, a digital, o "não desfazer ato humano" (J57) e a prontidão que nenhuma escrita pode mudar (J58). Funções puras: não lê disco nem Plane.
//
// Taxonomia de atores (J65): zelador = o UUID fixo do PROVISION_RESULT (J56); qualquer outro
// ator, inclusive as identidades técnicas orquestrador-* e o bot "agentes" do MCP, é
// não-zelador; atividade sem ator legível conta como humano.
import { createHash } from 'node:crypto';
import { avaliarProntidaoGate } from './politica.js';
import { dependenciasDaCarta } from './fila.js';

export const ZELADOR_ATOR = '830e2631-de81-4871-95b7-ed9cc1774b32';
const GATES_ZELADOR = Object.freeze(['READY TO DEV', 'READY TO TEST']);
const JANELA_OUTRO_ATOR_MS = 2 * 60 * 60_000;
const DIA_MS = 24 * 60 * 60_000;

const sha = t => createHash('sha256').update(String(t)).digest('hex');
const id = v => (typeof v === 'string' ? v : typeof v?.id === 'string' ? v.id : null);
export const atorDe = x => id(x?.actor) ?? id(x?.actor_detail) ?? id(x?.created_by) ?? null;
export const ehZelador = (x, ator = ZELADOR_ATOR) => atorDe(x) === ator;
export const nomesDe = carta => (carta.labels ?? []).map(l => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
export const grupoDe = carta => carta.state?.group ?? null;

// J63: estado, etiquetas, nome, descrição e os comentários que NÃO são do zelador. O próprio
// comentário de intenção não muda a digital; um comentário humano no intervalo muda.
export function digitalDaCarta(carta, comentarios, ator = ZELADOR_ATOR) {
  const estado = typeof carta.state === 'string' ? carta.state : carta.state?.id ?? null;
  const labels = (carta.labels ?? []).map(l => (typeof l === 'string' ? l : l.id)).sort();
  const alheios = (comentarios ?? []).filter(c => !ehZelador(c, ator)).map(c => c.id).sort();
  return sha(JSON.stringify({ estado, labels, nome: carta.name ?? '', descricao: sha(carta.description_html ?? ''), comentarios: alheios }));
}

const recente = (quando, agoraMs, janela) => Number.isFinite(Date.parse(quando)) && agoraMs - Date.parse(quando) < janela;
// Relações inversas: as cartas que ESTA bloqueia ou que esperam por ela.
export const reversas = relacoes => ['blocking', 'start_before', 'finish_before'].flatMap(t => (Array.isArray(relacoes?.[t]) ? relacoes[t] : []))
  .map(r => (typeof r === 'string' ? r : r?.id ?? r?.issue_id ?? r?.work_item_id ?? r?.related_work_item ?? r?.related_issue ?? null)).filter(Boolean);

/**
 * Motivo para o zelador não tocar a carta, ou null (J29, J31, J34, J35, J37, J67).
 * ctx: { porId, relacoes, comentarios, atividades, lease, historico, agoraMs }
 * `relacoes`/`atividades`/`comentarios` null = ilegíveis = intocável (falha fechada).
 */
export function motivoIntocavel(carta, { porId, relacoes, comentarios, atividades, lease, historico = [], agoraMs, ator = ZELADOR_ATOR }) {
  if (['completed', 'cancelled', 'canceled'].includes(grupoDe(carta))) return 'carta fechada';
  if (carta.filhos?.length) return 'não é folha';
  if (nomesDe(carta).some(n => GATES_ZELADOR.includes(n))) return 'carta com gate (portão próprio)';
  if (!relacoes) return 'relações ilegíveis';
  if (reversas(relacoes).some(r => nomesDe(porId.get(r) ?? {}).some(n => GATES_ZELADOR.includes(n)))) return 'bloqueia carta com gate';
  if (lease) return 'lease de despacho na carta';
  if (!historico) return 'touchpoints do despacho ilegíveis';
  if (historico.some(e => e.tipo === 'TENTATIVA' && recente(e.quando ?? e.criadoEm, agoraMs, DIA_MS))) return 'tentativa de despacho nas últimas 24 h';
  if (!comentarios) return 'comentários ilegíveis';
  if (comentarios.some(c => /\[ORQ\/v1/i.test(String(c.comment_html ?? '')) && recente(c.created_at, agoraMs, DIA_MS))) return 'HANDOFF ou gate nas últimas 24 h';
  if (!atividades) return 'atividades ilegíveis';
  if ([...atividades, ...comentarios].some(a => !ehZelador(a, ator) && recente(a.created_at, agoraMs, JANELA_OUTRO_ATOR_MS))) return 'atividade de outro ator nas últimas 2 h';
  return null;
}

/**
 * J57: nunca devolve um campo ao valor de onde um ator não-zelador o tirou, nem remove etiqueta
 * posta por não-zelador. Devolve o motivo da recusa ou null.
 * `estados`: os estados do projeto (id → grupo) para ler o "de onde" de uma atividade de estado.
 */
export function violaAtoHumano(carta, mudanca, { atividades, estados = [], novaDescricao = null, ator = ZELADOR_ATOR }) {
  if (!atividades) return 'atividades ilegíveis';
  const alheias = atividades.filter(a => !ehZelador(a, ator));
  const grupoPorId = new Map(estados.map(e => [e.id, e.group]));
  const grupoPorNome = new Map(estados.map(e => [e.name, e.group]));
  if (mudanca.tipo === 'estado') {
    for (const a of alheias.filter(x => x.field === 'state')) {
      const de = grupoPorId.get(a.old_identifier) ?? grupoPorNome.get(a.old_value);
      if (!de) return 'atividade de estado ilegível por outro ator';
      const alvo = mudanca.grupo === 'completed' ? ['completed'] : ['cancelled', 'canceled'];
      if (alvo.includes(de)) return `outro ator tirou a carta de ${a.old_value ?? mudanca.grupo}; o zelador não devolve`;
    }
  }
  if (mudanca.tipo === 'labels') {
    const daEtiqueta = alheias.filter(x => x.field === 'labels');
    if (mudanca.adicionar.length && daEtiqueta.some(a => typeof a.old_value !== 'string' && typeof a.new_value !== 'string')) return 'atividade de etiqueta ilegível por outro ator';
    for (const nome of mudanca.adicionar) {
      if (daEtiqueta.some(a => a.old_value === nome && a.new_value !== nome)) return `outro ator tirou ${nome}; o zelador não repõe`;
    }
    for (const nome of mudanca.remover) {
      const quemPos = [...atividades].filter(a => a.field === 'labels' && a.new_value === nome)
        .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))).at(-1);
      if (!quemPos || !ehZelador(quemPos, ator)) return `${nome} não foi posta pelo zelador; ele não tira`;
    }
  }
  if (mudanca.tipo === 'trecho' || mudanca.tipo === 'anexar') {
    const texto = mudanca.tipo === 'trecho' ? mudanca.novoTrecho : mudanca.texto;
    for (const a of alheias.filter(x => x.field === 'description')) {
      if (typeof a.old_value !== 'string') return 'atividade de descrição ilegível por outro ator';
      if (novaDescricao !== null && novaDescricao === a.old_value) return 'a descrição voltaria ao texto que outro ator trocou';
      if (texto && a.old_value.includes(texto) && !String(a.new_value ?? '').includes(texto)) return 'o texto novo é o que outro ator tirou da descrição';
    }
  }
  return null;
}

// Prontidão READY TO DEV de cada carta: `pronta|motivos` ordenados, para comparar antes e depois.
export function prontidaoDoProjeto(cartas, relacoesPorId, porId) {
  const mapa = new Map();
  for (const c of cartas) {
    const relacoes = relacoesPorId.get(c.id) ?? null;
    const dependencias = dependenciasDaCarta(c, relacoes, porId);
    const r = avaliarProntidaoGate(c, { gate: 'READY TO DEV', dependencias });
    mapa.set(c.id, { pronta: r.pronta, motivos: [...r.motivos].sort() });
  }
  return mapa;
}

/**
 * J58: a escrita não pode mudar resultado nem motivos da prontidão de NENHUMA outra carta; na
 * própria carta, só pode acrescentar motivos (fechar ou travar nunca a torna mais elegível).
 */
export function violaProntidao(antes, depois, alvoId) {
  for (const [cid, a] of antes) {
    const d = depois.get(cid);
    if (!d) return `prontidão de ${cid} sumiu na simulação`;
    if (cid === alvoId) {
      if ((d.pronta && !a.pronta) || a.motivos.some(m => !d.motivos.includes(m))) return 'a escrita deixaria a própria carta mais perto do READY TO DEV';
    } else if (a.pronta !== d.pronta || a.motivos.join('§') !== d.motivos.join('§')) return `a escrita mudaria a prontidão de outra carta (${cid.slice(0, 8)})`;
  }
  return null;
}
