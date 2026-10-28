// Leitura do card: interações, handoffs e gates. Não grava perfil nem muda estado.

import { PROJETOS } from '../projetos.js';
import { lerCanalPlane } from './canal-plane.js';
import { handoffsDoCanal } from './handoff-plane.js';
import { gatesDoCanal } from './gate-plane.js';

export class CanalCarta {
  constructor(servico) { this.s = servico; }

  async ler(cartaId, projetoId = null) {
    let projetoDaCarta = projetoId && PROJETOS.some(p => p.plane === projetoId) ? projetoId : null;
    if (!projetoDaCarta) {
      const dados = await this.s.fila();
      const item = dados.itens.find(x => x.id === cartaId);
      if (!item) throw new Error('carta não encontrada no Plane');
      projetoDaCarta = item.projetoId;
    }
    const dadosCanal = await lerCanalPlane({ consultar: this.s.cliente(), projetoId: projetoDaCarta, cartaId });
    const autorId = this.s.identidade(projetoDaCarta)?.autorEscrita;
    return { ...dadosCanal, projetoId: projetoDaCarta, handoffs: autorId ? handoffsDoCanal(dadosCanal.interacoes,
      { projetoId: projetoDaCarta, cartaId, autorId }) : [],
    gates: autorId ? gatesDoCanal(dadosCanal.interacoes, { projetoId: projetoDaCarta, cartaId, autorId }) : [] };
  }
}
