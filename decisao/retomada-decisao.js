// O que a retomada pode fazer com uma aplicação pendente: reconfere o registro do diário (lista fechada, prosa, HTML) e recalcula o delta contra a carta ATUAL. Puro; não lê nem grava.
//
// Revisto pelo validador de invariantes (31/10/2026, A1.3 e A3.1): o diário é arquivo local
// editável, e a carta pode ter mudado desde a decisão. A retomada só segue se a carta ainda é
// a da decisão (mesma digital) ou já é a carta com o delta aplicado (a queda veio depois do
// PATCH); senão o dono abandona a pendência e prepara de novo.
import { cartaDaMesa, RecusaMesa } from './permissao.js';
import { codificarDecisao, validarProsa } from './protocolo-decisao.js';
import { calcularDelta, conferirDelta, digital, esperaDecisao, mesmoDelta, validarPedido } from './efeitos.js';

export const IDADE_MAXIMA_MS = 24 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const quandoDaDecisao = reg => (Number.isFinite(reg.quandoDecisao) ? reg.quandoDecisao : Date.parse(reg.quando));

// O registro de abertura ainda descreve uma decisão que a mesa grava? Projeto pelo catálogo,
// prosa e pedido pela régua do preparar, delta coerente com o pedido e o HTML refeito igual.
export function conferirRegistro(reg) {
  try {
    const alvo = cartaDaMesa(reg.identificador);
    if (alvo.projeto.projetoId !== reg.projetoId || alvo.sigla !== reg.sigla || alvo.numero !== reg.numero || !UUID.test(reg.cartaId ?? '')) {
      throw new Error('carta');
    }
    // Ambiente vazio aqui: o segredo já foi recusado no preparar; o que importa é a forma.
    const prosa = validarProsa({ decisao: reg.decisao, motivo: reg.motivo }, { ambiente: {} });
    if (prosa.decisao !== reg.decisao || prosa.motivo !== reg.motivo) throw new Error('prosa');
    const pedido = validarPedido(reg.pedido);
    const quando = quandoDaDecisao(reg);
    conferirDelta(reg.delta, pedido, { decisao: prosa.decisao, quando });
    const html = codificarDecisao({ identificador: alvo.identificador, decisao: prosa.decisao, motivo: prosa.motivo, efeitos: reg.delta.linhas ?? [], quando });
    if (html !== reg.html) throw new Error('html');
    return { pedido, quando };
  } catch {
    throw new RecusaMesa('o diário da mesa não confere com a decisão (registro editado ou de outra versão): nada foi aplicado; abandone a pendência', 409);
  }
}

// `r` é a releitura de agora. Devolve a fase ('original' ou 'aplicada') e o delta a usar, ou
// `{ ok: false, motivo }`. Na fase original o delta é RECALCULADO contra a carta de agora.
export function planoRetomada(reg, r, { agora, leaseAtivo }) {
  const { pedido, quando } = conferirRegistro(reg);
  if (leaseAtivo) return { ok: false, motivo: 'a carta tem execução da orquestração em curso (lease ativo)' };
  if (agora - Date.parse(reg.quando) > IDADE_MAXIMA_MS) return { ok: false, motivo: 'a pendência tem mais de 24 h' };
  const proprias = [reg.chave, `${reg.chave}:aplicacao`];
  if (digital(r, { proprias }) === reg.digital) {
    if (!esperaDecisao(r.carta)) return { ok: false, motivo: 'a carta não espera mais decisão do dono' };
    let delta;
    try { delta = calcularDelta(r, pedido, { decisao: reg.decisao, quando }); } catch (e) { return { ok: false, motivo: e.message }; }
    if (!mesmoDelta(delta, reg.delta)) return { ok: false, motivo: 'o efeito recalculado não é o da decisão' };
    return { ok: true, fase: 'original', delta, mudancas: delta.linhas };
  }
  if (reg.digitalAplicada && digital(r, { proprias, textoDescricao: true }) === reg.digitalAplicada) {
    return { ok: true, fase: 'aplicada', delta: reg.delta, mudancas: ['nada a aplicar: as mudanças já estão na carta; falta só verificar e gravar o recibo'] };
  }
  return { ok: false, motivo: 'a carta mudou desde a decisão' };
}

export const recusaRetomada = motivo =>
  new RecusaMesa(`${motivo}: a retomada não aplica o delta velho; abandone a pendência (e prepare de novo, se ainda quiser)`, 409);
