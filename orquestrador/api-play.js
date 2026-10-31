// Duas ações do play por nave: preparar valida projeto e direção; confirmar liga ou desliga, sob a trava. A mesma fronteira do "Steam livre".
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoesPlay({ play, atividade, agora }) {
  return criarDesafios({
    agora,
    async validar({ projeto, ligar }) {
      if (!UUID.test(projeto ?? '') || typeof ligar !== 'boolean') throw new ErroAcesso('projeto ou ação inválidos', 422);
      let validacao;
      try { validacao = await play.validar(projeto, ligar, { atividade }); }
      catch (erro) { throw new ErroAcesso(erro.message, 422); }
      return { guardar: { projeto, ligar }, resposta: validacao };
    },
    executar: (g, identidade) => play.alternar(g.projeto, g.ligar, identidade.usuarioId),
  });
}

export function criarApiPlay({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/play',
    camposPreparar: ['ligar', 'projeto'],
    falhaPreparar: { mensagem: 'play recusado; confira o projeto' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira o play antes de repetir' } });
}
