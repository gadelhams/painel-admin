// O card do Plane é o canal canônico entre orquestrador, executor e validador.
// Esta porta só lê; escrita futura usa outra identidade e outra implementação.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarAlvoCanal(projetoId, cartaId) {
  if (!UUID.test(projetoId ?? '') || !UUID.test(cartaId ?? '')) throw new Error('projeto ou carta inválido');
}

export function normalizarInteracao(comentario) {
  const bruto = String(comentario.comment_html ?? comentario.comment ?? '')
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim();
  const cabecalho = /^\[ORQ\/v1 papel=(orquestracao|desenvolvedor|validador|decisao|resultado)(?: tentativa=([0-9a-f-]{36}))?\]\s*/i.exec(bruto);
  return {
    id: comentario.id,
    quando: comentario.created_at ?? null,
    autor: comentario.actor?.display_name ?? comentario.actor?.name ?? comentario.created_by?.display_name ?? 'autor não identificado',
    autorId: typeof comentario.actor === 'string' ? comentario.actor : comentario.actor?.id ??
      (typeof comentario.created_by === 'string' ? comentario.created_by : comentario.created_by?.id ?? null),
    papel: cabecalho?.[1]?.toLowerCase() ?? 'geral',
    tentativaId: cabecalho?.[2] ?? null,
    texto: cabecalho ? bruto.slice(cabecalho[0].length).trim() : bruto,
  };
}

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
