// Propostas de memória do C-3PO: monta a L1 nova (acrescentar ao fim ou trocar um trecho exato) contra a versão atual e guarda em memória com prazo. Nunca grava a memória.
//
// É o único pedaço da memória, além da leitura, que o motor alcança. Gravar mora em
// escritor-memoria.js, atrás do SSO do dono (api-memoria.js); o teste estrutural garante
// que nada que o motor importa chega lá.
import { randomUUID } from 'node:crypto';
import { UUID } from '../orquestrador/uuid.js';
import { criarLeitorMemoria, TETO_BYTES, bytesDe } from './arquivo-memoria.js';
import { diffMemoria } from './diff.js';

const PRAZO_MS = 30 * 60_000;
const TETO_PROPOSTAS = 20;
const MAX_TRECHO = 2_000;

export class RecusaMemoria extends Error {}

function textoNovo(atual, { acrescentar, de, para }) {
  const temAcrescimo = typeof acrescentar === 'string' && acrescentar.trim();
  const temTroca = typeof de === 'string' && de.length > 0;
  if (Boolean(temAcrescimo) === Boolean(temTroca)) throw new RecusaMemoria('proponha OU um acréscimo OU uma troca (de → para), um de cada vez');
  if (temAcrescimo) {
    if (acrescentar.length > MAX_TRECHO) throw new RecusaMemoria(`acréscimo acima de ${MAX_TRECHO} caracteres`);
    const sep = atual === '' || atual.endsWith('\n') ? '' : '\n';
    return `${atual}${sep}${acrescentar.trim()}\n`;
  }
  if (typeof para !== 'string' || para.length > MAX_TRECHO || de.length > MAX_TRECHO) throw new RecusaMemoria(`troca precisa de "para" e de trechos até ${MAX_TRECHO} caracteres`);
  const primeira = atual.indexOf(de);
  if (primeira < 0) throw new RecusaMemoria('o trecho "de" não existe na memória atual; copie-o exatamente');
  if (atual.indexOf(de, primeira + 1) >= 0) throw new RecusaMemoria('o trecho "de" aparece mais de uma vez; use um trecho maior e único');
  return atual.slice(0, primeira) + para + atual.slice(primeira + de.length);
}

export function criarRegistroMemoria({ ler = criarLeitorMemoria().ler, agora = () => Date.now(), prazoMs = PRAZO_MS } = {}) {
  const propostas = new Map();
  const limpar = () => { for (const [id, p] of propostas) if (p.expiraEm <= agora()) propostas.delete(id); };

  async function propor({ acrescentar, de, para, motivo } = {}) {
    limpar();
    if (typeof motivo !== 'string' || !motivo.trim()) throw new RecusaMemoria('diga o motivo da mudança');
    const atual = await ler();
    if (!['ok', 'ausente'].includes(atual.estado)) throw new RecusaMemoria(`a memória está ${atual.estado}; o Mestre precisa consertá-la antes`);
    const texto = textoNovo(atual.texto, { acrescentar, de, para });
    if (texto === atual.texto) throw new RecusaMemoria('a proposta não muda nada');
    if (bytesDe(texto) > TETO_BYTES) throw new RecusaMemoria(`a memória ficaria acima do teto de ${TETO_BYTES} bytes; proponha enxugar antes`);
    if (propostas.size >= TETO_PROPOSTAS) throw new RecusaMemoria('propostas de memória demais em aberto; espere uma expirar');
    const id = randomUUID();
    const p = { id, base: atual.hash, texto, motivo: motivo.trim().slice(0, 300), expiraEm: agora() + prazoMs };
    propostas.set(id, p);
    const diff = diffMemoria(atual.texto, texto);
    return { id, motivo: p.motivo, base: p.base, diff: diff.texto, bytes: bytesDe(texto), expiraEm: new Date(p.expiraEm).toISOString() };
  }

  function obter(id) {
    limpar();
    if (!UUID.test(id ?? '')) return null;
    const p = propostas.get(id);
    return p ? { id: p.id, base: p.base, texto: p.texto, motivo: p.motivo } : null;
  }

  // Aceita uma vez: depois disso a proposta some.
  const consumir = id => propostas.delete(id);

  return { propor, obter, consumir };
}

// Instância do processo: o motor propõe nela, a rota da memória lê dela.
export const propostasMemoria = criarRegistroMemoria();
