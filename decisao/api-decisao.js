// Duas ações da mesa de decisão (gravar e retomar): o esqueleto de SSO + desafio de 2 min de orquestrador/, com os campos fechados da mesa. Não lê nem grava o Plane sozinho.
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';

// Falha que provadamente não gravou nada: o desafio some e o status é o do motivo.
const recusaLimpa = erro => (erro.semEscrita ? new ErroAcesso(`recusado; nada foi gravado: ${erro.message}`, erro.status ?? 422) : null);

export function criarConfirmacoesDecisao({ servico, aplicacao, agora }) {
  return criarDesafios({ agora, recusaLimpa,
    validar: entrada => servico.preparar(entrada),
    executar: (guardado, identidade) => aplicacao.confirmar(guardado, identidade) });
}

export function criarConfirmacoesRetomada({ servico, aplicacao, agora }) {
  return criarDesafios({ agora, recusaLimpa,
    validar: entrada => servico.prepararRetomada(entrada),
    executar: guardado => aplicacao.retomar(guardado.chave) });
}

export function criarApiDecisao({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/decisao',
    camposPreparar: ['carta', 'decisao', 'motivo', 'efeitos'],
    falhaPreparar: { mensagem: 'não consegui ler a carta no Plane agora; nada foi gravado' },
    falhaConfirmar: { mensagem: 'resultado incerto; veja "aplicação pendente" na aba Decisões e retome de lá' } });
}

export function criarApiRetomada({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/decisao/retomada',
    camposPreparar: ['chave'],
    falhaPreparar: { mensagem: 'não consegui ler o diário da mesa agora' },
    falhaConfirmar: { mensagem: 'retomada incerta; a aplicação continua pendente — tente de novo mais tarde' } });
}
