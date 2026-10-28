// Texto GATE/v1: valida a proposta, codifica o comentário e lê a evidência.

import { UUID } from './uuid.js';
export const GATES = new Set(['READY TO DEV', 'READY TO TEST']);
const MARCADOR = 'GATE/v1 ';
const escapar = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function validarPropostaGate({ gate, justificativa, evidencias }) {
  if (!GATES.has(gate)) throw new Error('gate inválido');
  if (typeof justificativa !== 'string' || justificativa.trim().length < 10 || justificativa.length > 2000) {
    throw new Error('justificativa de gate inválida');
  }
  if (!Array.isArray(evidencias) || evidencias.length < 1 || evidencias.length > 10 || evidencias.some(x =>
    typeof x !== 'string' || x.trim().length < 5 || x.length > 500)) throw new Error('evidências do gate obrigatórias');
  return { gate, justificativa: justificativa.trim(), evidencias: evidencias.map(x => x.trim()) };
}

export function codificarGate({ projetoId, cartaId, chaveIdempotencia, versaoCarta, ...proposta }) {
  if (![projetoId, cartaId, chaveIdempotencia].every(x => UUID.test(x ?? '')) || !Number.isFinite(Date.parse(versaoCarta))) {
    throw new Error('alvo ou versão de gate inválidos');
  }
  const dados = { versao: 1, projetoId, cartaId, chaveIdempotencia, versaoCarta,
    ...validarPropostaGate(proposta) };
  return `<p>[ORQ/v1 papel=decisao] ${MARCADOR}${Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url')}</p>` +
    `<p>${escapar(dados.gate)}: ${escapar(dados.justificativa)}</p><ul>${dados.evidencias.map(x => `<li>${escapar(x)}</li>`).join('')}</ul>`;
}

export function gatesDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  return interacoes.filter(e => e.autorId === autorId && e.texto?.startsWith(MARCADOR)).map(e => {
    let dados;
    try { dados = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8')); }
    catch { throw new Error('evidência de gate ilegível'); }
    if (dados.versao !== 1 || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
        !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) {
      throw new Error('evidência de gate não confere');
    }
    validarPropostaGate(dados);
    return { ...dados, comentarioId: e.id, autorId: e.autorId, quando: e.quando };
  });
}
