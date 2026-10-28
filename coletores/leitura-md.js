// Lê um markdown e corta no teto. Não escolhe o caminho.

import fs from 'node:fs/promises';

export const MAX_CHARS_ARQUIVO = 60_000;

export class LeituraMd {
  async ler(caminhoAbsoluto) {
    let texto = await fs.readFile(caminhoAbsoluto, 'utf8');
    if (texto.length > MAX_CHARS_ARQUIVO) {
      texto = `${texto.slice(0, MAX_CHARS_ARQUIVO)}\n\n[... truncado em ${MAX_CHARS_ARQUIVO} caracteres — o arquivo continua no disco]`;
    }
    return texto;
  }
}

export function lerArquivoMd(caminhoAbsoluto) {
  return new LeituraMd().ler(caminhoAbsoluto);
}
