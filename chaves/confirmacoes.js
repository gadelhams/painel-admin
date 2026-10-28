// Duas ações da troca de chave: preparar guarda o pedido; confirmar grava o valor, que só entra nesta segunda ação. O esqueleto mora em orquestrador/desafio-duas-acoes.js.
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';

export function criarConfirmacoesChaves({ servico, agora }) {
  const desafios = criarDesafios({
    agora,
    retencaoMs: 3_600_000,
    // Recusa do serviço (valor inválido, alvo não reconhecido) não gravou nada; o resto é incerto.
    recusaLimpa: erro => (erro instanceof ErroAcesso ? erro : null),
    async validar({ projeto, nome, alvo }) {
      if (!['local', 'servidor', 'fora'].includes(alvo) || typeof projeto !== 'string' || typeof nome !== 'string') throw new ErroAcesso('projeto, nome ou alvo inválidos', 422);
      const dados = await servico.preparar({ projeto, nome, alvo });
      return { guardar: { projeto, nome, alvo }, resposta: dados };
    },
    executar: (g, identidade, valor) => servico.confirmar({ projeto: g.projeto, nome: g.nome, alvo: g.alvo }, valor, identidade.usuarioId),
  });
  return { preparar: desafios.preparar, confirmar: (id, valor, identidade) => desafios.confirmar(id, identidade, valor) };
}
