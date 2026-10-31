// Grava o comentário RESERVA/v1 (ou a liberação) na carta, pela identidade técnica do projeto. O texto mora em reserva-servico.js.

import { UUID } from './uuid.js';

export const ORIGEM_RESERVA = 'orquestrador-reserva-v1';

export function criarEscritorReservaPlane({ chave, projetoPermitido, autorEsperado,
  apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch }) {
  if (!chave || !UUID.test(projetoPermitido ?? '') || !UUID.test(autorEsperado ?? '')) throw new Error('identidade de escrita restrita ausente');
  return async ({ projetoId, cartaId, html, externalId }) => {
    if (projetoId !== projetoPermitido || !UUID.test(cartaId ?? '') || !/^[\w:.-]{16,120}$/.test(externalId ?? '') || !String(html).startsWith('<p>RESERVA/v1 ')) {
      throw new Error('reserva fora do escopo da identidade de escrita');
    }
    // Uma cópia da chave por operação (J56).
    const k = typeof chave === 'function' ? await chave() : chave;
    const url = `${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/work-items/${cartaId}/comments/`;
    const r = await fetchImpl(url, { method: 'POST', headers: { 'X-API-Key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ comment_html: html, external_source: ORIGEM_RESERVA, external_id: externalId }), signal: AbortSignal.timeout(15_000) });
    let comentario = await r.json().catch(() => ({}));
    if (r.status === 409 && UUID.test(comentario?.id ?? '')) {
      // 409 = o external_id já está no card: a escrita anterior chegou; relê para conferir o autor.
      const releitura = await fetchImpl(`${url}${comentario.id}/`, { headers: { 'X-API-Key': k }, signal: AbortSignal.timeout(15_000) });
      if (!releitura.ok) throw new Error('Plane recusou a reserva (HTTP 409 sem releitura)');
      comentario = await releitura.json();
    } else if (!r.ok) throw new Error(`Plane recusou a reserva (HTTP ${r.status})`);
    const autor = comentario.actor?.id ?? comentario.actor ?? comentario.created_by?.id ?? comentario.created_by;
    if (!UUID.test(comentario.id ?? '') || autor !== autorEsperado) throw new Error('Plane não confirmou a reserva e sua autoria');
    return comentario.id;
  };
}
