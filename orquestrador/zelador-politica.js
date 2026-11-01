// Regras do zelador sobre uma carta: o que ele não toca, a digital, o "não desfazer ato humano" (J57) e a prontidão que nenhuma escrita pode melhorar em carta alguma nem mudar nas outras (J58), salvo o preparo do PRONTA (PAINEL-62). Funções puras: não lê disco nem Plane.
//
// Taxonomia de atores (J65): zelador = o UUID fixo do PROVISION_RESULT (J56); qualquer outro
// ator, inclusive as identidades técnicas orquestrador-* e o bot "agentes" do MCP, é
// não-zelador; atividade sem ator legível conta como humano.
import { createHash } from 'node:crypto';
import { avaliarProntidaoGate } from './politica.js';
import { dependenciasDaCarta } from './fila.js';
import { CABECALHO_DECISAO, FONTE_DECISAO } from '../decisao.js';
import { textoDoHtml as textoNormal, tocaMarcadorHumano } from './zelador-veredito.js';
import { TextoDependencia, linhaDeclaraSem } from './texto-dependencia.js';

export const ZELADOR_ATOR = '830e2631-de81-4871-95b7-ed9cc1774b32';
const GATES_ZELADOR = Object.freeze(['READY TO DEV', 'READY TO TEST']);
const JANELA_OUTRO_ATOR_MS = 2 * 60 * 60_000;
const DIA_MS = 24 * 60 * 60_000;
// PAINEL-62: os dois únicos motivos do juiz (prontidao-gate.js, dependencias-carta.js) que o
// preparo do PRONTA pode tirar da própria carta: o Backlog e a declaração ausente.
export const MOTIVO_ESTADO = 'estado inadequado para desenvolvimento';
export const MOTIVO_DECLARACAO = 'dependência declaração: ausência de dependências não declarada na carta';
export const MOTIVOS_DO_PREPARO = Object.freeze([MOTIVO_ESTADO, MOTIVO_DECLARACAO]);

const sha = t => createHash('sha256').update(String(t)).digest('hex');
const TERMINAIS = Object.freeze(['completed', 'cancelled', 'canceled']);
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
// B2: comentário da mesa (fonte ou cabeçalho DECISAO/v1, de qualquer ator: na dúvida, conta).
export const ehDecisaoDaMesa = c => c?.external_source === FONTE_DECISAO || textoNormal(c?.comment_html).includes(CABECALHO_DECISAO);

// Relações inversas: as cartas que ESTA bloqueia ou que esperam por ela.
export const reversas = relacoes => ['blocking', 'start_before', 'finish_before'].flatMap(t => (Array.isArray(relacoes?.[t]) ? relacoes[t] : []))
  .map(r => (typeof r === 'string' ? r : r?.id ?? r?.issue_id ?? r?.work_item_id ?? r?.related_work_item ?? r?.related_issue ?? null)).filter(Boolean);

/**
 * Motivo para o zelador não tocar a carta, ou null (J29, J31, J34, J35, J37, J67, B1, B2).
 * ctx: { porId (todo o catálogo), relacoes, comentarios, atividades, lease, historico, agoraMs, mesaPendente, reserva }
 * `reserva` (F4b, item 9): a reserva viva de outra sessão ({ motivo }) ou null = livre.
 * `relacoes`/`atividades`/`comentarios` null = ilegíveis = intocável (falha fechada); carta
 * relacionada fora da leitura do catálogo também; `mesaPendente` null = diário da mesa ilegível.
 */
export function motivoIntocavel(carta, { porId, relacoes, comentarios, atividades, lease, historico = [], agoraMs, mesaPendente = false, reserva = null, ator = ZELADOR_ATOR }) {
  if (TERMINAIS.includes(grupoDe(carta))) return 'carta fechada';
  if (carta.filhos?.length) return 'não é folha';
  if (nomesDe(carta).some(n => GATES_ZELADOR.includes(n))) return 'carta com gate (portão próprio)';
  if (mesaPendente === null) return 'pendências da mesa ilegíveis';
  if (mesaPendente) return 'aplicação da mesa pendente na carta';
  if (!relacoes) return 'relações ilegíveis';
  if (reversas(relacoes).some(r => !porId.has(r))) return 'carta relacionada fora da leitura do catálogo';
  if (reversas(relacoes).some(r => nomesDe(porId.get(r)).some(n => GATES_ZELADOR.includes(n)))) return 'bloqueia carta com gate';
  if (lease) return 'lease de despacho na carta';
  if (reserva) return `carta reservada por outra sessão: ${reserva.motivo}`;
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
 * B3: quem tirou a carta de QUALQUER estado terminal impede o zelador de pô-la em qualquer um.
 * B2: carta com DECISAO/v1 da mesa nunca recebe ASTARGNE do zelador (`comentarios`).
 */
export function violaAtoHumano(carta, mudanca, { atividades, estados = [], novaDescricao = null, comentarios = [], ator = ZELADOR_ATOR }) {
  if (!atividades) return 'atividades ilegíveis';
  if (mudanca.tipo === 'labels' && mudanca.adicionar.includes('ASTARGNE')) {
    if (!comentarios) return 'comentários ilegíveis';
    if (comentarios.some(ehDecisaoDaMesa)) return 'o dono já decidiu na mesa (DECISAO/v1); o zelador não repõe ASTARGNE';
  }
  const alheias = atividades.filter(a => !ehZelador(a, ator));
  const grupoPorId = new Map(estados.map(e => [e.id, e.group]));
  const grupoPorNome = new Map(estados.map(e => [e.name, e.group]));
  if (mudanca.tipo === 'estado') {
    for (const a of alheias.filter(x => x.field === 'state')) {
      const de = grupoPorId.get(a.old_identifier) ?? grupoPorNome.get(a.old_value);
      if (!de) return 'atividade de estado ilegível por outro ator';
      if (TERMINAIS.includes(de)) return `outro ator tirou a carta de ${a.old_value ?? de}; o zelador não a põe em estado terminal`;
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
  if (mudanca.tipo === 'preparo') {
    const recusa = violaAtoHumanoNoPreparo(mudanca, alheias, grupoPorId, grupoPorNome);
    if (recusa) return recusa;
  }
  if (mudanca.tipo === 'trecho' || mudanca.tipo === 'anexar') {
    const texto = mudanca.tipo === 'trecho' ? mudanca.novoTrecho : mudanca.texto;
    for (const a of alheias.filter(x => x.field === 'description')) {
      if (typeof a.old_value !== 'string') return 'atividade de descrição ilegível por outro ator';
      // B20: o Plane sanitiza o HTML; compara-se o texto, não o byte.
      if (novaDescricao !== null && textoNormal(novaDescricao) === textoNormal(a.old_value)) return 'a descrição voltaria ao texto que outro ator trocou';
      const normal = textoNormal(texto);
      if (normal && textoNormal(a.old_value).includes(normal) && !textoNormal(a.new_value).includes(normal)) return 'o texto novo é o que outro ator tirou da descrição';
    }
  }
  return null;
}

// As linhas visíveis da descrição que declaram "sem dependências" ou tocam marcador (D9).
const leitorTexto = new TextoDependencia();
const linhasDeDeclaracao = html => leitorTexto.visivel(html).split('\n').map(l => l.replace(/\s+/g, ' ').trim())
  .filter(l => linhaDeclaraSem(l) || tocaMarcadorHumano(l));

// J57 do preparo (D8, D9; J11 da correção): o zelador não tira do Backlog a carta que um
// não-zelador pôs lá, venha de onde vier, nem declara "nenhuma" onde um não-zelador tirou uma declaração ou um
// marcador (qualquer data na linha do zelador: a comparação é pela forma, não pelo texto exato).
function violaAtoHumanoNoPreparo(mudanca, alheias, grupoPorId, grupoPorNome) {
  if (mudanca.estado) {
    for (const a of alheias.filter(x => x.field === 'state')) {
      const para = grupoPorId.get(a.new_identifier) ?? grupoPorNome.get(a.new_value);
      if (!para) return 'atividade de estado ilegível por outro ator';
      if (para === 'backlog') return `outro ator pôs a carta no Backlog vinda de ${a.old_value ?? '?'}; o zelador não a tira de lá`;
    }
  }
  if (mudanca.declarar) {
    for (const a of alheias.filter(x => x.field === 'description')) {
      // Descrição vazia chega como null: é legível (nada havia); outro tipo é ilegível.
      const antes = a.old_value ?? '';
      if (typeof antes !== 'string' || (a.new_value != null && typeof a.new_value !== 'string')) return 'atividade de descrição ilegível por outro ator';
      const depois = new Set(linhasDeDeclaracao(a.new_value ?? ''));
      if (linhasDeDeclaracao(antes).some(l => !depois.has(l))) return 'outro ator tirou da descrição uma declaração de dependência ou um marcador; o zelador não declara';
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
 * Exceção estreita, ligada ao TIPO `preparo` (PAINEL-62, D5), nunca ao motivo: na própria carta só
 * somem os dois motivos do preparo; numa vizinha só troca o nome do estado em
 * `dependência <codigoAlvo>: <estado>`, com ela seguindo não-pronta.
 */
export function violaProntidao(antes, depois, alvoId, { tipo = null, codigoAlvo = null } = {}) {
  const preparo = tipo === 'preparo';
  for (const [cid, a] of antes) {
    const d = depois.get(cid);
    if (!d) return `prontidão de ${cid} sumiu na simulação`;
    if (cid === alvoId) {
      const sumiram = a.motivos.filter(m => !d.motivos.includes(m));
      if (preparo) {
        if (sumiram.some(m => !MOTIVOS_DO_PREPARO.includes(m))) return 'o preparo tiraria da própria carta um motivo além do estado e da declaração';
      } else if ((d.pronta && !a.pronta) || sumiram.length) return 'a escrita deixaria a própria carta mais perto do READY TO DEV';
    } else if (a.pronta !== d.pronta || a.motivos.join('§') !== d.motivos.join('§')) {
      if (!preparo || !soTrocouOEstadoDaDependencia(a, d, codigoAlvo)) return `a escrita mudaria a prontidão de outra carta (${cid.slice(0, 8)})`;
    }
  }
  return null;
}

function soTrocouOEstadoDaDependencia(a, d, codigoAlvo) {
  if (!codigoAlvo || a.pronta || d.pronta) return false;
  const prefixo = `dependência ${codigoAlvo}: `;
  const forma = motivos => motivos.map(m => (m.startsWith(prefixo) ? prefixo : m)).sort().join('§');
  return a.motivos.some(m => m.startsWith(prefixo)) && forma(a.motivos) === forma(d.motivos);
}
