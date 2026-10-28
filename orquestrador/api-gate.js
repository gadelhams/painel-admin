// Duas ações do gate: preparar guarda a proposta; confirmar marca a etiqueta. A sessão que preparou é a que confirma; a marca não inicia execução.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoesGate({ servico, agora }) {
  return criarDesafios({
    agora,
    async validar({ carta, proposta, versaoCarta }) {
      if (!UUID.test(carta ?? '') || !Number.isFinite(Date.parse(versaoCarta))) throw new ErroAcesso('carta ou versão inválida', 422);
      const validacao = await servico.validarGate(carta, proposta);
      if (validacao.versaoCarta !== versaoCarta) throw new ErroAcesso('carta mudou; recarregue antes de preparar', 409);
      return { guardar: { carta, versaoCarta, proposta: validacao.proposta },
        resposta: { carta: validacao.carta, proposta: validacao.proposta, aviso: validacao.aviso } };
    },
    executar: g => servico.registrarGate(g.carta, g.proposta, g.versaoCarta, g.chaveIdempotencia),
  });
}

export function criarApiGate({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/gates',
    camposPreparar: ['carta', 'proposta', 'versaoCarta'],
    falhaPreparar: { mensagem: 'gate recusado; confira pendências, versão e evidências' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira gate e comentário no card antes de repetir' } });
}
