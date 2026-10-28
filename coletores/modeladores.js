// Lista os markdowns de um diretório já autorizado. Não lê o conteúdo.

import path from 'node:path';
import fs from 'node:fs/promises';

const MODELADORES_DE_PASTA = ['CLAUDE.md', 'claude.md', 'AGENTS.md', 'README.md', 'readme.md'];
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'rathena']);

export class ListaModeladores {
  async listar(dirProjeto) {
    const achados = [];
    const entradas = await fs.readdir(dirProjeto, { withFileTypes: true });
    for (const entrada of entradas) {
      if (entrada.isFile() && entrada.name.toLowerCase().endsWith('.md')) {
        achados.push(entrada.name);
      } else if (entrada.isDirectory() && !PASTAS_IGNORADAS.has(entrada.name)) {
        if (entrada.name === 'docs') {
          const docs = await fs.readdir(path.join(dirProjeto, 'docs')).catch(() => []);
          for (const doc of docs) {
            if (doc.toLowerCase().endsWith('.md')) achados.push(`docs/${doc}`);
          }
        } else {
          for (const nome of MODELADORES_DE_PASTA) {
            const existeSub = await fs.access(path.join(dirProjeto, entrada.name, nome)).then(() => true, () => false);
            if (existeSub) achados.push(`${entrada.name}/${nome}`);
          }
        }
      }
    }
    return achados;
  }
}

export function listarModeladores(dirProjeto) {
  return new ListaModeladores().listar(dirProjeto);
}
