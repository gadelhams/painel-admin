// Troca o grupo de estado de uma carta. Não escolhe modelo nem registra perfil.

import { recusa } from './contrato-local.js';

export class EstadoCarta {
  constructor(servico) { this.s = servico; }

  async mudar(cartaId, projetoId, grupo, versaoCarta, removerEtiqueta = null) {
    const escrita = this.s.identidade(projetoId);
    if (!escrita?.escritorEstado || !escrita?.autorEscrita) throw recusa('identidade de escrita de estado indisponível para este projeto');
    return this.s.estado.comTrava(async () => {
      await this.s.estado.registrarEvento({ tipo: 'ESTADO_PENDENTE', cartaId, grupo, removerEtiqueta });
      const resultado = await escrita.escritorEstado({ projetoId, cartaId, grupo, versaoCarta, removerEtiqueta });
      await this.s.estado.registrarEvento({ tipo: 'ESTADO_ALTERADO', cartaId, grupo, estadoNome: resultado.estadoNome, removerEtiqueta });
      return resultado;
    });
  }
}
