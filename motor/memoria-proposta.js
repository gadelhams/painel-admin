// A ferramenta propor_memoria e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não grava a memória.

import { RecusaMemoria } from '../memoria/propostas-memoria.js';

export const FERRAMENTA_MEMORIA = 'mcp__c3po__propor_memoria';

const AVISO = 'Proposta de memória registrada; eu não gravo nada. O Mestre vê o diff no cartão do chat e confirma com a sessão do Cadastro Único. Diga isso em uma frase.';

export class PropostaMemoria {
  constructor({ propostas }) {
    this.propostas = propostas;
  }

  async propor(entrada = {}) {
    try {
      const proposta = await this.propostas.propor(entrada);
      return { content: [{ type: 'text', text: JSON.stringify({ propostaMemoria: proposta, aviso: AVISO }) }] };
    } catch (erro) {
      const motivo = erro instanceof RecusaMemoria ? erro.message : 'a memória não pôde ser lida';
      return { content: [{ type: 'text', text: `PROPOSTA DE MEMÓRIA RECUSADA: ${motivo}. Nada foi registrado.` }], isError: true };
    }
  }
}

function textoDoResultado(bloco) {
  if (typeof bloco.content === 'string') return bloco.content;
  return (Array.isArray(bloco.content) ? bloco.content : []).filter(c => c?.type === 'text').map(c => c.text).join('');
}

// O cartão nasce do resultado da ferramenta (escrito por este código, não pelo modelo) e só
// de proposta que o registro conhece agora; o preparo recalcula o diff contra a base.
export function propostasMemoriaDaMensagem(mensagem, idsDaFerramenta, propostas) {
  const saida = [];
  for (const bloco of mensagem?.message?.content ?? []) {
    if (bloco?.type !== 'tool_result' || bloco.is_error || !idsDaFerramenta.has(bloco.tool_use_id)) continue;
    let dados;
    try { dados = JSON.parse(textoDoResultado(bloco)); } catch { continue; }
    const p = dados?.propostaMemoria;
    if (!p || !propostas.obter(p.id)) continue;
    saida.push({ id: p.id, motivo: p.motivo, base: p.base, diff: p.diff, bytes: p.bytes, expiraEm: p.expiraEm });
  }
  return saida;
}
