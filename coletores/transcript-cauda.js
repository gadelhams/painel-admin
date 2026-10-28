// Lê só o fim de um transcript .jsonl e devolve as linhas que são JSON. Não interpreta o conteúdo.

import fs from 'node:fs/promises';

// Transcripts chegam a GB (o Codex Desktop guarda screenshot em base64 na saída
// da ferramenta: linhas de 5 MB); o Hangar só olha os últimos minutos, então
// basta a cauda — mas uma cauda fixa enche de imagem e perde as chamadas.
export const CAUDA_BYTES = 384 * 1024;
export const CAUDA_TETO = 32 * 1024 * 1024;
const LINHAS_MINIMAS = 60;
// Linha maior que isto é saída com imagem: pulada sem decodificar.
export const LINHA_MAX = 256 * 1024;

function linhasPequenas(buf, cortada) {
  const objetos = [];
  let pos = 0;
  if (cortada) {
    const nl = buf.indexOf(0x0a);
    pos = nl < 0 ? buf.length : nl + 1; // primeira linha cortada no meio
  }
  while (pos < buf.length) {
    let fim = buf.indexOf(0x0a, pos);
    if (fim < 0) fim = buf.length;
    if (fim > pos && fim - pos <= LINHA_MAX) {
      try {
        objetos.push(JSON.parse(buf.toString('utf8', pos, fim)));
      } catch {
        // linha ainda sendo escrita pela CLI
      }
    }
    pos = fim + 1;
  }
  return objetos;
}

export async function lerCauda(arquivo, bytes = CAUDA_BYTES, teto = CAUDA_TETO) {
  const fd = await fs.open(arquivo, 'r');
  try {
    const { size } = await fd.stat();
    let janela = bytes;
    for (;;) {
      const inicio = Math.max(0, size - janela);
      const buf = Buffer.alloc(size - inicio);
      await fd.read(buf, 0, buf.length, inicio);
      const objetos = linhasPequenas(buf, inicio > 0);
      if (objetos.length >= LINHAS_MINIMAS || inicio === 0 || janela >= teto) return objetos;
      janela = Math.min(janela * 2, teto);
    }
  } finally {
    await fd.close();
  }
}

// Primeira linha do arquivo, quando cabe em `bytes` e é JSON; senão null.
export async function lerCabeca(arquivo, bytes = 256 * 1024) {
  const fd = await fs.open(arquivo, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    const texto = buf.subarray(0, bytesRead).toString('utf8');
    const fim = texto.indexOf('\n');
    if (fim < 0) return null;
    try {
      return JSON.parse(texto.slice(0, fim));
    } catch {
      return null;
    }
  } finally {
    await fd.close();
  }
}
