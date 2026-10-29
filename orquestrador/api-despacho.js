// Duas ações do despacho: preparar valida e guarda o desafio com a versão da frota; confirmar inicia a tentativa real. A sessão que preparou é a que confirma; sem fallback de modelo.
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
      return { guardar: { carta, comando, versaoCarta, frotaVersao: validacao.frota.versao, frotaHash: validacao.frota.hash },
        resposta: { carta: validacao.carta, comando, plano: validacao.plano, frota: { versao: validacao.frota.versao },
          perfilAntigo: validacao.perfilAntigo,
          aviso: 'Confirmar iniciará uma tentativa real somente se todos os portões ainda passarem e a frota for a mesma. Não há fallback de modelo.' } };
    },
    executar: (g, identidade) => servico.iniciarDespacho({ cartaId: g.carta, comandoId: g.comando, versaoCarta: g.versaoCarta,
      frotaVersao: g.frotaVersao, frotaHash: g.frotaHash, chaveIdempotencia: g.chaveIdempotencia, usuarioId: identidade.usuarioId }),
  });
}

export function criarApiDespacho({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/despacho',
    camposPreparar: ['carta', 'comando', 'versaoCarta'],
    falhaPreparar: { mensagem: 'despacho impedido; confira gate, dependências, contrato, frota e disponibilidade' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira tentativa, lease e card antes de qualquer repetição' } });
}
