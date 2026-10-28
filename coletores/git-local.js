// Git local de um projeto do catálogo. Não sonda porta.

import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJETOS } from '../projetos.js';
import { dirDoProjeto } from './caminhos.js';

const execFileAsync = promisify(execFile);

export class LeituraGit {
  async executar(dir, ...args) {
    const { stdout } = await execFileAsync('git', ['-C', dir, ...args]);
    return stdout.trim();
  }

  async resumo(dir) {
    try {
      const branch = await this.executar(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
      const [data, assunto] = (await this.executar(dir, 'log', '-1', '--format=%cI%x09%s')).split('\t');
      const sujos = (await this.executar(dir, 'status', '--porcelain'))
        .split('\n')
        .filter(Boolean).length;
      return { repositorio: true, branch, ultimoCommit: { data, assunto }, arquivosSujos: sujos };
    } catch {
      return { repositorio: false };
    }
  }

  parsearDiffStat(texto) {
    return texto
      .split('\n')
      .map((l) => l.match(/^\s*(.+?)\s*\|\s*(.+)$/))
      .filter(Boolean)
      .map(([, caminho, resumo]) => ({ caminho, resumo }));
  }

  async diff(dir) {
    const [porcelain, stat] = await Promise.all([
      this.executar(dir, 'status', '--porcelain'),
      this.executar(dir, 'diff', '--stat', 'HEAD').catch(() => ''),
    ]);
    const novos = porcelain
      .split('\n')
      .filter((l) => l.startsWith('??'))
      .map((l) => l.slice(3).trim());
    return { modificados: this.parsearDiffStat(stat), novos };
  }

  async naoEnviados(dir) {
    const upstream = await this.executar(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').catch(() => null);
    if (!upstream) return { rastreado: false, commits: [] };
    const bruto = await this.executar(dir, 'log', `${upstream}..HEAD`, '--format=%s').catch(() => '');
    return { rastreado: true, upstream, commits: bruto.split('\n').filter(Boolean) };
  }

  async detalhado(pasta) {
    const projeto = PROJETOS.find((p) => p.pasta === pasta);
    if (!projeto) return { erro: 'projeto não encontrado' };

    const caminhoRepo = projeto.subRepo ? path.join(dirDoProjeto(projeto), projeto.subRepo) : dirDoProjeto(projeto);
    const existe = await fs.access(caminhoRepo).then(() => true, () => false);
    if (!existe) return { erro: 'pasta não sincronizada nesta máquina' };

    try {
      const [diff, naoEnviados] = await Promise.all([this.diff(caminhoRepo), this.naoEnviados(caminhoRepo)]);
      return { ...diff, naoEnviados };
    } catch {
      return { erro: 'não é um repositório git' };
    }
  }
}

export function gitDetalhado(pasta) {
  return new LeituraGit().detalhado(pasta);
}
