// Duas ações do perfil de modelos: preparar valida e guarda o desafio; confirmar grava no card. O esqueleto mora em desafio-duas-acoes.js.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';

export { pendentes } from './desafio-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoes({ servico, agora, prazoMs } = {}) {
  return criarDesafios({
    agora, prazoMs,
    async validar({ carta, selecoes, versaoCarta }) {
      if (!UUID.test(carta ?? '') || typeof versaoCarta !== 'string' || !Number.isFinite(Date.parse(versaoCarta))) {
        throw new ErroAcesso('carta ou versão inválida', 422);
      }
      const dados = await servico.modelos(carta);
      if (!dados.podeRegistrar) throw new ErroAcesso('identidade de escrita restrita indisponível para este projeto', 503);
      if (dados.versaoCarta !== versaoCarta) throw new ErroAcesso('carta mudou; recarregue antes de preparar', 409);
      const validacao = await servico.validarModelos(carta, selecoes);
      return { guardar: { carta, versaoCarta, selecoes: validacao.selecoes },
        resposta: { carta: dados.carta, versaoCarta, selecoes: validacao.selecoes,
          aviso: 'Confirmar gravará este perfil no card do Plane; não iniciará execução.' } };
    },
    executar: g => servico.registrarModelos(g.carta, g.selecoes, g.versaoCarta, g.chaveIdempotencia),
  });
}
