// Duas ações da frota: preparar valida contra o catálogo e guarda a versão-base; confirmar grava se a frota não mudou. A sessão que preparou é a que confirma.
import { ErroAcesso } from './sso.js';
import { criarDesafios } from './desafio-duas-acoes.js';
import { criarApiDuasAcoes } from './api-duas-acoes.js';

export function criarConfirmacoesFrota({ servico, agora }) {
  return criarDesafios({
    agora,
    async validar({ executor, zelador, marca }) {
      let validacao;
      try { validacao = await servico.validarFrota({ executor, zelador }, marca); }
      catch (erro) { throw new ErroAcesso(`frota recusada: ${erro.message}`, 422); }
      return { guardar: { conteudo: validacao.conteudo, base: validacao.base },
        resposta: { conteudo: validacao.conteudo, atual: validacao.atual,
          aviso: 'Confirmar grava a frota nova para todos os projetos; tentativas já em curso seguem com a frota que congelaram. Nada é despachado agora.' } };
    },
    executar: (g, identidade) => servico.trocarFrota(g.conteudo, g.base, identidade.usuarioId),
  });
}

export function criarApiFrota({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/orquestracao/frota',
    camposPreparar: ['executor', 'marca', 'zelador'],
    falhaPreparar: { mensagem: 'frota recusada; confira provedor, modelo e esforço de cada papel' },
    falhaConfirmar: { mensagem: 'resultado incerto; recarregue a frota antes de repetir' } });
}
