// Roda o check-docs do projeto e devolve a contagem de erros.

import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function existe(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export class PortaoDocs {
  async rodar(dirRepo) {
    const mjs = path.join(dirRepo, 'scripts', 'check-docs.mjs');
    const py = path.join(dirRepo, 'scripts', 'check_docs.py');
    let cmd = null;
    if (await existe(mjs)) cmd = [process.execPath, [mjs]];
    else if (await existe(py)) cmd = ['python3', [py]];
    if (!cmd) return null;
    try {
      const { stdout } = await execFileAsync(cmd[0], cmd[1], { cwd: dirRepo, timeout: 20_000, env: { ...process.env, CI: '' } });
      const m = /(\d+) erro/.exec(stdout);
      return m ? Number(m[1]) : 0;
    } catch (erro) {
      const saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
      const m = /(\d+) erro/.exec(saida);
      return m ? Number(m[1]) : 1;
    }
  }
}

export function portaoDocsPadrao(dirRepo) {
  return new PortaoDocs().rodar(dirRepo);
}
