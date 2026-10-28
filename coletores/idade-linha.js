// Idade de uma linha no git, pelo log -L. Não monta a decisão.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class IdadeLinha {
  async desde(caminhoRepo, caminhoRelativo, linha) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', caminhoRepo, 'log', '-L', `${linha},${linha}:${caminhoRelativo}`, '--format=%cI'],
        { timeout: 5000 },
      );
      const datas = stdout.match(/^\d{4}-\d{2}-\d{2}T[\d:+-]+/gm);
      return datas?.length ? datas[datas.length - 1] : null;
    } catch {
      return null;
    }
  }
}
