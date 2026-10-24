// Interações operacionais no card, distintas de comentários livres. Somente
// um comentário da identidade de serviço esperada pode virar handoff.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARCADOR = 'HANDOFF/v1 ';
const PAPEIS = new Set(['orquestracao', 'desenvolvedor', 'validador']);
const RESULTADOS = new Set(['proposta', 'em_andamento', 'concluido', 'impedido', 'rejeitado']);
const escapar = valor => String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function validarHandoff({ papel, tentativaId = null, resultado, evidencia, resumo }) {
  if (!PAPEIS.has(papel)) throw new Error('papel de handoff inválido');
  if (!RESULTADOS.has(resultado)) throw new Error('resultado de handoff inválido');
  if (papel !== 'orquestracao' && !UUID.test(tentativaId ?? '')) throw new Error('tentativa obrigatória para desenvolvedor ou validador');
  if (tentativaId !== null && !UUID.test(tentativaId)) throw new Error('tentativa inválida');
  if (typeof resumo !== 'string' || resumo.trim().length < 10 || resumo.length > 2000) throw new Error('resumo de handoff inválido');
  if (!Array.isArray(evidencia) || !evidencia.length || evidencia.length > 10 || evidencia.some(x =>
    typeof x !== 'string' || x.trim().length < 5 || x.length > 500)) throw new Error('evidência de handoff obrigatória');
  return { papel, tentativaId, resultado, resumo: resumo.trim(), evidencia: evidencia.map(x => x.trim()) };
}

export function codificarHandoff({ projetoId, cartaId, chaveIdempotencia, versaoCarta, ...entrada }) {
  if (![projetoId, cartaId, chaveIdempotencia].every(x => UUID.test(x ?? '')) || !Number.isFinite(Date.parse(versaoCarta))) {
    throw new Error('alvo ou versão de handoff inválidos');
  }
  const dados = { versao: 1, projetoId, cartaId, chaveIdempotencia, versaoCarta, ...validarHandoff(entrada) };
  const codigo = Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url');
  const tentativa = dados.tentativaId ? ` tentativa=${dados.tentativaId}` : '';
  return `<p>[ORQ/v1 papel=${dados.papel}${tentativa}] ${MARCADOR}${codigo}</p><p>${escapar(dados.resumo)}</p><ul>${dados.evidencia.map(x => `<li>${escapar(x)}</li>`).join('')}</ul>`;
}

export function handoffsDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  return interacoes.filter(e => e.texto?.startsWith(MARCADOR) && e.autorId === autorId).map(e => {
    let dados;
    try { dados = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8')); }
    catch { throw new Error('handoff do card ilegível'); }
    if (dados.versao !== 1 || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
        !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) {
      throw new Error('handoff do card não confere');
    }
    validarHandoff(dados);
    if (dados.papel !== e.papel || (dados.tentativaId ?? null) !== e.tentativaId) throw new Error('cabeçalho de handoff não confere');
    return { ...dados, comentarioId: e.id, autorId: e.autorId, quando: e.quando };
  });
}

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
