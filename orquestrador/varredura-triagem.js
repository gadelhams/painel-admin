// Lê as folhas sem gate e devolve a triagem. Não grava etiqueta.

import { PROJETOS } from '../projetos.js';
import { criarClientePlane } from '../plane.js';
import { dependenciasDaCarta } from './fila.js';
import { todas } from './contrato-local.js';
import { CATEGORIAS_DEV, classificarProntidaoDev } from './classificar-prontidao-dev.js';

const FECHADOS = new Set(['completed', 'canceled', 'cancelled']);
const GATES = new Set(['READY TO DEV', 'READY TO TEST']);

export class VarreduraTriagem {
  constructor({ consultar, concorrencia }) {
    this.consultar = consultar;
    this.concorrencia = concorrencia;
  }

  async executar() {
    const consulta = this.consultar ?? criarClientePlane({ chave: process.env.PLANE_API_KEY?.trim() });
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
    await Promise.all(Array.from({ length: Math.min(this.concorrencia, semGate.length) }, async () => {
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
  }
}
