// O preparo do PRONTA (PAINEL-62): as regras puras que decidem se o painel pode tirar a carta do Backlog e/ou declarar "Dependências: nenhuma" antes do gate. Não lê Plane nem escreve.
//
// Decisão do dono (01/11/2026): "a ideia do zelador é justamente validar as dependências e retirar
// do backlog". O desenho congelado é o parecer do validador de invariantes (D1–D15):
// - o preparo só nasce do juiz real (`preavaliar`): identidade de gate, nenhum gate na carta e
//   pendências contidas nos dois motivos do preparo (D4); o estado só sai do grupo backlog;
// - veto automático (D6, J1; decisão do dono de 01/11/2026, "o zelador julga a prosa"), em todo
//   PRONTA, com ou sem preparo (X1), só no que é certo: código de carta de sigla do catálogo (o mesmo conjunto do juiz),
//   que não é a própria nem está formalizado como dependência desta carta (X2), no título, na descrição ou num
//   comentário de não-zelador; relação não formal (relates_to, duplicate…) ou fora da forma;
// - prosa com o vocabulário de dependência (título, descrição fora das linhas que declaram "sem
//   dependências", comentários de não-zelador) não veta: vira linha suspeita, que a CLI tem de
//   julgar no PRONTA (`prosaJulgada`); linha suspeita sem julgamento = MANTER;
// - estado alvo (D13): o de grupo unstarted com o menor `sequence`, nunca um bloqueado/em espera;
//   `sequence` ausente ou empate recusa.
// Resíduo declarado: a prosa é julgada pela IA, com o julgamento no recibo GATE/v1.
import { MOTIVO_DECLARACAO, MOTIVO_ESTADO, MOTIVOS_DO_PREPARO, ehZelador } from './zelador-politica.js';
import { textoDoHtml } from './zelador-veredito.js';
import { RelacoesFormais } from './relacoes-formais.js';
import { textoDeHtml } from '../decisao.js';
import { ESTADO_BLOQUEADO, VOCABULARIO_DEPENDENCIA, linhaDeclaraSem } from './texto-dependencia.js';

const CODIGO_CARTA = /\b[A-Za-z][A-Za-z0-9]{1,15}-\d+\b/g;
const RELACOES_DE_DEPENDENCIA = ['blocked_by', 'start_after', 'finish_after'];
// Relações formais (de dependência ou o inverso): as únicas que o preparo aceita na carta.
const RELACOES_ACEITAS = new Set(['blocking', 'start_before', 'finish_before', ...RELACOES_DE_DEPENDENCIA]);
const formais = new RelacoesFormais();

// Os códigos SIGLA-N de um texto, em maiúsculas e sem repetição.
export const codigosEm = texto => [...new Set((String(texto ?? '').match(CODIGO_CARTA) ?? []).map(x => x.toUpperCase()))];

// As linhas visíveis de uma descrição, com o espaço normalizado.
export const linhasDoTexto = html => textoDeHtml(html, Infinity).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
// A linha como o painel a compara: espaço normalizado (o julgamento da CLI casa por aqui).
export const normalizarLinha = l => String(l ?? '').replace(/\s+/g, ' ').trim();
// O texto das linhas que existiam antes e não existem depois.
export const textoRemovido = (antes, depois) => { const ficam = new Set(linhasDoTexto(depois)); return linhasDoTexto(antes).filter(l => !ficam.has(l)).join('\n'); };

// O estado para onde o preparo leva a carta: { estado } ou { erro }.
export function estadoAlvoDoPreparo(estados) {
  const candidatos = (Array.isArray(estados) ? estados : []).filter(e => e?.group === 'unstarted' && !ESTADO_BLOQUEADO.test(e.name ?? ''));
  if (!candidatos.length) return { erro: 'projeto sem estado "não começada" livre de bloqueio' };
  if (candidatos.some(e => !Number.isFinite(e.sequence))) return { erro: 'estado "não começada" sem sequence; o alvo do preparo fica ambíguo' };
  const menor = Math.min(...candidatos.map(e => e.sequence));
  const alvos = candidatos.filter(e => e.sequence === menor);
  if (alvos.length !== 1) return { erro: 'dois estados "não começada" com a mesma sequence; o alvo do preparo fica ambíguo' };
  return { estado: alvos[0] };
}

// A forma das relações lida no Plane, comparável antes e sob a trava; null = ilegível.
export function assinaturaRelacoes(relacoes) {
  if (!relacoes || typeof relacoes !== 'object' || Array.isArray(relacoes)) return null;
  if (!RELACOES_DE_DEPENDENCIA.every(k => Array.isArray(relacoes[k]))) return null;
  const forma = {};
  for (const k of Object.keys(relacoes).sort()) {
    if (!Array.isArray(relacoes[k])) return null;
    const ids = relacoes[k].map(r => formais.idDe(r));
    if (ids.some(x => !x)) return null;
    forma[k] = ids.sort();
  }
  return JSON.stringify(forma);
}

// D4: o plano do preparo a partir da pré-avaliação do juiz real. { mudanca } (null = vazio) ou { manter }.
export function planoDoPreparo(pre, carta) {
  if (!pre?.podeRegistrarGate) return { manter: 'prontidão ao vivo recusou: identidade de escrita restrita indisponível para este projeto' };
  if (!Array.isArray(pre.gatesAtuais) || pre.gatesAtuais.length) return { manter: 'prontidão ao vivo recusou: gate já presente; o zelador não troca gate' };
  if (!Array.isArray(pre.pendenciasDoGate)) return { manter: 'prontidão ao vivo recusou: pré-avaliação ilegível' };
  const fora = pre.pendenciasDoGate.filter(m => !MOTIVOS_DO_PREPARO.includes(m));
  if (fora.length) return { manter: `prontidão ao vivo recusou: ${fora.join('; ')}` };
  const estado = pre.pendenciasDoGate.includes(MOTIVO_ESTADO);
  const declarar = pre.pendenciasDoGate.includes(MOTIVO_DECLARACAO);
  if (estado && carta.state?.group !== 'backlog') return { manter: 'prontidão ao vivo recusou: estado inadequado fora do Backlog; o preparo só tira do Backlog' };
  return { mudanca: estado || declarar ? { tipo: 'preparo', estado, declarar } : null };
}

// As siglas do catálogo, o mesmo conjunto que o juiz (dependencias-carta.js) usa para o texto.
export const siglasDoCatalogo = porId => new Set([...porId.values()].map(c => c.sigla?.toUpperCase()).filter(Boolean));

// Os códigos (SIGLA-N) das cartas nas relações `tipos`, resolvidas pelo catálogo.
const codigosDasRelacoes = (relacoes, tipos, porId) => new Set(tipos.flatMap(t => relacoes[t] ?? []).map(r => porId.get(formais.idDe(r))).filter(Boolean)
  .map(c => `${c.sigla}-${c.sequence_id}`.toUpperCase()));

// D6/J1, veto de todo PRONTA (X1: com ou sem preparo): motivo certo para MANTER, ou null.
// `codigo` = SIGLA-N da própria carta; `siglas` = as do catálogo. Só dispensa o veto a citação
// formalizada como dependência desta carta (blocked_by, start_after, finish_after, X2); a formalizada
// só no sentido inverso (esta carta bloqueia a citada) veta, com o motivo. Código fora do catálogo
// (AST-181, ADR-0005, READY-20261022) não veta.
export function motivoDeVeto({ carta, codigo, comentarios, relacoes, siglas, porId }) {
  const formalize = 'formalize a relação no Plane';
  if (assinaturaRelacoes(relacoes) === null) return 'relações do Plane ilegíveis ou fora da forma; o gate não sai';
  const outra = Object.keys(relacoes).find(k => relacoes[k].length && !RELACOES_ACEITAS.has(k));
  if (outra) return `relação ${outra} na carta; ${formalize}`;
  const dependencias = codigosDasRelacoes(relacoes, RELACOES_DE_DEPENDENCIA, porId);
  const inversas = codigosDasRelacoes(relacoes, ['blocking', 'start_before', 'finish_before'], porId);
  const proprio = String(codigo).toUpperCase();
  const vetados = texto => codigosEm(texto).filter(c => c !== proprio && siglas.has(c.split('-')[0]) && !dependencias.has(c));
  const porque = c => (inversas.has(c) ? `, mas a relação está no sentido inverso (esta carta bloqueia ${c}); ${formalize}` : `; ${formalize}`);
  const noTitulo = vetados(carta.name);
  if (noTitulo.length) return `o título cita ${noTitulo[0]}${porque(noTitulo[0])}`;
  const naDescricao = vetados(textoDoHtml(carta.description_html));
  if (naDescricao.length) return `a descrição cita ${naDescricao[0]}${porque(naDescricao[0])}`;
  if (!Array.isArray(comentarios)) return 'comentários ilegíveis; o gate não sai';
  for (const c of comentarios.filter(x => !ehZelador(x))) {
    const noComentario = vetados(textoDoHtml(c.comment_html));
    if (noComentario.length) return `um comentário cita ${noComentario[0]}${porque(noComentario[0])}`;
  }
  return null;
}

// As linhas com o vocabulário de dependência que a CLI tem de julgar: título, descrição (fora das
// linhas que já declaram "sem dependências") e comentários de não-zelador, normalizadas e sem repetição.
export function linhasSuspeitas({ carta, comentarios }) {
  const linhas = [normalizarLinha(carta.name), ...linhasDoTexto(carta.description_html).filter(l => !linhaDeclaraSem(l)),
    ...(Array.isArray(comentarios) ? comentarios : []).filter(x => !ehZelador(x)).flatMap(c => linhasDoTexto(c.comment_html))];
  return [...new Set(linhas.filter(l => l && VOCABULARIO_DEPENDENCIA.test(l)))];
}

// O julgamento da CLI contra as linhas suspeitas, nos dois sentidos (X3), pelo texto normalizado:
// motivo para MANTER ou null.
export function motivoDaProsa(suspeitas, prosaJulgada) {
  const julgadas = (Array.isArray(prosaJulgada) ? prosaJulgada : []).map(j => normalizarLinha(j?.linha));
  const falta = suspeitas.find(l => !julgadas.includes(l));
  if (falta !== undefined) return `o zelador não julgou: ${falta}`;
  const inventada = julgadas.find(l => !suspeitas.includes(l));
  return inventada === undefined ? null : `julgamento de linha que não está na carta: ${inventada}`;
}

// Tudo o que segura um PRONTA antes do gate (X1): o veto certo e a prosa julgada, com dados ao vivo.
export const motivoContraOPronta = ({ carta, codigo, comentarios, relacoes, siglas, porId, prosaJulgada }) =>
  motivoDeVeto({ carta, codigo, comentarios, relacoes, siglas, porId }) ?? motivoDaProsa(linhasSuspeitas({ carta, comentarios }), prosaJulgada);

// D14: para a CLI, o que a carta em Backlog cita e as relações dela, cada uma com o estado.
export function resumoDasDependencias(carta, relacoes, porId, porCodigo) {
  const estadoDe = c => (c ? c.state?.name ?? '?' : 'fora da leitura');
  const relacoesLidas = relacoes && typeof relacoes === 'object'
    ? Object.fromEntries(Object.entries(relacoes).filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => [k, v.map(r => { const c = porId.get(formais.idDe(r)); return c ? `${c.sigla}-${c.sequence_id} (${estadoDe(c)})` : 'fora da leitura'; })]))
    : 'ilegíveis';
  const citados = codigosEm(textoDoHtml(carta.description_html)).map(codigo => ({ codigo, estado: estadoDe(porCodigo.get(codigo)) }));
  return { relacoes: relacoesLidas, codigosCitados: citados };
}

// Texto fixo do painel no comentário de intenção do preparo: a prosa da CLI não entra (D1).
export const COMENTARIO_PREPARO = 'Preparo do painel para o READY TO DEV: o juiz real só apontou o Backlog e/ou a declaração de dependências ausente; nada mais muda.';

const escapar = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// D12/W4: o comentário na carta quando o preparo saiu e o gate não (ou não se sabe se saiu).
const TEXTOS_PREPARADO = {
  PREPARADO_SEM_GATE: m => `O preparo foi aplicado, mas o READY TO DEV não saiu: ${m}. O próximo job confere a carta de novo.`,
  PREPARADO_GATE_INCERTO: m => `O preparo foi aplicado; ${m}. Conferir a carta antes de despachar.`,
};
export const htmlPreparado = (resultado, motivo) => `<p>[ZELADOR/v1 preparo=${resultado}]</p><p>${escapar(TEXTOS_PREPARADO[resultado](motivo))}</p>`;
