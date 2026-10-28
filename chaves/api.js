// Fronteira HTTP de /api/chaves/preparar e /api/chaves/confirmar. A sessão vem antes do corpo; o valor só viaja no confirmar.
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';

export function criarApiChaves({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/chaves',
    camposPreparar: ['projeto', 'nome', 'alvo'],
    camposConfirmar: [['confirmacaoId'], ['confirmacaoId', 'valor']],
    argumentosConfirmar: (corpo, identidade) => [corpo.confirmacaoId, corpo.valor, identidade],
    mensagemCamposConfirmar: 'confirmação aceita só o identificador e o valor',
    falhaPreparar: { status: 409, mensagem: 'resultado incerto; confira o arquivo e o serviço antes de repetir' },
    falhaConfirmar: { status: 409, mensagem: 'resultado incerto; confira o arquivo e o serviço antes de repetir' } });
}
