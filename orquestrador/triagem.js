// Triagem só-leitura para READY TO DEV. Classifica impedimentos verificáveis;
// não interpreta ausência de impedimento estrutural como aceite do conteúdo.
import { PROJETOS } from '../projetos.js';
import { criarClientePlane } from '../plane.js';
import { dependenciasDaCarta } from './fila.js';

export const CATEGORIAS_DEV = Object.freeze([
  { codigo: 'CARTA_PAI', nome: 'Carta-pai / épica', tipo: 'estrutura' },
  { codigo: 'RASCUNHO', nome: 'Rascunho', tipo: 'estrutura' },
  { codigo: 'ASTARGNE', nome: 'Intervenção humana indicada', tipo: 'revisao-humana' },
  { codigo: 'BLOQUEADA', nome: 'Bloqueio explícito', tipo: 'revisao-humana' },
  { codigo: 'ESCOPO_SUSPENSO', nome: 'Fora de escopo ou congelada', tipo: 'revisao-humana' },
  { codigo: 'POS_PLAYTEST', nome: 'Após playtest', tipo: 'revisao-humana' },
  { codigo: 'DEPENDENCIA_PENDENTE', nome: 'Dependência formal pendente', tipo: 'dependencia' },
  { codigo: 'DEPENDENCIA_INDISPONIVEL', nome: 'Relação ou alvo indisponível', tipo: 'dependencia' },
  { codigo: 'DEPENDENCIA_NAO_AUDITADA', nome: 'Dependências sem prova formal', tipo: 'dependencia' },
  { codigo: 'ESTADO_INADEQUADO', nome: 'Estado não adequado ao DEV', tipo: 'fluxo' },
  { codigo: 'CONTEUDO_A_REVISAR', nome: 'Escopo e aceite ainda não revisados', tipo: 'evidencia' },
]);
const FECHADOS = new Set(['completed', 'canceled', 'cancelled']);
const GATES = new Set(['READY TO DEV', 'READY TO TEST']);

export function classificarProntidaoDev(carta, dependencias = []) {
  if (carta.filhos?.length) return ['CARTA_PAI'];
  const etiquetas = new Set((carta.labels ?? []).map(l => typeof l === 'string' ? l : l.name));
  const categorias = [];
  if (carta.is_draft) categorias.push('RASCUNHO');
  if (etiquetas.has('ASTARGNE') || /\((ASTARGNE|DONO)(?:[: )])/i.test(carta.description_html ?? '')) categorias.push('ASTARGNE');
  if (etiquetas.has('BLOQUEADA') || /\(BLOQUEADA(?:[: )])/i.test(carta.description_html ?? '')) categorias.push('BLOQUEADA');
  if (etiquetas.has('SEM ESCOPO') || etiquetas.has('CONGELADA')) categorias.push('ESCOPO_SUSPENSO');
  if (etiquetas.has('PÓS-PLAYTEST')) categorias.push('POS_PLAYTEST');
  if (dependencias.some(d => d.estado === 'pendente')) categorias.push('DEPENDENCIA_PENDENTE');
  if (dependencias.some(d => d.estado === 'desconhecida')) categorias.push('DEPENDENCIA_INDISPONIVEL');
  if (dependencias.some(d => !['concluida', 'pendente', 'desconhecida'].includes(d.estado))) categorias.push('DEPENDENCIA_NAO_AUDITADA');
  if (!['unstarted', 'started'].includes(carta.state?.group ?? carta.state?.type)) categorias.push('ESTADO_INADEQUADO');
  if (!categorias.length) categorias.push('CONTEUDO_A_REVISAR');
  return categorias;
}

async function todas(consultar, caminho) {
  const itens = [];
  let cursor;
  do {
    const sep = caminho.includes('?') ? '&' : '?';
    const pagina = await consultar(`${caminho}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(pagina.results)) throw new Error('resposta paginada inválida do Plane');
    itens.push(...pagina.results);
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return itens;
}

export function criarTriagemDev({ consultar, concorrencia = 8 } = {}) {
  if (!Number.isInteger(concorrencia) || concorrencia < 1 || concorrencia > 16) throw new Error('concorrência de triagem inválida');
  let emAndamento = null;
  return function triagemDev() {
    if (!emAndamento) emAndamento = executar().finally(() => { emAndamento = null; });
    return emAndamento;
  };
  async function executar() {
    const consulta = consultar ?? criarClientePlane({ chave: process.env.PLANE_API_KEY?.trim() });
    const catalogo = new Map(PROJETOS.filter(p => p.plane).map(p => [p.plane, p]));
    const projetos = (await todas(consulta, '/projects/')).filter(p => catalogo.has(p.id));
    const cartas = (await Promise.all(projetos.map(async p => (await todas(consulta,
      `/projects/${p.id}/work-items/?expand=state,labels`)).map(c => ({ ...c, sigla: p.identifier, projetoId: p.id }))))).flat();
    const porId = new Map(cartas.map(c => [c.id, c]));
    for (const carta of cartas) carta.filhos = [];
    for (const carta of cartas) if (carta.parent && porId.has(carta.parent)) porId.get(carta.parent).filhos.push(carta.id);
    const semGate = cartas.filter(c => !FECHADOS.has(c.state?.group) && !(c.labels ?? []).some(l => GATES.has(l.name)));
    const resultado = new Array(semGate.length);
    let proximo = 0;
    await Promise.all(Array.from({ length: Math.min(concorrencia, semGate.length) }, async () => {
      while (proximo < semGate.length) {
        const indice = proximo++;
        const carta = semGate[indice];
        let dependencias = [];
        if (!carta.filhos.length) {
          let relacoes;
          try { relacoes = await consulta(`/projects/${carta.projetoId}/work-items/${carta.id}/relations/`); }
          catch { relacoes = null; }
          dependencias = dependenciasDaCarta(carta, relacoes, porId);
        }
        const codigos = classificarProntidaoDev(carta, dependencias);
        resultado[indice] = { id: carta.id, identificador: `${carta.sigla}-${carta.sequence_id}`,
          projetoId: carta.projetoId, titulo: carta.name, estado: carta.state?.name ?? '?',
          categorias: codigos, principal: codigos[0],
          dependencias: dependencias.filter(d => d.estado !== 'concluida') };
      }
    }));
    resultado.sort((a, b) => a.identificador.localeCompare(b.identificador, 'pt-BR', { numeric: true }));
    return {
      atualizadoEm: new Date().toISOString(),
      total: resultado.length,
      folhas: resultado.filter(x => !x.categorias.includes('CARTA_PAI')).length,
      categorias: CATEGORIAS_DEV.map(c => ({ ...c, total: resultado.filter(x => x.categorias.includes(c.codigo)).length })),
      itens: resultado,
      observacao: 'Categorias podem se sobrepor. ASTARGNE não implica decisão de produto; escopo e aceite exigem revisão de conteúdo. Contrato, agente, identidade e lease são portões de despacho separados. Nenhum gate foi aplicado.',
    };
  };
}
