// Duas ações da mesa de decisão (gravar, retomar e abandonar): o esqueleto de SSO + desafio de 2 min de orquestrador/, com os campos fechados da mesa. Não lê nem grava o Plane sozinho.
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';

// Falha que provadamente não gravou nada NESTA operação: o desafio some e o status é o do
// motivo. A aplicação só deixa escapar recusa (`semEscrita` ou ErroAcesso) antes do comentário
// de intenção; depois dele tudo vira "resultado incerto" (erro comum, a fronteira diz isso).
// Na retomada e no abandono o comentário pode já estar na carta: o rótulo é "nada novo".
const recusaLimpa = prefixo => erro => (erro.semEscrita || erro instanceof ErroAcesso
  ? new ErroAcesso(`${prefixo}: ${erro.message}`, erro.status ?? 422) : null);

export function criarConfirmacoesDecisao({ servico, aplicacao, agora }) {
  return criarDesafios({ agora, recusaLimpa: recusaLimpa('recusado; nada foi gravado'),
    validar: entrada => servico.preparar(entrada),
    executar: (guardado, identidade) => aplicacao.confirmar(guardado, identidade) });
}

export function criarConfirmacoesRetomada({ servico, aplicacao, agora }) {
  return criarDesafios({ agora, recusaLimpa: recusaLimpa('retomada recusada; nada novo foi gravado'),
    validar: entrada => servico.prepararRetomada(entrada),
    executar: (guardado, identidade) => aplicacao.retomar(guardado.chave, identidade) });
}

export function criarConfirmacoesAbandono({ servico, aplicacao, agora }) {
  return criarDesafios({ agora, recusaLimpa: recusaLimpa('abandono recusado; nada novo foi gravado'),
    validar: entrada => servico.prepararAbandono(entrada),
    executar: (guardado, identidade) => aplicacao.abandonar(guardado.chave, identidade) });
}

export function criarApiDecisao({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/decisao',
    camposPreparar: ['carta', 'decisao', 'motivo', 'efeitos'],
    falhaPreparar: { mensagem: 'não consegui ler a carta no Plane agora; nada foi gravado' },
    falhaConfirmar: { mensagem: 'resultado incerto; veja "aplicação pendente" na aba Decisões e retome ou abandone de lá' } });
}

export function criarApiRetomada({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/decisao/retomada',
    camposPreparar: ['chave'],
    falhaPreparar: { mensagem: 'não consegui reler a carta no Plane agora; nada foi gravado' },
    falhaConfirmar: { mensagem: 'retomada incerta; a aplicação continua pendente — tente de novo mais tarde ou abandone' } });
}

export function criarApiAbandono({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/decisao/abandono',
    camposPreparar: ['chave'],
    falhaPreparar: { mensagem: 'não consegui ler o diário da mesa agora' },
    falhaConfirmar: { mensagem: 'abandono incerto; confira as aplicações pendentes antes de repetir' } });
}
