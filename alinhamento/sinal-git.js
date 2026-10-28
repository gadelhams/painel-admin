// Sinais de git: commits sem push e atraso do remoto.

export class SinalGit {
  constructor(git) { this.git = git; }

  async ler(dirRepo) {
    const sinais = [];
    let dataCommit = null;
    let temGit = false;
    try {
      const data = await this.git(dirRepo, 'log', '-1', '--format=%cs');
      temGit = Boolean(data); dataCommit = data || null;
      try {
        const [a, b] = (await this.git(dirRepo, 'rev-list', '--left-right', '--count', 'HEAD...@{u}')).split(/\s+/).map(Number);
        if (a > 0) sinais.push({ tipo: 'sem_push', gravidade: 'media', texto: `${a} commit(s) sem push` });
        if (b > 0) sinais.push({ tipo: 'atras_remoto', gravidade: 'media', texto: `${b} commit(s) atrás do remoto` });
      } catch { /* sem upstream */ }
    } catch { /* sem git */ }
    return { temGit, dataCommit, sinais };
  }
}
