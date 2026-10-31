// Texto GATE/v1: valida a proposta, codifica o comentário e lê a evidência (recibo endurecido: J54, J74).

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

// Fontes externas aceitas num recibo GATE/v1, com a origem do gate que cada uma prova (J70):
// lista fechada; o escritor do zelador (F4b) entra aqui com a origem `zelador`.
export const FONTES_GATE = new Map([['orquestrador-gate-v1', 'dono']]);

// Recibo só vale com o cabeçalho `[ORQ/v1 papel=decisao]`, autor aceito, fonte da lista fechada e
// sem edição depois de criado (J54, J74). O que não passa fica de fora e é anotado: um recibo
// malformado do autor não derruba a leitura da carta (o DoS da variante do J54).
export function lerGatesDoCanal(interacoes, { projetoId, cartaId, autorId, fontes = FONTES_GATE }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  const gates = [];
  const ignorados = [];
  for (const e of interacoes) {
    if (!e.texto?.includes(MARCADOR)) continue;
    const ignorar = motivo => ignorados.push({ comentarioId: e.id ?? null, motivo });
    if (e.autorId !== autorId) { ignorar('autor não aceito'); continue; }
    if (e.papel !== 'decisao' || !e.texto.startsWith(MARCADOR)) { ignorar('sem o cabeçalho [ORQ/v1 papel=decisao]'); continue; }
    if (!fontes.has(e.fonteExterna)) { ignorar('fonte externa fora da lista'); continue; }
    if (e.editadoEm) { ignorar('editado depois de criado'); continue; }
    let dados;
    try { dados = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8')); }
    catch { ignorar('ilegível'); continue; }
    if (dados?.versao !== 1 || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
        !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) { ignorar('não confere com a carta'); continue; }
    try { validarPropostaGate(dados); } catch { ignorar('proposta fora da forma'); continue; }
    gates.push({ ...dados, comentarioId: e.id, autorId: e.autorId, quando: e.quando, origemGate: fontes.get(e.fonteExterna) });
  }
  return { gates, ignorados };
}

export function gatesDoCanal(interacoes, alvo) {
  return lerGatesDoCanal(interacoes, alvo).gates;
}
