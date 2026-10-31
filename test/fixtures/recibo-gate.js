// Recibo GATE/v1 e atividade de etiqueta no formato que o Plane real devolve (F4a: J54, J55, J74), para os Planes falsos dos testes.
import { randomUUID } from 'node:crypto';
import { codificarGate } from '../../orquestrador/gate-plane.js';

export const FONTE_GATE = 'orquestrador-gate-v1';
const ID_ETIQUETA = { 'READY TO DEV': '0a0a0a0a-0000-4000-8000-00000000d0d0', 'READY TO TEST': '0b0b0b0b-0000-4000-8000-00000000e0e0' };
export const etiqueta = nome => ({ id: ID_ETIQUETA[nome] ?? randomUUID(), name: nome });

// O comentário que o escritor de gate grava: cabeçalho papel=decisao, fonte da lista e sem edição.
export function reciboGate({ autor, quando, ...gate }) {
  return { id: randomUUID(), actor: autor, created_at: quando, edited_at: null, external_source: FONTE_GATE,
    external_id: gate.chaveIdempotencia, comment_html: codificarGate(gate) };
}

export function atividadeEtiqueta({ nome, autor, quando, removida = false, id = etiqueta(nome).id }) {
  return { id: randomUUID(), verb: 'updated', field: 'labels', actor: autor, created_at: quando,
    ...(removida ? { old_value: nome, old_identifier: id, new_value: '', new_identifier: null } : { old_value: '', new_value: nome, new_identifier: id }) };
}

// Para os Planes falsos que não modelam o histórico: cada gate atual da carta foi posto pelo
// autor no mesmo instante do recibo mais recente dele (o caminho feliz do escritor de gate).
export function atividadesDoCaminhoFeliz(carta, comentarios, autor) {
  const ultimo = comentarios.filter(c => c.external_source === FONTE_GATE).map(c => c.created_at).sort().at(-1) ?? carta.updated_at;
  return (carta.labels ?? []).filter(l => ID_ETIQUETA[l.name]).map(l => atividadeEtiqueta({ nome: l.name, autor, quando: ultimo, id: l.id }));
}
