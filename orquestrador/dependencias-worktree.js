// Instalação do worktree quando há lock e faltam os módulos. Sem scripts de pacote.

import fs from 'node:fs/promises';
import path from 'node:path';

export class DependenciasWorktree {
  constructor({ processo, binario, limites }) {
    this.processo = processo;
    this.binario = binario;
    this.limites = limites;
  }

  async instalar(worktree, logs) {
    const temLock = await fs.access(path.join(worktree, 'package-lock.json')).then(() => true, () => false);
    const temModulos = await fs.access(path.join(worktree, 'node_modules')).then(() => true, () => false);
    if (!temLock || temModulos) return {};
    let npm;
    try { npm = await this.binario('npm'); }
    catch (erro) { return { motivo: erro.message }; }
    const r = await this.processo.rodar({ executavel: npm, argumentos: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: worktree,
      timeoutMs: this.limites.minutosInstalacao * 60_000, log: path.join(logs, 'npm-ci.log') });
    if (r.codigo !== 0) return { motivo: `npm ci falhou (${r.expirou ? 'tempo esgotado' : `código ${r.codigo}`})` };
    return { evidencia: `dependências instaladas com npm ci --ignore-scripts em ${Math.round(r.duracaoMs / 1000)} s` };
  }
}
