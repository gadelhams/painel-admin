// Prévia do despacho com a frota atual. Não reserva lease, não abre processo e não escreve no Plane.

import { PROJETOS } from '../projetos.js';
import { comandoPermitido } from './politica.js';
import { prepararPlanoFrota } from './modelos.js';
import { congelarFrota } from './frota.js';
import { contratoDoProjeto } from './contrato-local.js';

export class SimulacaoDespacho {
  constructor(servico) { this.s = servico; }

  async simular(cartaId, comandoId) {
    const dados = await this.s.fila();
    const item = dados.itens.find(x => x.id === cartaId || x.identificador === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!item.elegivel) return { executaria: false, motivos: item.motivos, carta: item.identificador };
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, this.s.raiz);
    comandoPermitido(contrato, comandoId);
    const frota = await this.s.lerFrota();
    if (frota.estado !== 'ok') return { executaria: false, carta: item.identificador, comando: comandoId,
      motivos: [`frota ${frota.estado}: nenhum despacho sem frota válida, sem padrão de reserva`],
      observacao: 'simulação sem lease, processo ou escrita no Plane' };
    const plano = prepararPlanoFrota(contrato, congelarFrota(frota));
    return { executaria: true, carta: item.identificador, comando: comandoId, plano, perfilAntigo: item.perfilAntigo ?? null,
      observacao: 'simulação sem lease, processo ou escrita no Plane; os modelos são os da frota atual' };
  }
}
