// A ferramenta propor_decisao e a leitura do seu resultado no fluxo da conversa. Só propõe: não relê a carta, não prepara, não confirma, não grava no Plane.

import { RecusaPropostaDecisao } from '../decisao.js';

export const FERRAMENTA_DECISAO = 'mcp__c3po__propor_decisao';

const AVISO = 'Proposta de decisão registrada; eu não gravo nada. O Mestre vê no cartão do chat o texto exato e os efeitos, e grava com um toque e a sessão do Cadastro Único. Diga isso em uma frase, diga quais efeitos você propôs e não diga que gravou.';

export class PropostaDecisao {
  constructor({ propostas }) {
    this.propostas = propostas;
  }

  async propor({ carta, decisao, motivo, destravar, produto, estado } = {}) {
    try {
      const proposta = this.propostas.propor({ carta, decisao, motivo: motivo ?? '',
        efeitos: { destravar, produto: produto ?? 'manter', estado: estado ?? null } });
      return { content: [{ type: 'text', text: JSON.stringify({ propostaDecisao: proposta, aviso: AVISO }) }] };
    } catch (erro) {
      const motivoRecusa = erro instanceof RecusaPropostaDecisao ? erro.message : 'a proposta não pôde ser registrada';
      return { content: [{ type: 'text', text: `PROPOSTA DE DECISÃO RECUSADA: ${motivoRecusa}. Nada foi registrado para o Mestre gravar.` }], isError: true };
    }
  }
}

function textoDoResultado(bloco) {
  if (typeof bloco.content === 'string') return bloco.content;
  return (Array.isArray(bloco.content) ? bloco.content : []).filter(c => c?.type === 'text').map(c => c.text).join('');
}

// O cartão nasce só do resultado DESTA ferramenta (o id da chamada) e do que o registro guarda
// agora, nunca do texto: uma carta ou um doc lido por outra ferramenta com JSON de proposta
// dentro não vira cartão, e o que o cartão mostra é o que o servidor validou.
export function propostasDecisaoDaMensagem(mensagem, idsDaFerramenta, propostas) {
  const saida = [];
  for (const bloco of mensagem?.message?.content ?? []) {
    if (bloco?.type !== 'tool_result' || bloco.is_error || !idsDaFerramenta.has(bloco.tool_use_id)) continue;
    let dados;
    try { dados = JSON.parse(textoDoResultado(bloco)); } catch { continue; }
    const guardada = propostas.obter(dados?.propostaDecisao?.id);
    if (guardada) saida.push(guardada);
  }
  return saida;
}
