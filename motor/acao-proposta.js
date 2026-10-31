// A ferramenta propor_acao e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não executa.

import { RecusaProposta } from '../acoes/propostas.js';

export const FERRAMENTA_PROPOSTA = 'mcp__c3po__propor_acao';

const AVISO = 'Proposta registrada; eu não executo nada. O Mestre vê o cartão no chat, prepara e confirma com a sessão do Cadastro Único. Diga isso em uma frase e não invente o resultado.';

export class PropostaAcao {
  constructor({ propostas }) {
    this.propostas = propostas;
  }

  async propor({ projeto, comandoId } = {}) {
    try {
      const proposta = await this.propostas.propor({ projeto, comandoId });
      return { content: [{ type: 'text', text: JSON.stringify({ proposta, aviso: AVISO }) }] };
    } catch (erro) {
      const motivo = erro instanceof RecusaProposta ? erro.message : 'o diário de ações não pôde ser gravado';
      return { content: [{ type: 'text', text: `PROPOSTA RECUSADA: ${motivo}. Nada foi registrado para o Mestre confirmar.` }], isError: true };
    }
  }
}

function textoDoResultado(bloco) {
  if (typeof bloco.content === 'string') return bloco.content;
  return (Array.isArray(bloco.content) ? bloco.content : []).filter(c => c?.type === 'text').map(c => c.text).join('');
}

// O cartão do chat nasce do resultado da ferramenta, não do texto do modelo; e só de
// proposta que o registro conhece agora.
export function propostasDaMensagem(mensagem, idsDaFerramenta, propostas) {
  const saida = [];
  for (const bloco of mensagem?.message?.content ?? []) {
    if (bloco?.type !== 'tool_result' || bloco.is_error || !idsDaFerramenta.has(bloco.tool_use_id)) continue;
    let dados;
    try { dados = JSON.parse(textoDoResultado(bloco)); } catch { continue; }
    const p = dados?.proposta;
    if (!p || !propostas.obter(p.id)) continue;
    saida.push({ id: p.id, projeto: p.projeto, titulo: p.titulo, comandoId: p.comandoId, comando: p.comando, expiraEm: p.expiraEm });
  }
  return saida;
}
