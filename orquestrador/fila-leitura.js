// Junta as cartas do Plane com o contrato local. O julgamento mora em carta-da-fila.js.

import { PROJETOS } from '../projetos.js';
import { contratoDoProjeto, todas } from './contrato-local.js';
import { CartaDaFila } from './carta-da-fila.js';
import { ResumoFila } from './resumo-fila.js';

export class FilaLeitura {
  constructor(servico) { this.s = servico; }

  async listar({ preavaliarId = null, preavaliarGate = null, ignorarLeaseId = null, preavaliarSemGate = null } = {}) {
    const consulta = this.s.cliente();
    const catalogo = new Map(PROJETOS.filter(p => p.plane).map(p => [p.plane, p]));
    const projetos = (await todas(consulta, '/projects/')).filter(p => catalogo.has(p.id));
    const lotes = await Promise.all(projetos.map(async p => {
      const itens = await todas(consulta, `/projects/${p.id}/work-items/?expand=state,labels`);
      return itens.map(c => ({ ...c, sigla: p.identifier, projetoNome: p.name, projetoId: p.id }));
    }));
    const cartas = lotes.flat();
    const porId = new Map(cartas.map(c => [c.id, c]));
    for (const c of cartas) c.filhos = [];
    for (const c of cartas) if (c.parent && porId.has(c.parent)) porId.get(c.parent).filhos.push(c.id);
    const contratos = new Map(await Promise.all(projetos.map(async p => [p.id, await contratoDoProjeto(catalogo.get(p.id), this.s.raiz)])));
    const montador = new CartaDaFila(this.s);
    const itens = await Promise.all(cartas.filter(c => !['canceled', 'cancelled'].includes(c.state?.group)).map(c => montador.montar(c, {
      contratos, porId, consulta, preavaliarId, preavaliarGate, ignorarLeaseId, preavaliarSemGate,
    })));
    itens.sort((a, b) => Number(b.elegivel) - Number(a.elegivel) || a.identificador.localeCompare(b.identificador, 'pt-BR', { numeric: true }));
    const podeExecutar = [...this.s.identidades.keys()].some(id => this.s.podeDespachar(id));
    return ResumoFila.de({ itens, projetos, catalogo, podeExecutar });
  }
}
