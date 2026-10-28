// Lê os comentários do card. A forma de cada um mora em interacao-canal.js.

import { normalizarInteracao, validarAlvoCanal } from './interacao-canal.js';

export { normalizarInteracao, validarAlvoCanal };

export async function lerCanalPlane({ consultar, projetoId, cartaId }) {
  validarAlvoCanal(projetoId, cartaId);
  const prefixo = `/projects/${projetoId}/work-items/${cartaId}`;
  const carta = await consultar(`${prefixo}/`);
  if (carta.id !== cartaId) throw new Error('card do Plane não confere');
  const interacoes = [];
  let cursor = null;
  do {
    const url = `${prefixo}/comments/?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const pagina = await consultar(url);
    if (!Array.isArray(pagina.results)) throw new Error('comentários do Plane indisponíveis');
    interacoes.push(...pagina.results.map(normalizarInteracao));
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return { cartaId, projetoId, fonte: 'Plane', interacoes };
}
