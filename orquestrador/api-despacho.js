// Duas ações do despacho: preparar valida e guarda o desafio; confirmar inicia a tentativa real. A sessão que preparou é a que confirma; sem fallback de modelo.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoesDespacho({ servico, agora }) {
  return criarDesafios({
    agora,
    async validar({ carta, comando, versaoCarta }) {
      if (!UUID.test(carta ?? '') || !/^[a-z][a-z0-9-]*$/.test(comando ?? '') ||
          !Number.isFinite(Date.parse(versaoCarta))) throw new ErroAcesso('carta, comando ou versão inválidos', 422);
      const validacao = await servico.validarDespacho(carta, comando, versaoCarta);
      return { guardar: { carta, comando, versaoCarta, perfilComentarioId: validacao.perfilComentarioId },
        resposta: { carta: validacao.carta, comando, plano: validacao.plano, perfilComentarioId: validacao.perfilComentarioId,
          aviso: 'Confirmar iniciará uma tentativa real somente se todos os portões ainda passarem. Não há fallback de modelo.' } };
    },
    executar: (g, identidade) => servico.iniciarDespacho({ cartaId: g.carta, comandoId: g.comando, versaoCarta: g.versaoCarta,
      perfilComentarioId: g.perfilComentarioId, chaveIdempotencia: g.chaveIdempotencia, usuarioId: identidade.usuarioId }),
  });
}

export function criarApiDespacho({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/despacho',
    camposPreparar: ['carta', 'comando', 'versaoCarta'],
    falhaPreparar: { mensagem: 'despacho impedido; confira gate, dependências, contrato, modelo e disponibilidade' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira tentativa, lease e card antes de qualquer repetição' } });
}
