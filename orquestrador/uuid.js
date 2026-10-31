// Forma de um UUID do Plane ou do próprio painel, e o UUIDv5 determinístico (RFC 4122 §4.3). Não valida se o id existe.
import { createHash } from 'node:crypto';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Espaço de nomes do painel (fixo): o mesmo nome dá sempre a mesma chave, em qualquer instância.
const ESPACO_PAINEL = '6f1c5a2e-4b7d-5e8f-9a0b-1c2d3e4f5a6b';

export function uuidV5(nome, espaco = ESPACO_PAINEL) {
  if (!UUID.test(espaco)) throw new Error('espaço de nomes inválido');
  const h = createHash('sha1').update(Buffer.from(espaco.replaceAll('-', ''), 'hex')).update(String(nome), 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
