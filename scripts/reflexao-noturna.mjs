// Entrada do timer `painel-reflexao.timer` (03:30): liga a reflexão noturna do C-3PO à frota real e ao diretório de estado do painel, e sai 0 em todo resultado previsto. Não decide nada.
//
// Compor aqui é como em montagem.js: o script lê a frota pelo ArquivoFrota da orquestração
// (só `ler`, nunca `gravar`) e entrega à reflexão. Sai 1 só em falha inesperada, para o
// journal mostrar; recusa, sem insumo e "já rodou hoje" são resultados, não erros.
import os from 'node:os';
import path from 'node:path';
import { ArquivoFrota } from '../orquestrador/frota.js';
import { executarReflexao } from '../memoria/reflexao.js';

const estado = path.join(os.homedir(), '.local', 'state', 'painel-admin');
const frota = new ArquivoFrota({ diretorio: path.join(estado, 'orquestracao') });

try {
  const r = await executarReflexao({ diretorio: path.join(estado, 'c3po'), lerFrota: () => frota.ler() });
  console.log(`[reflexao] ${r.data ?? ''} ${r.resultado}${r.motivo ? `: ${r.motivo}` : ''}`);
} catch (erro) {
  console.error(`[reflexao] falhou: ${erro.message}`);
  process.exitCode = 1;
}
