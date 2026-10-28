// Fronteira HTTP de /api/orquestracao/modelos/{preparar,confirmar}. Autoriza de novo em cada pedido; o payload vem do desafio guardado no servidor.
import { criarApiDuasAcoes } from './api-duas-acoes.js';

export function criarApiPerfil({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/modelos',
    camposPreparar: ['carta', 'selecoes', 'versaoCarta'],
    mensagemCamposConfirmar: 'a confirmação aceita somente o identificador do desafio',
    falhaPreparar: { mensagem: 'proposta recusada pelo contrato ou indisponível; revise a carta' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira o card e os touchpoints antes de qualquer nova tentativa' } });
}
