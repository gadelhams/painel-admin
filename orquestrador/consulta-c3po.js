// Projeção limitada e só-leitura da fila/triagem para a conversa do C-3PO.
// Não confunde a classificação automática com uma decisão de produto.
import { CATEGORIAS_DEV } from './triagem.js';
import { PROJETOS } from '../projetos.js';

const LIMITE = 30;
// "Por que a frota não puxou?" precisa desta resposta, que nenhum dado da fila dá sozinho.
// Muda junto com o código (F4b, 31/10/2026: o zelador marca READY TO DEV e a vigília do Hangar despacha).
export const COMO_A_FROTA_PUXA = 'A frota puxa sozinha só nos projetos com o play da nave ligado e só onde a unit tem ORQ_AGENDADOR=true: o zelador propõe PRONTA, julgando linha a linha a prosa que fala de dependência, e o painel, depois de vetar citação de carta do catálogo sem relação formal e conferir ao vivo a prontidão, os ancestrais e a sandbox bwrap, tira a carta do Backlog, declara "Dependências: nenhuma" quando não há relação e marca READY TO DEV com recibo GATE/v1 próprio (PAINEL-62); a vigília do Hangar despacha UMA carta por vez, de qualquer projeto com play, contrato .orquestrador.json, identidade técnica e frota válida, em round-robin e sob o teto diário. Sem isso, uma carta só roda por despacho com o clique do dono (SSO + duas ações). Nunca push nem merge (painel-admin/docs/plano-frota-do-hangar.md).';
const pastas = new Map(PROJETOS.filter(projeto => projeto.plane).map(projeto => [projeto.plane, projeto.pasta]));
const camposDaCarta = item => ({
  identificador: item.identificador,
  titulo: item.titulo,
  projeto: item.projeto,
  pasta: pastas.get(item.projetoId),
  estado: item.estado,
  gate: item.gate,
  elegivel: item.elegivel,
  motivos: item.motivos,
  agente: item.agente,
  lease: item.lease,
});

export async function consultarOrquestracaoC3po({ orquestracao, triagemDev },
  { modo = 'fila', identificador, categoria, gate = 'READY TO DEV' } = {}) {
  const id = identificador?.trim().toUpperCase();
  if (modo === 'triagem_dev') {
    if (categoria && !CATEGORIAS_DEV.some(c => c.codigo === categoria)) throw new Error('categoria de triagem inválida');
    const triagem = await triagemDev();
    const filtrados = triagem.itens.filter(item => (!id || item.identificador.toUpperCase() === id) &&
      (!categoria || item.categorias.includes(categoria)));
    return {
      modo, atualizadoEm: triagem.atualizadoEm, totalSemGate: triagem.total,
      folhas: triagem.folhas, categorias: triagem.categorias,
      encontrados: filtrados.length, exibidos: Math.min(filtrados.length, LIMITE),
      itens: filtrados.slice(0, LIMITE).map(item => ({ ...item, pasta: pastas.get(item.projetoId) })),
      observacao: triagem.observacao,
    };
  }
  const fila = await orquestracao.fila();
  const encontrados = id
    ? fila.itens.filter(item => item.identificador.toUpperCase() === id)
    : fila.itens.filter(item => item.gate);
  if (modo === 'prontidao') {
    if (!id) throw new Error('identificador obrigatório para pré-checar prontidão');
    if (!encontrados.length) throw new Error('carta não encontrada na fila do Plane');
    if (!['READY TO DEV', 'READY TO TEST'].includes(gate)) throw new Error('gate inválido');
    return { modo, pasta: pastas.get(encontrados[0].projetoId),
      ...await orquestracao.preavaliar(encontrados[0].id, gate) };
  }
  if (modo !== 'fila') throw new Error('modo de consulta inválido');
  return {
    modo, atualizadoEm: fila.atualizadoEm, total: fila.itens.length,
    candidatosComGate: fila.itens.filter(item => item.gate).length,
    encontrados: encontrados.length, exibidos: Math.min(encontrados.length, LIMITE),
    itens: encontrados.slice(0, LIMITE).map(camposDaCarta),
    // Os modelos que rodariam são os da frota, não os do contrato.
    frota: fila.frota ?? null,
    // Por projeto: quantas cartas têm gate, quantas rodariam agora e o que impede o projeto.
    projetos: (fila.projetos ?? []).map(p => ({ nome: p.nome, pasta: pastas.get(p.id), candidatas: p.candidatas, elegiveis: p.elegiveis, impedimento: p.impedimento })),
    comoAFrotaPuxa: COMO_A_FROTA_PUXA,
  };
}
