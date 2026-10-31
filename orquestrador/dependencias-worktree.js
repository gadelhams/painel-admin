// Instalação do worktree: a raiz e cada subpasta do `instalarEm` do contrato que tem lock e ainda não tem os módulos. Sem scripts de pacote.

import fs from 'node:fs/promises';
import path from 'node:path';
import { SUBPASTA_INSTALACAO } from './contrato-politica.js';

export class DependenciasWorktree {
  constructor({ processo, binario, limites }) {
    this.processo = processo;
    this.binario = binario;
    this.limites = limites;
  }

  async instalar(worktree, logs, instalarEm = []) {
    const evidencias = [];
    for (const sub of ['', ...instalarEm]) {
      if (sub && !SUBPASTA_INSTALACAO.test(sub)) return { motivo: `instalarEm fora da forma: ${sub}` };
      const pasta = path.join(worktree, sub);
      // Link versionado que aponta para fora do worktree não recebe `npm ci`.
      const [real, raiz] = await Promise.all([fs.realpath(pasta).catch(() => null), fs.realpath(worktree).catch(() => null)]);
      if (!real || !raiz || (real !== raiz && !real.startsWith(raiz + path.sep))) {
        if (sub && !real) return { motivo: `instalarEm aponta para pasta ausente: ${sub}` };
        if (sub) return { motivo: `instalarEm sai do worktree: ${sub}` };
      }
      const temLock = await fs.access(path.join(pasta, 'package-lock.json')).then(() => true, () => false);
      const temModulos = await fs.access(path.join(pasta, 'node_modules')).then(() => true, () => false);
      if (!temLock || temModulos) continue;
      let npm;
      try { npm = await this.binario('npm'); }
      catch (erro) { return { motivo: erro.message }; }
      const nome = sub ? `npm-ci-${sub.replaceAll('/', '_')}.log` : 'npm-ci.log';
      const r = await this.processo.rodar({ executavel: npm, argumentos: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: pasta,
        timeoutMs: this.limites.minutosInstalacao * 60_000, log: path.join(logs, nome) });
      const onde = sub ? ` em ${sub}` : '';
      if (r.codigo !== 0) return { motivo: `npm ci${onde} falhou (${r.expirou ? 'tempo esgotado' : `código ${r.codigo}`})` };
      evidencias.push(`dependências instaladas com npm ci --ignore-scripts${onde} em ${Math.round(r.duracaoMs / 1000)} s`);
    }
    return evidencias.length ? { evidencia: evidencias.join('; ').slice(0, 500) } : {};
  }
}
