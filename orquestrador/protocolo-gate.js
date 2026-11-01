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
// lista fechada. Cada autor só vale com a SUA fonte (`autores`): a identidade técnica do projeto
// com `orquestrador-gate-v1` (origem `dono`), o zelador com `zelador-gate-v1` (origem `zelador`)
// e só para READY TO DEV (J59, F4b) — a fonte do outro, no comentário de um, não vale.
const FONTE_GATE_DONO = 'orquestrador-gate-v1';
export const FONTE_GATE_ZELADOR = 'zelador-gate-v1';
export const FONTES_GATE = new Map([[FONTE_GATE_DONO, 'dono'], [FONTE_GATE_ZELADOR, 'zelador']]);
const TODOS_OS_GATES = Object.freeze([...GATES]);
export const autorDoProjeto = autorId => ({ autorId, fontes: [FONTE_GATE_DONO], gates: TODOS_OS_GATES });
export const autorZelador = autorId => ({ autorId, fontes: [FONTE_GATE_ZELADOR], gates: ['READY TO DEV'] });

// Recibo só vale com o cabeçalho `[ORQ/v1 papel=decisao]`, autor aceito, fonte da lista fechada e
// sem edição depois de criado (J54, J74). O que não passa fica de fora e é anotado: um recibo
// malformado do autor não derruba a leitura da carta (o DoS da variante do J54).
// `autorId` sozinho = só a identidade do projeto (autorDoProjeto); `autores` = a lista aceita.
export function lerGatesDoCanal(interacoes, { projetoId, cartaId, autorId = null, autores = autorId ? [autorDoProjeto(autorId)] : [] }) {
  if (!autores.length || autores.some(a => !UUID.test(a?.autorId ?? ''))) throw new Error('identidade de escrita não configurada');
  const gates = [];
  const ignorados = [];
  for (const e of interacoes) {
    if (!e.texto?.includes(MARCADOR)) continue;
    const ignorar = motivo => ignorados.push({ comentarioId: e.id ?? null, motivo });
    const autor = autores.find(a => a.autorId === e.autorId);
    if (!autor) { ignorar('autor não aceito'); continue; }
    if (e.papel !== 'decisao' || !e.texto.startsWith(MARCADOR)) { ignorar('sem o cabeçalho [ORQ/v1 papel=decisao]'); continue; }
    if (!FONTES_GATE.has(e.fonteExterna) || !autor.fontes.includes(e.fonteExterna)) { ignorar('fonte externa fora da lista'); continue; }
    if (e.editadoEm) { ignorar('editado depois de criado'); continue; }
    let dados;
    try { dados = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8')); }
    catch { ignorar('ilegível'); continue; }
    if (dados?.versao !== 1 || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
        !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) { ignorar('não confere com a carta'); continue; }
    try { validarPropostaGate(dados); } catch { ignorar('proposta fora da forma'); continue; }
    if (!autor.gates.includes(dados.gate)) { ignorar('gate fora do que este autor pode marcar'); continue; }
    gates.push({ ...dados, comentarioId: e.id, autorId: e.autorId, quando: e.quando, origemGate: FONTES_GATE.get(e.fonteExterna) });
  }
  return { gates, ignorados };
}

export function gatesDoCanal(interacoes, alvo) {
  return lerGatesDoCanal(interacoes, alvo).gates;
}
