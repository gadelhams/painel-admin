// Compõe a mesa de decisão a partir do ambiente: leitor Guest, escritor Painel Admin (ou o motivo de não haver), diário, aplicação e os desafios das duas ações (gravar, retomar, abandonar). Não registra rota nem autoriza.
//
// A chave do Painel Admin NÃO vem do ambiente: o escritor a lê do arquivo a cada operação.
// Do ambiente vem só o UUID fixo do ator (`PLANE_ADMIN_ACTOR_ID`), contra o qual `/users/me`
// é conferido antes de toda escrita. Sem ele, a mesa abre só para leitura.
import { criarLeitorCarta } from './leitor-carta.js';
import { criarEscritorDecisaoPlane } from './escritor-decisao-plane.js';
import { criarDiarioDecisao } from './diario-decisao.js';
import { criarAplicacaoDecisao } from './aplicacao-decisao.js';
import { criarServicoDecisao } from './servico-decisao.js';
import { criarConfirmacoesAbandono, criarConfirmacoesDecisao, criarConfirmacoesRetomada } from './api-decisao.js';
import { projetosDaMesa } from './permissao.js';

function escritorDaMesa({ ambiente, fetchPlane, arquivoChave, log }) {
  const ator = ambiente.PLANE_ADMIN_ACTOR_ID?.trim();
  if (!ator) return { motivo: 'PLANE_ADMIN_ACTOR_ID ausente no .env: a mesa fica só leitura' };
  if (!ambiente.PLANE_API_KEY?.trim()) return { motivo: 'sem PLANE_API_KEY (Guest) a mesa não relê a carta: fica só leitura' };
  try {
    return { escritor: criarEscritorDecisaoPlane({ autorEsperado: ator, projetosPermitidos: projetosDaMesa().map(p => p.projetoId),
      ...(arquivoChave ? { arquivoChave } : {}), ...(fetchPlane ? { fetchImpl: fetchPlane } : {}) }) };
  } catch {
    log('[decisao] PLANE_ADMIN_ACTOR_ID inválido; mesa só leitura');
    return { motivo: 'PLANE_ADMIN_ACTOR_ID inválido (precisa ser o UUID do Painel Admin): a mesa fica só leitura' };
  }
}

export function criarMesaDecisao({ ambiente, fetchPlane, diretorio, estado, agora, arquivoChave, limparCache, log = console.error }) {
  const leitor = criarLeitorCarta({ chave: ambiente.PLANE_API_KEY?.trim(), ...(fetchPlane ? { fetchImpl: fetchPlane } : {}) });
  const { escritor = null, motivo = null } = escritorDaMesa({ ambiente, fetchPlane, arquivoChave, log });
  const diario = criarDiarioDecisao({ diretorio, agora });
  const aplicacao = criarAplicacaoDecisao({ leitor, escritor, diario, comTrava: estado.comTrava, lerLease: estado.lerLease, agora, limparCache });
  const servico = criarServicoDecisao({ leitor, escritor, motivoSemEscrita: motivo, diario, aplicacao, agora, ambiente });
  return { servico, confirmacoes: criarConfirmacoesDecisao({ servico, aplicacao, agora }),
    retomada: criarConfirmacoesRetomada({ servico, aplicacao, agora }), abandono: criarConfirmacoesAbandono({ servico, aplicacao, agora }) };
}
