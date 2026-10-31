// Duas ações da encomenda de nave: preparar valida o pedido e devolve o resumo; confirmar, com a mesma sessão SSO do dono, grava a linha `pedida`. Não cria projeto.
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';
import { RecusaEncomenda } from './pedido-encomenda.js';

export function criarConfirmacoesEncomendas({ registro, agora }) {
  return criarDesafios({
    agora,
    async validar(entrada) {
      let pedido;
      try { pedido = await registro.validar(entrada); }
      catch (erro) { throw erro instanceof RecusaEncomenda ? new ErroAcesso(erro.message, 422) : erro; }
      return { guardar: pedido,
        resposta: { ...pedido,
          aviso: 'Confirmar só registra o pedido no painel. O orquestrador cria o projeto e os módulos no Plane e acrescenta a nave ao catálogo; até lá a vaga mostra "pedida".' } };
    },
    executar: (g, identidade) => registro.registrar({ nome: g.nome, sigla: g.sigla, modulos: g.modulos }, identidade.usuarioId),
  });
}

export function criarApiEncomendas({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/hangar/encomendas',
    camposPreparar: ['modulos', 'nome', 'sigla'],
    falhaPreparar: { mensagem: 'encomenda recusada; confira nome, sigla e módulos' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira as encomendas pendentes antes de repetir' } });
}
