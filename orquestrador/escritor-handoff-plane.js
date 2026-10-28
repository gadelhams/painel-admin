// Grava o comentário de handoff. O texto HANDOFF/v1 mora em protocolo-handoff.js.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarEscritorHandoffPlane({ chave, projetoPermitido, autorEsperado,
  apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch }) {
  if (!chave || !UUID.test(projetoPermitido ?? '') || !UUID.test(autorEsperado ?? '')) throw new Error('identidade de escrita restrita ausente');
  return async ({ projetoId, cartaId, html, chaveIdempotencia }) => {
    if (projetoId !== projetoPermitido || !UUID.test(cartaId ?? '') || !UUID.test(chaveIdempotencia ?? '')) {
      throw new Error('projeto ou carta fora do escopo da identidade de escrita');
    }
    const resposta = await fetchImpl(`${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/work-items/${cartaId}/comments/`, {
      method: 'POST', headers: { 'X-API-Key': chave, 'content-type': 'application/json' },
      body: JSON.stringify({ comment_html: html, external_source: 'orquestrador-handoff-v1', external_id: chaveIdempotencia }),
      signal: AbortSignal.timeout(15_000),
    });
    let comentario = await resposta.json().catch(() => ({}));
    if (resposta.status === 409 && UUID.test(comentario?.id ?? '')) {
      // 409 com id = external_id já gravado no card: a escrita anterior chegou; relê para conferir autoria.
      const releitura = await fetchImpl(`${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/work-items/${cartaId}/comments/${comentario.id}/`,
        { headers: { 'X-API-Key': chave }, signal: AbortSignal.timeout(15_000) });
      if (!releitura.ok) throw new Error('Plane recusou o handoff (HTTP 409 sem releitura)');
      comentario = await releitura.json();
    } else if (!resposta.ok) throw new Error(`Plane recusou o handoff (HTTP ${resposta.status})`);
    const autor = comentario.actor?.id ?? comentario.actor ?? comentario.created_by?.id ?? comentario.created_by;
    if (!UUID.test(comentario.id ?? '') || autor !== autorEsperado) throw new Error('Plane não confirmou o handoff e sua autoria');
    return comentario.id;
  };
}
