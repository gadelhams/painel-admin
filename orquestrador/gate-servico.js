// Junta a pré-checagem e a marcação do gate. A etiqueta não inicia execução.

import { PreavaliacaoGate } from './preavaliacao-gate.js';
import { RegistroGate } from './registro-gate.js';

export class GateServico {
  constructor(servico) {
    this.pre = new PreavaliacaoGate(servico);
    this.registro = new RegistroGate(servico);
  }

  preavaliar(cartaId, gate) { return this.pre.preavaliar(cartaId, gate); }

  validar(cartaId, proposta, substituir = null) { return this.registro.validar(cartaId, proposta, substituir); }

  registrar(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir = null) {
    return this.registro.registrar(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir);
  }
}
