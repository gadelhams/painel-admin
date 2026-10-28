// Worktree e commit do ramo orq/. A árvore principal do projeto não é tocada.

import path from 'node:path';
import { cortar } from './briefing-papel.js';

export class IsolamentoGit {
  constructor({ processo, binario }) {
    this.processo = processo;
    this.binario = binario;
  }

  async git(cwd, ...args) {
    const r = await this.processo.rodar({ executavel: await this.binario('git'), argumentos: args, cwd, timeoutMs: 60_000, maxSaidaBytes: 1024 * 1024 });
    if (r.codigo !== 0) throw new Error(`git ${args[0]} falhou (${r.codigo ?? r.sinal}): ${cortar(r.stderr.trim(), 300)}`);
    return r.stdout;
  }

  async adicionar(pasta, carta, curto, diretorioEstado) {
    const ramo = `orq/${String(carta).toLowerCase()}-${curto}`;
    const worktree = path.join(diretorioEstado, 'worktrees', `${carta}-${curto}`);
    await this.git(pasta, 'worktree', 'add', '-b', ramo, worktree, 'HEAD');
    return { ramo, worktree };
  }

  async commitar(worktree, carta, curto) {
    let commit = 'sem alterações';
    let diffStat = '(sem alterações)';
    let diff = '';
    if ((await this.git(worktree, 'status', '--porcelain')).trim()) {
      await this.git(worktree, 'add', '-A');
      await this.git(worktree, '-c', 'user.name=Orquestrador', '-c', 'user.email=orquestrador@astargne.local', 'commit', '--no-verify', '-q',
        '-m', `ORQ ${carta}: tentativa ${curto} (codificacao_testes)`);
      const sha = (await this.git(worktree, 'rev-parse', '--short', 'HEAD')).trim();
      diffStat = (await this.git(worktree, 'diff', '--stat', 'HEAD~1', 'HEAD')).trim();
      diff = await this.git(worktree, 'diff', 'HEAD~1', 'HEAD');
      const arquivos = diffStat.split('\n').length - 1;
      commit = `commit ${sha} (${arquivos} arquivo${arquivos === 1 ? '' : 's'})`;
    }
    return { commit, diffStat, diff };
  }
}
