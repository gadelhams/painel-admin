// Uma sessão do Claude Code a partir da cauda do transcript: última atividade, cwd, fim de turno e ações. Não lê prompt nem resposta.

import { acaoDaFerramenta } from './acoes-sessao.js';

const PAPEIS = new Set(['user', 'assistant']);

export function sessaoClaude(objetos) {
  let ultimoEm = null;
  let cwd = null;
  let fimDeTurno = false;
  const acoes = [];
  for (const o of objetos) {
    if (!PAPEIS.has(o?.type) || typeof o.timestamp !== 'string') continue;
    ultimoEm = o.timestamp;
    if (typeof o.cwd === 'string') cwd = o.cwd;
    const bruto = o.message?.content;
    const conteudo = Array.isArray(bruto) ? bruto : [];
    if (o.type === 'assistant') {
      const usos = conteudo.filter((b) => b?.type === 'tool_use');
      for (const uso of usos) {
        const acao = acaoDaFerramenta(uso.name, uso.input, o.timestamp);
        if (acao) acoes.push(acao);
      }
      const parada = o.message?.stop_reason;
      fimDeTurno = !usos.length && (parada === 'end_turn' || parada === 'stop_sequence');
    } else if (!conteudo.length || !conteudo.every((b) => b?.type === 'tool_result')) {
      // mensagem nova do dono reabre o turno; resultado de ferramenta não muda nada
      fimDeTurno = false;
    }
  }
  return { ultimoEm, cwd, fimDeTurno, acoes };
}
