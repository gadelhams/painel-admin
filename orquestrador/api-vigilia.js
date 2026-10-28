// Duas ações da vigília: preparar valida a alternância de um projeto; confirmar liga ou desliga. A mesma fronteira das cartas, por projeto.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

import { UUID } from './uuid.js';

export function criarConfirmacoesVigilia({ vigilia, agora }) {
  return criarDesafios({
    agora,
    async validar({ projeto, ligar }) {
      if (!UUID.test(projeto ?? '') || typeof ligar !== 'boolean') throw new ErroAcesso('projeto ou ação inválidos', 422);
      let validacao;
      try { validacao = await vigilia.validarAlternancia(projeto, ligar); }
      catch (erro) { throw new ErroAcesso(erro.message, 422); }
      return { guardar: { projeto, ligar }, resposta: validacao };
    },
    executar: (g, identidade) => vigilia.alternar(g.projeto, g.ligar, identidade.usuarioId),
  });
}

export function criarApiVigilia({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/vigilia',
    camposPreparar: ['projeto', 'ligar'],
    falhaPreparar: { mensagem: 'vigília recusada; confira contrato, executor e identidade' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira o estado da vigília antes de repetir' } });
}
