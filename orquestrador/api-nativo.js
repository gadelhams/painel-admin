// Duas ações da liberação do jogo nativo: preparar valida projeto e prazo; confirmar liga (com prazo) ou desliga. A mesma fronteira da vigília.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoesNativo({ liberacao, agora }) {
  return criarDesafios({
    agora,
    async validar({ projeto, horas }) {
      if (!UUID.test(projeto ?? '') || !Number.isInteger(horas)) throw new ErroAcesso('projeto ou prazo inválidos', 422);
      let validacao;
      try { validacao = await liberacao.validar(projeto, horas); }
      catch (erro) { throw new ErroAcesso(erro.message, 422); }
      return { guardar: { projeto, horas }, resposta: validacao };
    },
    executar: (g, identidade) => liberacao.alternar(g.projeto, g.horas, identidade.usuarioId),
  });
}

export function criarApiNativo({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/nativo',
    camposPreparar: ['horas', 'projeto'],
    falhaPreparar: { mensagem: 'liberação recusada; confira projeto e prazo' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira a liberação antes de repetir' } });
}
