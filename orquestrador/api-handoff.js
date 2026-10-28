// Duas ações do handoff: preparar guarda a entrada; confirmar grava o comentário. A sessão que preparou é a que confirma; texto não autoriza execução.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarConfirmacoesHandoff({ servico, agora }) {
  return criarDesafios({
    agora,
    async validar({ carta, entrada, versaoCarta }) {
      if (!UUID.test(carta ?? '') || !Number.isFinite(Date.parse(versaoCarta))) throw new ErroAcesso('carta ou versão inválida', 422);
      const validacao = await servico.validarHandoff(carta, entrada);
      if (validacao.versaoCarta !== versaoCarta) throw new ErroAcesso('carta mudou; recarregue antes de preparar', 409);
      return { guardar: { carta, versaoCarta, entrada: validacao.entrada },
        resposta: { carta: validacao.carta, entrada: validacao.entrada, aviso: validacao.aviso } };
    },
    executar: g => servico.registrarHandoff(g.carta, g.entrada, g.versaoCarta, g.chaveIdempotencia),
  });
}

export function criarApiHandoff({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/handoff',
    camposPreparar: ['carta', 'entrada', 'versaoCarta'],
    falhaPreparar: { mensagem: 'handoff recusado; confira carta, tentativa e evidência' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira o card antes de repetir o handoff' } });
}
