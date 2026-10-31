// Duas ações das propostas do C-3PO: preparar mostra projeto, pasta e comando; confirmar, com a mesma sessão SSO do dono, roda uma vez e registra no diário. Não registra proposta.
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';
import { RecusaProposta } from './propostas.js';

const RESUMO = 500;

// Recusa que provadamente não rodou nada: o desafio some e o status é o do motivo.
const recusaLimpa = erro => (erro.semEscrita ? new ErroAcesso(`recusado; nada foi executado: ${erro.message}`, erro.status ?? 422) : null);
const semExecucao = (mensagem, status) => Object.assign(new Error(mensagem), { semEscrita: true, status });

export function criarConfirmacoesAcoes({ propostas, executor, diario, agora, registrarLog = m => console.error(m) }) {
  return criarDesafios({
    agora,
    recusaLimpa,
    async validar({ propostaId }, identidade) {
      const proposta = propostas.obter(propostaId);
      if (!proposta) throw new ErroAcesso('proposta ausente, expirada ou já usada; peça outra ao C-3PO', 404);
      let alvo;
      try { alvo = await propostas.resolver(proposta); }
      catch (erro) { throw new ErroAcesso(erro instanceof RecusaProposta ? erro.message : 'contrato do projeto ilegível', 422); }
      if (executor.ocupado()) throw new ErroAcesso('já há uma ação rodando; espere o resultado dela', 409);
      await diario.anotar({ etapa: 'preparo', quem: identidade.usuarioId, propostaId, projeto: alvo.projeto,
        comandoId: alvo.comandoId, executavel: alvo.executavel, argumentos: alvo.argumentos });
      return { guardar: { propostaId, ...alvo },
        resposta: { projeto: alvo.projeto, pasta: alvo.pasta, comandoId: alvo.comandoId, executavel: alvo.executavel, argumentos: alvo.argumentos,
          aviso: 'Confirmar roda este comando uma vez, nesta máquina, na pasta mostrada, como o usuário do painel; o resultado fica no diário de ações.' } };
    },
    async executar(g, identidade) {
      const vez = executor.tomarVez();
      try {
        if (!propostas.consumir(g.propostaId)) throw semExecucao('proposta expirada ou já usada', 410);
        try {
          await diario.anotar({ etapa: 'confirmacao', quem: identidade.usuarioId, propostaId: g.propostaId, projeto: g.projeto,
            comandoId: g.comandoId, executavel: g.executavel, argumentos: g.argumentos, chave: g.chaveIdempotencia });
        } catch { throw semExecucao('diário de ações indisponível', 503); }
        const r = await executor.rodar(g);
        const resultado = { projeto: g.projeto, pasta: g.pasta, comandoId: g.comandoId, executavel: g.executavel, argumentos: g.argumentos, ...r };
        try {
          await diario.anotar({ etapa: 'resultado', quem: identidade.usuarioId, propostaId: g.propostaId, projeto: g.projeto,
            comandoId: g.comandoId, codigo: r.codigo, sinal: r.sinal, expirou: r.expirou, duracaoMs: r.duracaoMs,
            resumo: r.saida.slice(-RESUMO) });
        } catch (erro) {
          registrarLog(`[acoes] resultado de ${g.propostaId} não entrou no diário: ${erro.code ?? 'erro de escrita'}`);
          resultado.aviso = 'o resultado não entrou no diário de ações; veja o log do painel';
        }
        return resultado;
      } finally { vez.liberar(); }
    },
  });
}

export function criarApiAcoes({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/acoes',
    camposPreparar: ['propostaId'],
    falhaPreparar: { mensagem: 'ação recusada; peça ao C-3PO uma proposta nova' },
    falhaConfirmar: { mensagem: 'resultado incerto; confira o diário de ações antes de repetir' } });
}
