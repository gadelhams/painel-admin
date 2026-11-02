// Composição do zelador do Hangar: diário, leases, git, retrato, CLI, escritor e agendador ligados num objeto. Não implementa regra nenhuma.
//
// F3 da frota (31/10/2026; plano em docs/plano-frota-do-hangar.md). Quem compõe é a montagem;
// os testes passam Plane, CLI, git, relógio e disco falsos pelas mesmas portas.
import { DiarioZelador } from './zelador-diario.js';
import { LeaseZelador } from './zelador-lease.js';
import { GitZelador } from './zelador-git.js';
import { RetratoZelador } from './zelador-retrato.js';
import { CliZelador } from './zelador-cli.js';
import { JobZelador } from './zelador-job.js';
import { AgendadorZelador } from './zelador-agendador.js';

export function criarZelador({ servico, estado, play, escritor, diretorio, consultar, spawn, ambiente = process.env, lerConsumo, ocupacao,
  executarGit, raiz, intervaloMs, tetoDia, agora = Date.now, registrarLog = () => {}, cli = null, projetos, pendenciasMesa,
  elegibilidadeGate, cartaReservada = null, autorDecisao = null }) {
  const diario = new DiarioZelador({ diretorio, agora });
  const leases = new LeaseZelador({ diretorio, comTrava: servico.comTrava, agora });
  const git = new GitZelador(executarGit ? { executar: executarGit } : {});
  const retrato = new RetratoZelador({ consultar, git, estado, cartaReservada, ...(projetos ? { projetos } : {}), ...(pendenciasMesa ? { pendenciasMesa } : {}) });
  const cliZelador = cli ?? new CliZelador({ spawn, ambiente, agora });
  const fabricaJob = ({ jobId, projeto, pasta, tupla, frotaCongelada, aoFase }) => new JobZelador({ jobId, projeto, pasta, tupla, frotaCongelada,
    play, leases, diario, retrato, cli: cliZelador, git, escritor, estado, pausas: servico.pausasFrota, consultar, comTrava: servico.comTrava, agora, ocupacao, aoFase,
    servico, cartaReservada, autorDecisao, ...(elegibilidadeGate ? { elegibilidadeGate } : {}) });
  const agendador = new AgendadorZelador({ servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar,
    ...(raiz ? { raiz } : {}), ...(intervaloMs ? { intervaloMs } : {}), ...(tetoDia ? { tetoDia } : {}), agora, registrarLog });
  // O que está em curso no projeto, para o aviso do play: o job desta instância ou, pelo lease
  // em disco, o de outra (B22). Lease ilegível também é dito.
  async function atividade(projetoId) {
    const a = agendador.atual;
    if (a?.projetoId === projetoId) return `job do zelador (${a.fase})`;
    const l = await leases.ler(projetoId);
    if (l?.ilegivel) return 'lease do zelador ilegível';
    return leases.vigente(l) ? 'job do zelador (lease em disco, outra instância)' : null;
  }
  return {
    diario,
    leases,
    atividade,
    // B13: o recibo de fechamento sai com o play desligado só para projeto elegível com aquele
    // PENDENTE aberto (`chave` null: algum PENDENTE do projeto, para o job que só fecha recibos).
    escopoRecibo: async (projetoId, chave) => play.elegivel(projetoId)
      && (await diario.pendentes()).some(p => p.projetoId === projetoId && (chave === null || p.chave === chave)),
    estado: () => agendador.estado(),
    atual: () => agendador.atual,
    recuperar: () => agendador.recuperar(),
    rodarUmaVez: () => agendador.rodarUmaVez(),
    iniciar: (podeAgendar) => agendador.iniciar(podeAgendar),
    parar: () => agendador.parar(),
  };
}
