// Três leituras de git (status curto, diff --stat, log de 15) de um projeto do catálogo; nunca diff de conteúdo, nunca caminho livre.

import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJETOS } from '../projetos.js';
import { dirDoProjeto } from './caminhos.js';
import { ambienteLimpo } from '../orquestrador/ambiente-cli.js';
import { filtrarSegredo } from '../acoes/filtro-segredo.js';

const execFileAsync = promisify(execFile);

// Lista fechada: o modelo escolhe a chave, nunca o argumento. Diff de conteúdo fica
// de fora porque arquivo sujo pode ter segredo colado.
export const LEITURAS_GIT = Object.freeze({
  status: Object.freeze(['status', '--short']),
  diff_stat: Object.freeze(['diff', '--stat']),
  log: Object.freeze(['log', '--oneline', '-n', '15']),
});

const MAX_CARACTERES = 6000;

export class LeituraGitProjeto {
  constructor({ projetos = PROJETOS, executar = execFileAsync, ambiente = process.env, dirDe = dirDoProjeto } = {}) {
    this.projetos = projetos;
    this.executar = executar;
    this.ambiente = ambiente;
    this.dirDe = dirDe;
  }

  async ler({ projeto, leitura } = {}) {
    const p = this.projetos.find(x => x.pasta === projeto);
    if (!p) return { ok: false, erro: 'projeto fora do catálogo: use o nome exato da pasta que estado_projetos devolve' };
    const argumentos = Object.hasOwn(LEITURAS_GIT, leitura) ? LEITURAS_GIT[leitura] : null;
    if (!argumentos) return { ok: false, erro: `leitura desconhecida; aceitas: ${Object.keys(LEITURAS_GIT).join(', ')}` };
    const dir = p.subRepo ? path.join(this.dirDe(p), p.subRepo) : this.dirDe(p);
    try {
      // GIT_OPTIONAL_LOCKS=0: o status não grava o índice de um repo onde alguém trabalha.
      const { stdout } = await this.executar('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-C', dir, ...argumentos], {
        env: { ...ambienteLimpo(this.ambiente), GIT_OPTIONAL_LOCKS: '0' }, timeout: 10_000, maxBuffer: 512 * 1024,
      });
      const texto = filtrarSegredo(stdout, this.ambiente);
      return { ok: true, projeto: p.pasta, comando: `git ${argumentos.join(' ')}`, saida: texto.slice(0, MAX_CARACTERES),
        truncada: texto.length > MAX_CARACTERES };
    } catch {
      return { ok: false, projeto: p.pasta, erro: 'git falhou: pasta ausente nesta máquina, não é repositório ou passou do tempo' };
    }
  }
}

export function lerGitDoProjeto(entrada) {
  return new LeituraGitProjeto().ler(entrada);
}
