// Lê o corpo e o status que o script remoto devolve. O stderr que pareça bearer é redigido antes do log.

import { ErroContas } from './tabela.js';
import { redigirSegredo } from './redacao.js';

export class SaidaCentral {
  interpretar({ codigo, stdout, stderr }, log = console.error) {
    const stderrLimpo = redigirSegredo(stderr).trim().slice(0, 300);
    const falhar = (motivo, mensagem = 'sem acesso ao servidor') => {
      log(`[contas] ${motivo} (ssh exit=${codigo}) ${stderrLimpo}`);
      return new ErroContas(mensagem, 502);
    };
    if (codigo !== 0) throw falhar('ssh falhou');
    if (stderrLimpo) log(`[contas] stderr com exit 0: ${stderrLimpo}`);
    const corte = stdout.lastIndexOf('\n');
    const statusTexto = stdout.slice(corte + 1).trim();
    if (corte < 0 || !/^[1-5]\d\d$/.test(statusTexto)) throw falhar('curl não devolveu status');
    const status = Number(statusTexto);
    if (status === 401) throw falhar('central recusou o token interno', 'sem acesso ao servidor (token interno recusado)');
    const texto = stdout.slice(0, corte);
    let corpo;
    try {
      corpo = texto.trim() ? JSON.parse(texto) : {};
    } catch {
      throw falhar('resposta do central não é JSON');
    }
    return { status, corpo };
  }
}

export function interpretarSaida(saida, log) {
  return new SaidaCentral().interpretar(saida, log);
}
