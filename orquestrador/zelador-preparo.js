// O preparo do PRONTA (PAINEL-62): as regras puras que decidem se o painel pode tirar a carta do Backlog e/ou declarar "Dependências: nenhuma" antes do gate. Não lê Plane nem escreve.
//
// Decisão do dono (01/11/2026): "a ideia do zelador é justamente validar as dependências e retirar
// do backlog". O desenho congelado é o parecer do validador de invariantes (D1–D15):
// - o preparo só nasce do juiz real (`preavaliar`): identidade de gate, nenhum gate na carta e
//   pendências contidas nos dois motivos do preparo (D4); o estado só sai do grupo backlog;
// - anti-lavagem (D6; J1 da correção: vale para QUALQUER preparo, também o que só tira do
//   Backlog): a descrição (fora das linhas que declaram "sem dependências") e os comentários de
//   não-zelador não citam outra carta, a descrição não fala de dependência em prosa, e as relações
//   vêm na forma do Plane (as três de dependência presentes como lista) sem nenhum tipo além de
//   bloquear/antes;
// - estado alvo (D13): o de grupo unstarted com o menor `sequence`, nunca um bloqueado/em espera;
//   `sequence` ausente ou empate recusa.
// Resíduo declarado: dependência em prosa sem código e sem esse vocabulário só a CLI julga.
import { MOTIVO_DECLARACAO, MOTIVO_ESTADO, MOTIVOS_DO_PREPARO, ehZelador } from './zelador-politica.js';
import { textoDoHtml } from './zelador-veredito.js';
import { RelacoesFormais } from './relacoes-formais.js';
import { textoDeHtml } from '../decisao.js';
import { ESTADO_BLOQUEADO, VOCABULARIO_DEPENDENCIA, linhaDeclaraSem } from './texto-dependencia.js';

const CODIGO_CARTA = /\b[A-Za-z][A-Za-z0-9]{1,15}-\d+\b/g;
const RELACOES_DE_DEPENDENCIA = ['blocked_by', 'start_after', 'finish_after'];
const RELACOES_ACEITAS = new Set(['blocking', 'start_before', 'finish_before']);
const formais = new RelacoesFormais();

// Os códigos SIGLA-N de um texto, em maiúsculas e sem repetição.
export const codigosEm = texto => [...new Set((String(texto ?? '').match(CODIGO_CARTA) ?? []).map(x => x.toUpperCase()))];

// As linhas visíveis de uma descrição, com o espaço normalizado.
export const linhasDoTexto = html => textoDeHtml(html, Infinity).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
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

// D6 (J1: qualquer preparo): motivo para NÃO preparar, ou null. `codigo` = SIGLA-N da própria
// carta. As linhas que já declaram "sem dependências" saem da varredura: são a declaração, não prosa.
export function motivoContraOPreparo({ carta, codigo, comentarios, relacoes }) {
  const formalize = 'formalize a relação no Plane';
  const alheio = c => c !== String(codigo).toUpperCase();
  const descricao = linhasDoTexto(carta.description_html).filter(l => !linhaDeclaraSem(l)).join('\n');
  const citados = codigosEm(descricao).filter(alheio);
  if (citados.length) return `a descrição cita ${citados[0]}; ${formalize}`;
  if (VOCABULARIO_DEPENDENCIA.test(descricao)) return `a descrição fala de dependência em prosa; ${formalize}`;
  if (!Array.isArray(comentarios)) return 'comentários ilegíveis; o preparo não sai';
  for (const c of comentarios.filter(x => !ehZelador(x))) {
    const noComentario = codigosEm(textoDoHtml(c.comment_html)).filter(alheio);
    if (noComentario.length) return `um comentário cita ${noComentario[0]}; ${formalize}`;
  }
  if (assinaturaRelacoes(relacoes) === null) return 'relações do Plane ilegíveis ou fora da forma; o preparo não sai';
  const outra = Object.keys(relacoes).find(k => relacoes[k].length && !RELACOES_ACEITAS.has(k));
  if (outra) return `relação ${outra} na carta; ${formalize}`;
  return null;
}

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

// D12: o comentário na carta quando o preparo saiu e o gate não.
export const htmlPreparadoSemGate = motivo => '<p>[ZELADOR/v1 preparo=PREPARADO_SEM_GATE]</p>'
  + `<p>O preparo foi aplicado, mas o READY TO DEV não saiu: ${escapar(motivo)}. O próximo job confere a carta de novo.</p>`;
