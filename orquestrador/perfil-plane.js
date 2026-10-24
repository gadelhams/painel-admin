// Perfil operacional versionado no comentário da carta. Apenas comentários da
// identidade de serviço configurada são autoritativos; texto livre nunca é.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARCADOR = 'PERFIL-IA/v1 ';

function uuid(valor) {
  if (!UUID.test(valor ?? '')) throw new Error('id de perfil inválido');
  return valor.toLowerCase();
}

const escapar = texto => String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function codificarPerfil({ projetoId, cartaId, chaveIdempotencia, versaoCarta, selecoes }) {
  const perfil = {
    versao: 1, projetoId: uuid(projetoId), cartaId: uuid(cartaId),
    chaveIdempotencia: uuid(chaveIdempotencia), versaoCarta,
    selecoes,
  };
  if (!Number.isFinite(Date.parse(versaoCarta))) throw new Error('versão da carta inválida');
  const dados = Buffer.from(JSON.stringify(perfil), 'utf8').toString('base64url');
  const resumo = Object.entries(selecoes).map(([papel, e]) =>
    `${escapar(papel)}: ${escapar(e.provedor)}/${escapar(e.modelo)}/${escapar(e.esforco)}`).join(' | ');
  return `<p>[ORQ/v1 papel=decisao] ${MARCADOR}${dados}</p><p>${resumo}</p>`;
}

export function perfisDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  return interacoes.filter(e => e.texto?.startsWith(MARCADOR) && e.autorId === autorId)
    .map(e => {
      const codificado = e.texto.slice(MARCADOR.length).split(/\s/)[0];
      let perfil;
      try { perfil = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8')); }
      catch { throw new Error('perfil IA do card ilegível'); }
      if (perfil.versao !== 1 || perfil.projetoId !== projetoId || perfil.cartaId !== cartaId ||
          !UUID.test(perfil.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(perfil.versaoCarta))) {
        throw new Error('perfil IA do card não confere');
      }
      return { ...perfil, comentarioId: e.id, quando: e.quando };
    });
}

export function criarEscritorPerfilPlane({ chave, projetoPermitido, autorEsperado, apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch }) {
  if (!chave || !UUID.test(projetoPermitido ?? '') || !UUID.test(autorEsperado ?? '')) throw new Error('identidade de escrita restrita ausente');
  const prefixo = `${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/work-items/`;
  return async ({ projetoId, cartaId, html, chaveIdempotencia }) => {
    if (projetoId !== projetoPermitido || !UUID.test(cartaId ?? '') || !UUID.test(chaveIdempotencia ?? '')) {
      throw new Error('projeto ou carta fora do escopo da identidade de escrita');
    }
    const resposta = await fetchImpl(`${prefixo}${cartaId}/comments/`, {
      method: 'POST',
      headers: { 'X-API-Key': chave, 'content-type': 'application/json' },
      body: JSON.stringify({ comment_html: html, external_source: 'orquestrador-perfil-v1', external_id: chaveIdempotencia }),
      signal: AbortSignal.timeout(15_000),
    });
    let comentario = await resposta.json().catch(() => ({}));
    if (resposta.status === 409 && UUID.test(comentario?.id ?? '')) {
      // 409 com id = external_id já gravado no card: a escrita anterior chegou; relê para conferir autoria.
      const releitura = await fetchImpl(`${prefixo}${cartaId}/comments/${comentario.id}/`,
        { headers: { 'X-API-Key': chave }, signal: AbortSignal.timeout(15_000) });
      if (!releitura.ok) throw new Error('Plane recusou o registro do perfil (HTTP 409 sem releitura)');
      comentario = await releitura.json();
    } else if (!resposta.ok) throw new Error(`Plane recusou o registro do perfil (HTTP ${resposta.status})`);
    if (!UUID.test(comentario.id ?? '')) throw new Error('Plane não confirmou o comentário do perfil');
    const autor = comentario.actor?.id ?? comentario.actor ?? comentario.created_by?.id ?? comentario.created_by;
    if (autor !== autorEsperado) throw new Error('Plane não confirmou a identidade de escrita esperada');
    return comentario.id;
  };
}
