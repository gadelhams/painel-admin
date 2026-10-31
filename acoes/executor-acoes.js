// Roda o comando de uma ação confirmada pelo dono: uma por vez, sem shell, ambiente por lista branca, tempo e saída limitados e saída filtrada. Não confere SSO, proposta nem contrato.
//
// Só api-acoes.js importa este módulo; o motor do C-3PO nunca (test/acoes.test.js).
import { spawn as spawnNode } from 'node:child_process';
import { ProcessoCli } from '../orquestrador/processo-cli.js';
import { ambienteLimpo, resolverBinario, LIMITES_PADRAO } from '../orquestrador/ambiente-cli.js';
import { filtrarSegredo } from './filtro-segredo.js';

const MAX_SAIDA_RESPOSTA = 6000;

const recusa = (mensagem, status) => Object.assign(new Error(mensagem), { semEscrita: true, status });

export function criarExecutorAcoes({ spawn = spawnNode, ambiente = process.env, binario = resolverBinario,
  timeoutMs = LIMITES_PADRAO.minutosComando * 60_000, maxSaidaBytes = 1024 * 1024 } = {}) {
  const env = ambienteLimpo(ambiente);
  const processo = new ProcessoCli({ spawn, env, maxSaidaBytes });
  let rodando = false;

  return {
    // Síncrono de propósito: duas confirmações no mesmo tique não passam as duas.
    tomarVez() {
      if (rodando) throw recusa('já há uma ação rodando; espere o resultado dela', 409);
      rodando = true;
      let livre = false;
      return { liberar() { if (!livre) { livre = true; rodando = false; } } };
    },
    ocupado: () => rodando,
    async rodar({ pasta, executavel, argumentos }) {
      const caminho = await binario(executavel, env);
      if (!caminho) throw recusa(`${executavel} não encontrado no PATH do painel`, 422);
      const r = await processo.rodar({ executavel: caminho, argumentos, cwd: pasta, timeoutMs });
      // O filtro olha o ambiente inteiro do painel: é ali que mora o valor a esconder.
      const saida = filtrarSegredo([r.stdout, r.stderr].filter(Boolean).join('\n'), ambiente);
      const truncada = saida.length > MAX_SAIDA_RESPOSTA || Boolean(r.descartados);
      return { codigo: r.codigo, sinal: r.sinal, expirou: r.expirou, erroSpawn: r.erroSpawn ? filtrarSegredo(r.erroSpawn, ambiente) : null,
        duracaoMs: r.duracaoMs, saida: saida.length > MAX_SAIDA_RESPOSTA ? `…${saida.slice(-MAX_SAIDA_RESPOSTA)}` : saida, truncada };
    },
  };
}
