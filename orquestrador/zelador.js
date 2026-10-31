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
  executarGit, raiz, intervaloMs, tetoDia, agora = Date.now, registrarLog = () => {}, cli = null }) {
  const diario = new DiarioZelador({ diretorio, agora });
  const leases = new LeaseZelador({ diretorio, comTrava: servico.comTrava, agora });
  const git = new GitZelador(executarGit ? { executar: executarGit } : {});
  const retrato = new RetratoZelador({ consultar, git, estado });
  const cliZelador = cli ?? new CliZelador({ spawn, ambiente, agora });
  const fabricaJob = ({ jobId, projeto, pasta, tupla, frotaCongelada, aoFase }) => new JobZelador({ jobId, projeto, pasta, tupla, frotaCongelada,
    play, leases, diario, retrato, cli: cliZelador, git, escritor, estado, pausas: servico.pausasFrota, consultar, comTrava: servico.comTrava, agora, aoFase });
  const agendador = new AgendadorZelador({ servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar,
    ...(raiz ? { raiz } : {}), ...(intervaloMs ? { intervaloMs } : {}), ...(tetoDia ? { tetoDia } : {}), agora, registrarLog });
  return {
    diario,
    leases,
    estado: () => agendador.estado(),
    atual: () => agendador.atual,
    recuperar: () => agendador.recuperar(),
    rodarUmaVez: () => agendador.rodarUmaVez(),
    iniciar: (podeAgendar) => agendador.iniciar(podeAgendar),
    parar: () => agendador.parar(),
  };
}
