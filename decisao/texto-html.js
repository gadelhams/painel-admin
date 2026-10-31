// HTML do Plane ⇄ texto da mesa: escape do que vai para o comentário e texto puro do que vem da descrição e dos comentários. Puro.

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Descrição e comentário do Plane são HTML de terceiros: para a gaveta e para o C-3PO viram texto.
export function textoDeHtml(html, max = 6_000) {
  const texto = String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|li|h[1-6]|div|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    // Uma passada só: "&amp;#71;" é o texto "&#71;", nunca "G" (decodificar duas vezes forjaria prefixos).
    .replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp|#(\d{1,7}));/g, (e, n) => (n === undefined ? ENTIDADES[e]
      : String.fromCodePoint(Number(n) <= 0x10ffff ? Number(n) : 0xfffd)))
    .replace(/\n{3,}/g, '\n\n').trim();
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}
