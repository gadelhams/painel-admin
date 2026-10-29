// Leitura do card: interações, handoffs e gates. Não grava perfil nem muda estado.

import { PROJETOS } from '../projetos.js';
import { lerCanalPlane } from './canal-plane.js';
import { handoffsDoCanal } from './handoff-plane.js';
import { gatesDoCanal } from './gate-plane.js';
import { resumirCarta } from './resumo-carta.js';

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
    const handoffs = autorId ? handoffsDoCanal(dadosCanal.interacoes, { projetoId: projetoDaCarta, cartaId, autorId }) : [];
    const gates = autorId ? gatesDoCanal(dadosCanal.interacoes, { projetoId: projetoDaCarta, cartaId, autorId }) : [];
    const { descricaoHtml, ...resto } = dadosCanal;
    return { ...resto, projetoId: projetoDaCarta, handoffs, gates,
      resumo: resumirCarta({ descricaoHtml, interacoes: dadosCanal.interacoes, handoffs, gates }) };
  }
}
