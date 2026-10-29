// Projeção limitada e só-leitura da fila/triagem para a conversa do C-3PO.
// Não confunde a classificação automática com uma decisão de produto.
import { CATEGORIAS_DEV } from './triagem.js';
import { PROJETOS } from '../projetos.js';

const LIMITE = 30;
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
  };
}
