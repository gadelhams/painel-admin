// Junta a consulta e o registro do perfil. Sem fallback de modelo.

import { ConsultaPerfil } from './consulta-perfil.js';
import { RegistroPerfil } from './registro-perfil.js';

export class PerfilServico {
  constructor(servico) {
    this.consulta = new ConsultaPerfil(servico);
    this.registro = new RegistroPerfil(servico, this.consulta);
  }

  ler(projetoId, cartaId) { return this.consulta.ler(projetoId, cartaId); }

  modelos(cartaId) { return this.consulta.modelos(cartaId); }

  validar(cartaId, selecoes) { return this.registro.validar(cartaId, selecoes); }

  registrar(cartaId, selecoes, versaoCarta, chaveIdempotencia) {
    return this.registro.registrar(cartaId, selecoes, versaoCarta, chaveIdempotencia);
  }
}
