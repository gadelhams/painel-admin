// Um comando git com teto de tempo. Não interpreta o alinhamento.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitMedida {
  async executar(dir, ...args) {
    const { stdout } = await execFileAsync('git', ['-C', dir, ...args], { timeout: 15_000 });
    return stdout.trim();
  }
}

export function gitPadrao(dir, ...args) {
  return new GitMedida().executar(dir, ...args);
}
