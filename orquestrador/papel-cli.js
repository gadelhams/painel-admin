// Lança um papel de IA. Os argumentos moram em argumentos-cli.js; o retrato, em retrato-cli.js.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ArgumentosCli, selecoesDoPlano } from './argumentos-cli.js';
import { RetratoCli } from './retrato-cli.js';

export { selecoesDoPlano };

const LICAO_POR_PAPEL = { orquestracao: 'orquestrador.md', codificacao_testes: 'executor.md', validacao: 'cetico.md' };

export class PapelCli {
  constructor({ processo, binario, limites, licoesVivasDir }) {
    this.processo = processo;
    this.binario = binario;
    this.limites = limites;
    this.licoesVivasDir = licoesVivasDir;
  }

  async licoes(papel) {
    try { return await fs.readFile(path.join(this.licoesVivasDir, LICAO_POR_PAPEL[papel]), 'utf8'); }
    catch { return `(lições vivas de ${papel} não encontradas em ${this.licoesVivasDir}; siga as cláusulas acima)`; }
  }

  async lancar({ papel, contrato, plano, worktree, prompt, logs, comandos }) {
    const escolha = plano.papeis[papel];
    const ultimaMensagem = path.join(logs, `${papel}.ultima.md`);
    const argumentos = ArgumentosCli.de(contrato, plano, papel, { papel, comandos, limites: this.limites, worktree, ultimaMensagem });
    await fs.writeFile(path.join(logs, `${papel}.prompt.md`), prompt, 'utf8');
    const r = await this.processo.rodar({ executavel: await this.binario(escolha.provedor === 'claude' ? 'claude' : 'codex'), argumentos, cwd: worktree,
      stdin: prompt, timeoutMs: this.limites.minutosIa * 60_000, log: path.join(logs, `${papel}.log`) });
    const retrato = RetratoCli.base({ papel, escolha, duracaoMs: r.duracaoMs });
    if (r.erroSpawn) return { ...retrato, impedimento: `CLI do papel ${papel} não iniciou: ${r.erroSpawn}` };
    if (r.expirou) return { ...retrato, impedimento: `CLI do papel ${papel} excedeu ${this.limites.minutosIa} min e foi encerrada` };
    if (RetratoCli.limite(r)) return { ...retrato, impedimento: `limite de uso do provedor ${escolha.provedor} no papel ${papel}` };
    if (escolha.provedor === 'claude') return RetratoCli.claude(retrato, r, papel);
    return RetratoCli.codex(retrato, r, papel, ultimaMensagem);
  }
}
