// Neutraliza, num texto que vai ao modelo como DADO, tudo o que tem cara de uma das marcas que o delimitam (tags como memoria_l1 e linhas como <<<FIM>>>). Puro; não lê nem grava.
//
// Só a forma exata não basta (validador, 31/10/2026, B4.1/B4.3): o modelo lê "< /memoria_l1 >",
// "&lt;/memoria_l1&gt;", "＜/memoria_l1＞" ou o nome com um caractere invisível no meio como a
// mesma marca. Por isso o texto é normalizado antes (NFKC, sem invisíveis, entidades de "<" e
// ">" decodificadas) e o "<" de toda marca vira "‹" (U+2039): visível, e não é mais "<".

const INVISIVEIS = /[­᠎​-‏‪-‮⁠-⁩﻿]/g;
const MENOR = /&(?:lt|#0*60|#x0*3c);?/gi;
const MAIOR = /&(?:gt|#0*62|#x0*3e);?/gi;
const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizarTexto = texto => String(texto ?? '').normalize('NFKC').replace(INVISIVEIS, '').replace(MENOR, '<').replace(MAIOR, '>');

// `tags`: nomes de marca em forma de tag (o "_" aceita espaço ou hífen no lugar); `linhas`:
// marcas como "<<<FIM>>>" (espaços entre as palavras tolerados).
export function neutralizarMarcas(texto, tags = [], linhas = []) {
  let t = normalizarTexto(texto);
  for (const nome of tags) {
    const flex = nome.split('_').map(escapar).join('[\\s_-]*');
    t = t.replace(new RegExp(`<(\\s*/?\\s*)(${flex})`, 'gi'), '‹$1$2');
  }
  for (const marca of linhas) {
    const miolo = marca.replace(/^<+|>+$/g, '').split(/\s+/).map(escapar).join('\\s*');
    t = t.replace(new RegExp(`<{2,}\\s*(${miolo})\\s*>{2,}`, 'gi'), '‹‹‹$1›››');
  }
  return t;
}
