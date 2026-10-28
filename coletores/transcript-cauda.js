// Lê só o fim de um transcript .jsonl e devolve as linhas que são JSON. Não interpreta o conteúdo.

import fs from 'node:fs/promises';

// Transcripts chegam a dezenas de MB (o Codex Desktop passa de 50 mil linhas);
// o Hangar só olha os últimos minutos, então basta a cauda.
export const CAUDA_BYTES = 384 * 1024;

export async function lerCauda(arquivo, bytes = CAUDA_BYTES) {
  const fd = await fs.open(arquivo, 'r');
  try {
    const { size } = await fd.stat();
    const inicio = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - inicio);
    await fd.read(buf, 0, buf.length, inicio);
    const linhas = buf.toString('utf8').split('\n');
    if (inicio > 0) linhas.shift(); // primeira linha cortada no meio
    const objetos = [];
    for (const linha of linhas) {
      if (!linha) continue;
      try {
        objetos.push(JSON.parse(linha));
      } catch {
        // linha ainda sendo escrita pela CLI
      }
    }
    return objetos;
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
