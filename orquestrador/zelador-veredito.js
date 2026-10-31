// Do JSON da CLI do zelador à mudança estruturada: forma fechada, evidências conferidas pelo painel, prosa filtrada e o HTML montado aqui. Não escreve no Plane.
//
// A CLI só propõe (J21–J23): o painel confere cada evidência no git e no Plane, e a CLI nunca
// escreve HTML. A prosa passa por dois filtros antes de ir ao comentário: segredo (J25) e
// marcadores de protocolo (J54: `GATE/`, `HANDOFF/`, `ZELADOR/`, `DECISAO/`, `[ORQ/`) — um
// texto de LLM com eles poderia forjar recibo. Trecho e texto novo nunca tocam marcador humano
// (`(DONO`, `(ASTARGNE`, `(BLOQUEADA`, ou ASTARGNE/DONO/BLOQUEADA sem parêntese) nem linha de
// dependência, e a descrição nova guarda intactas as linhas que os têm (J58, B7). Veredito que
// cai em qualquer regra vira MANTER, com o motivo, e nada é escrito.
import { createHash } from 'node:crypto';
import { DECISAO_HUMANA_NA_DESCRICAO } from './marcas-carta.js';
import { textoDeHtml } from '../decisao.js';

const VEREDITOS = Object.freeze(['MANTER', 'ATUALIZAR', 'FECHAR', 'CANCELAR', 'IA_DECIDE', 'DONO']);
const CAMPOS = new Set(['carta', 'veredito', 'evidencias', 'comentario', 'trecho', 'novoTrecho', 'labelsTrava']);
const TRAVAS_PERMITIDAS = [['ASTARGNE'], ['ASTARGNE', 'PRODUTO'], ['TAREFA DONO'], ['BLOQUEADA']];
const MARCADORES_PROIBIDOS = /GATE\/|HANDOFF\/|ZELADOR\/|DECISAO\/|\[ORQ\//i;
// A lista do juiz (DECISAO_HUMANA_NA_DESCRICAO) mais as formas sem parêntese: "dono" minúsculo é
// palavra comum, por isso só DONO/BLOQUEADA em maiúsculas; ASTARGNE é nome, em qualquer caixa.
const MARCADORES_HUMANOS = [DECISAO_HUMANA_NA_DESCRICAO, /astargne/i, /\b(?:DONO|BLOQUEADA)\b/u, /depende\s+d[aeo]|depend[eê]ncias\s*:/i];
const tocaMarcadorHumano = t => MARCADORES_HUMANOS.some(r => r.test(String(t ?? '')));
export const RESULTADOS_RECIBO = Object.freeze(['APLICADO', 'ABORTADO', 'DIVERGENTE', 'DESFEITO']);
// Formas de credencial conhecidas e blocos longos com maiúscula, minúscula e dígito (um sha
// em hexadecimal não cai aqui): na dúvida, recusa.
const SEGREDO = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|plane_api_[A-Za-z0-9]{8,}|\b(?=[\w+/-]*[A-Z])(?=[\w+/-]*[a-z])(?=[\w+/-]*\d)[\w+/-]{32,}={0,2})/;
const SEGREDO_ROTULADO = /(?:senha|password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S{6,}/i;

const escapar = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const canonico = v => (Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}` : JSON.stringify(v));

// Saída estrita: um objeto JSON, opcionalmente dentro de uma única cerca ```json.
export function lerSaidaCli(texto) {
  let t = String(texto ?? '').trim();
  const cerca = /^```(?:json)?\n([\s\S]*)\n```$/.exec(t);
  if (cerca) t = cerca[1].trim();
  const dados = JSON.parse(t);
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || Object.keys(dados).join() !== 'vereditos' || !Array.isArray(dados.vereditos)) {
    throw new Error('saída da CLI fora da forma {vereditos:[…]}');
  }
  if (dados.vereditos.length > 60) throw new Error('vereditos demais na saída da CLI');
  return dados.vereditos;
}

// Motivo para recusar a prosa, ou null.
export function prosaRecusada(texto) {
  if (typeof texto !== 'string') return 'texto ausente';
  if (MARCADORES_PROIBIDOS.test(texto)) return 'prosa com marcador de protocolo';
  if (SEGREDO.test(texto) || SEGREDO_ROTULADO.test(texto)) return 'prosa com forma de segredo';
  if (/<[a-z/!]/i.test(texto)) return 'prosa com HTML';
  return null;
}

// `external_id` = hash da mudança estruturada + digital de antes + a tentativa (J62, B15): nunca
// da prosa; a tentativa (um UUID por PENDENTE) faz o mesmo veredito depois de um ABORTADO ganhar
// chave nova em vez de bater no 409 da intenção antiga.
export const chaveDaMudanca = (cartaId, mudanca, digitalAntes, tentativa) => createHash('sha256').update(canonico({ cartaId, mudanca, digitalAntes, tentativa })).digest('hex');

// B6: a lista fechada, na forma exata que `mudancaDo` produz. O escritor e a reconciliação
// conferem por aqui antes de escrever — um PENDENTE adulterado no disco não passa.
export function mudancaNaListaFechada(m) {
  const chaves = m && typeof m === 'object' && !Array.isArray(m) ? Object.keys(m).sort().join() : '';
  const lista = v => Array.isArray(v) && v.every(x => typeof x === 'string');
  if (m?.tipo === 'estado') return chaves === 'grupo,tipo' && ['completed', 'cancelled'].includes(m.grupo);
  if (m?.tipo === 'labels') {
    if (chaves !== 'adicionar,remover,tipo' || !lista(m.adicionar) || !lista(m.remover)) return false;
    if (!m.adicionar.length) return m.remover.length === 1 && m.remover[0] === 'ASTARGNE';
    return !m.remover.length && TRAVAS_PERMITIDAS.some(p => [...p].sort().join() === [...new Set(m.adicionar)].sort().join() && p.length === m.adicionar.length);
  }
  if (m?.tipo === 'anexar') return chaves === 'texto,tipo' && typeof m.texto === 'string' && !tocaMarcadorHumano(m.texto);
  if (m?.tipo === 'trecho') return chaves === 'novoTrecho,tipo,trecho' && typeof m.trecho === 'string' && typeof m.novoTrecho === 'string' && !tocaMarcadorHumano(m.trecho) && !tocaMarcadorHumano(m.novoTrecho);
  return false;
}

// HTML do Plane como texto (B20): o Plane passa o HTML pelo nh3, então byte a byte o que se
// gravou não volta igual; a comparação é do texto decodificado com o espaço normalizado.
export const textoDoHtml = html => textoDeHtml(html, Infinity).replace(/\s+/g, ' ').trim();
export const mesmoTexto = (a, b) => textoDoHtml(a) === textoDoHtml(b);

function mudancaDo(v) {
  switch (v.veredito) {
    case 'FECHAR': return { tipo: 'estado', grupo: 'completed' };
    case 'CANCELAR': return { tipo: 'estado', grupo: 'cancelled' };
    case 'IA_DECIDE': return { tipo: 'labels', adicionar: [], remover: ['ASTARGNE'] };
    case 'DONO': {
      const pedidas = [...new Set(v.labelsTrava ?? ['ASTARGNE'])].sort();
      if (!TRAVAS_PERMITIDAS.some(p => [...p].sort().join() === pedidas.join())) throw new Error('etiquetas de trava fora da lista (PRODUTO só junto com ASTARGNE)');
      return { tipo: 'labels', adicionar: pedidas, remover: [] };
    }
    case 'ATUALIZAR':
      if (typeof v.novoTrecho !== 'string' || !v.novoTrecho.trim() || v.novoTrecho.length > 2000) throw new Error('texto novo ausente ou longo demais');
      if (v.trecho !== undefined && (typeof v.trecho !== 'string' || v.trecho.length < 8 || v.trecho.length > 2000)) throw new Error('trecho inválido');
      for (const t of [v.trecho, v.novoTrecho]) if (typeof t === 'string' && tocaMarcadorHumano(t)) throw new Error('o trecho toca marcador de decisão ou linha de dependência');
      return v.trecho === undefined ? { tipo: 'anexar', texto: v.novoTrecho.trim() } : { tipo: 'trecho', trecho: v.trecho, novoTrecho: v.novoTrecho.trim() };
    default: return null;
  }
}

/**
 * Valida um veredito da CLI. ctx: { cartasPorIdentificador, candidatas (Set de identificadores),
 * git (GitZelador), pasta }. Devolve { identificador, veredito, mudanca, evidencias, comentario }
 * ou { identificador, veredito: 'MANTER', recusado: motivo }.
 */
export async function validarVeredito(v, { cartasPorIdentificador, candidatas, git, pasta }) {
  const identificador = typeof v?.carta === 'string' ? v.carta : null;
  const manter = motivo => ({ identificador, veredito: 'MANTER', recusado: motivo, proposto: VEREDITOS.includes(v?.veredito) ? v.veredito : null });
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !CAMPOS.has(k))) return manter('veredito fora da forma fechada');
  if (!identificador || !candidatas.has(identificador)) return manter('carta fora das candidatas do retrato');
  if (!VEREDITOS.includes(v.veredito)) return manter('veredito desconhecido');
  if (v.veredito === 'MANTER') return { identificador, veredito: 'MANTER', recusado: null };
  let mudanca;
  try { mudanca = mudancaDo(v); } catch (e) { return manter(e.message); }
  const recusaProsa = prosaRecusada(v.comentario) ?? (v.comentario.trim().length < 15 || v.comentario.length > 1500 ? 'comentário curto ou longo demais' : null)
    ?? (mudanca.tipo === 'trecho' ? prosaRecusada(v.novoTrecho) ?? prosaRecusada(v.trecho) : mudanca.tipo === 'anexar' ? prosaRecusada(v.novoTrecho) : null);
  if (recusaProsa) return manter(recusaProsa);
  if (!Array.isArray(v.evidencias) || !v.evidencias.length || v.evidencias.length > 8) return manter('sem evidência');
  const evidencias = [];
  for (const e of v.evidencias) {
    if (e?.tipo === 'commit') {
      const r = await git.commitNoPrincipal(pasta, e.sha);
      if (r.ok) evidencias.push({ tipo: 'commit', texto: `commit ${String(e.sha).slice(0, 12)} no ramo ${r.principal}` });
    } else if (e?.tipo === 'arquivo') {
      const r = await git.arquivoRastreado(pasta, e.caminho, e.linha);
      if (r.ok) evidencias.push({ tipo: 'arquivo', texto: `arquivo ${r.caminho}` });
    } else if (e?.tipo === 'carta' && typeof e.carta === 'string' && cartasPorIdentificador.has(e.carta) && e.carta !== identificador) {
      evidencias.push({ tipo: 'carta', texto: `carta ${e.carta}` });
    }
  }
  if (!evidencias.length) return manter('nenhuma evidência conferiu');
  if (v.veredito === 'FECHAR' && !evidencias.some(e => e.tipo === 'commit')) return manter('fechar exige commit no ramo principal');
  return { identificador, veredito: v.veredito, mudanca, evidencias, comentario: v.comentario.trim(), recusado: null };
}

const DESCRICAO_MUDANCA = {
  estado: m => `estado → ${m.grupo === 'completed' ? 'Done' : 'Cancelled'}`,
  labels: m => [m.adicionar.length && `pôr ${m.adicionar.join(' + ')}`, m.remover.length && `tirar ${m.remover.join(', ')}`].filter(Boolean).join('; '),
  trecho: () => 'trocar um trecho da descrição',
  anexar: () => 'anexar um parágrafo à descrição',
};
const descreverMudanca = m => DESCRICAO_MUDANCA[m.tipo](m);

// O prefixo fixo é do painel (J54): é por ele que se reconhece um comentário do zelador.
export function htmlIntencao({ veredito, chave, comentario, evidencias, mudanca }) {
  return `<p>[ZELADOR/v1 veredito=${veredito} chave=${chave.slice(0, 16)}]</p><p>${escapar(comentario)}</p>`
    + `<p>Mudança: ${escapar(descreverMudanca(mudanca))}. Evidências conferidas pelo painel:</p><ul>${evidencias.map(e => `<li>${escapar(e.texto)}</li>`).join('')}</ul>`;
}

const TEXTO_RECIBO = {
  APLICADO: () => 'Mudança aplicada e conferida em releitura.',
  DESFEITO: () => 'Mudança aplicada e depois desfeita por outro ator; o zelador não a refaz.',
};

export function htmlRecibo({ chave, resultado, motivo }) {
  const texto = TEXTO_RECIBO[resultado]?.() ?? `Mudança não aplicada: ${escapar(motivo ?? 'a carta mudou antes da escrita')}.`;
  return `<p>[ZELADOR/v1 recibo=${resultado} chave=${chave.slice(0, 16)}]</p><p>${texto}</p>`;
}

// Linhas de texto da descrição que têm marcador humano ou de dependência (B7).
const linhasMarcadas = html => textoDeHtml(html, Infinity).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(tocaMarcadorHumano);

// A descrição nova: o trecho tem de aparecer UMA vez (cru ou escapado); o texto novo entra
// escapado; nenhuma linha com marcador humano muda, some ou nasce (B7).
export function novaDescricao(html, mudanca) {
  const atual = String(html ?? '');
  let nova = null;
  if (mudanca.tipo === 'anexar') nova = `${atual}<p>${escapar(mudanca.texto)}</p>`;
  for (const forma of mudanca.tipo === 'trecho' ? [mudanca.trecho, escapar(mudanca.trecho)] : []) {
    const n = atual.split(forma).length - 1;
    if (n > 1) throw new Error('trecho aparece mais de uma vez na descrição');
    if (n === 1) { nova = atual.replace(forma, () => escapar(mudanca.novoTrecho)); break; }
  }
  if (nova === null) throw new Error('trecho não achado na descrição');
  if (linhasMarcadas(atual).join('\n') !== linhasMarcadas(nova).join('\n')) throw new Error('a mudança tocaria linha com marcador humano ou de dependência');
  return nova;
}
