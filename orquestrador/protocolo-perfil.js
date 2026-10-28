// Texto PERFIL-IA/v1. Comentário livre não vira perfil.

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
