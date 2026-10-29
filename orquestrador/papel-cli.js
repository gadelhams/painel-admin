// Lança um papel de IA. Os argumentos moram em argumentos-cli.js; o retrato, em retrato-cli.js.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ArgumentosCli } from './argumentos-cli.js';
import { RetratoCli } from './retrato-cli.js';

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
    const argumentos = ArgumentosCli.de(plano, papel, { papel, comandos, limites: this.limites, worktree, ultimaMensagem });
    await fs.writeFile(path.join(logs, `${papel}.prompt.md`), prompt, 'utf8');
    let executavel;
    // Binário sumido entre a checagem e o papel é infra da CLI (pausa a frota), não da carta.
    try { executavel = await this.binario(escolha.provedor === 'claude' ? 'claude' : 'codex'); }
    catch (erro) { return { ...RetratoCli.base({ papel, escolha, duracaoMs: 0 }), causa: { tipo: 'cli', provedor: escolha.provedor }, impedimento: erro.message }; }
    const r = await this.processo.rodar({ executavel, argumentos, cwd: worktree,
      stdin: prompt, timeoutMs: this.limites.minutosIa * 60_000, log: path.join(logs, `${papel}.log`) });
    const retrato = RetratoCli.base({ papel, escolha, duracaoMs: r.duracaoMs });
    // A causa decide o freio (J6 + correção J-C): 'cli' pausa a versão da frota,
    // 'limite' pausa o provedor e 'carta' conta tentativa da carta sem pausar nada.
    const causa = { tipo: RetratoCli.causa(r, escolha.provedor), provedor: escolha.provedor };
    if (r.erroSpawn) return { ...retrato, causa, impedimento: `CLI do papel ${papel} não iniciou: ${r.erroSpawn}` };
    if (r.expirou) return { ...retrato, causa, impedimento: `CLI do papel ${papel} excedeu ${this.limites.minutosIa} min e foi encerrada` };
    if (causa.tipo === 'limite') return { ...retrato, causa, impedimento: `limite de uso do provedor ${escolha.provedor} no papel ${papel}` };
    if (causa.tipo === 'cli') return { ...retrato, causa, impedimento: `CLI ${escolha.provedor} recusou o papel ${papel} na partida (modelo, flag ou autenticação)` };
    const final = escolha.provedor === 'claude' ? RetratoCli.claude(retrato, r, papel) : await RetratoCli.codex(retrato, r, papel, ultimaMensagem);
    return final.impedimento ? { ...final, causa } : final;
  }
}
