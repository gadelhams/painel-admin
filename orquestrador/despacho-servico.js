// Junta a checagem e a tentativa real. A prévia sem lease mora em simulacao-despacho.js.

import { ChecagemDespacho } from './checagem-despacho.js';
import { TentativaDespacho } from './tentativa-despacho.js';

export class DespachoServico {
  constructor(servico) {
    this.checagem = new ChecagemDespacho(servico);
    this.tentativa = new TentativaDespacho(servico, this.checagem);
  }

  validar(cartaId, comandoId, versaoCarta, ignorarLeaseId = null) {
    return this.checagem.validar(cartaId, comandoId, versaoCarta, ignorarLeaseId);
  }

  iniciar(pedido) { return this.tentativa.iniciar(pedido); }
}
