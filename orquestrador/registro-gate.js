// Marcação do gate no card. A pré-checagem só-leitura mora em preavaliacao-gate.js.

import { lerCanalPlane } from './canal-plane.js';
import { codificarGate, gatesDoCanal, validarPropostaGate } from './gate-plane.js';
import { recusa } from './contrato-local.js';

export class RegistroGate {
  constructor(servico) { this.s = servico; }

  async validar(cartaId, proposta, substituir = null) {
    const entrada = validarPropostaGate(proposta);
    if (substituir !== null && (!['READY TO DEV', 'READY TO TEST'].includes(substituir) || substituir === entrada.gate)) throw new Error('troca de gate inválida');
    const dados = await this.s.fila({ preavaliarId: cartaId, preavaliarGate: entrada.gate, preavaliarSemGate: substituir, ignorarLeaseId: substituir ? cartaId : null });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!this.s.identidade(item.projetoId)?.escritorGate || !this.s.identidade(item.projetoId)?.autorEscrita) {
      throw new Error('identidade de escrita restrita indisponível para este projeto');
    }
    const gatesAtuais = item.preavaliacaoGate.gatesAtuais.filter(g => g !== substituir);
    if (substituir && !item.labels.includes(substituir)) throw new Error(`gate ${substituir} a trocar não está na carta`);
    if (!item.preavaliacaoGate.pronta || gatesAtuais.length) {
      throw new Error(['gate não pode ser aplicado', ...item.preavaliacaoGate.motivos,
        ...(gatesAtuais.length ? ['gate já presente'] : [])].join('; '));
    }
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm, substituir,
      proposta: entrada, aviso: 'Confirmar marcará o gate no Plane com evidência; não criará lease nem execução.' };
  }

  async registrar(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir = null) {
    if (!this.s.identidades.size) throw recusa('identidade de escrita restrita não configurada');
    const dados = await this.validar(cartaId, proposta, substituir).catch(e => { throw recusa(e.message); });
    if (dados.versaoCarta !== versaoCarta) throw recusa('carta mudou; recarregue antes de marcar gate');
    const escrita = this.s.identidade(dados.projetoId);
    if (!escrita?.escritorGate || !escrita?.autorEscrita) throw recusa('projeto fora do escopo de escrita');
    const html = codificarGate({ projetoId: dados.projetoId, cartaId, chaveIdempotencia, versaoCarta, ...dados.proposta });
    return this.s.estado.comTrava(async () => {
      const historico = await this.s.estado.lerHistorico(cartaId);
      if (historico.some(e => e.tipo === 'GATE_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        const aplicado = historico.find(e => e.tipo === 'GATE_APLICADO' && e.chaveIdempotencia === chaveIdempotencia);
        if (!aplicado) throw recusa('alteração anterior incerta; conferir a etiqueta e o card antes de repetir');
        return { carta: dados.carta, gate: aplicado.gate, aplicado: true, duplicado: true, comentarioId: aplicado.comentarioId };
      }
      const canalAtual = await lerCanalPlane({ consultar: this.s.cliente(), projetoId: dados.projetoId, cartaId });
      const repetido = gatesDoCanal(canalAtual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita })
        .find(g => g.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(validarPropostaGate(repetido)) !== JSON.stringify(validarPropostaGate(proposta))) {
          throw recusa('chave de idempotência usada com outro gate');
        }
        throw recusa('recibo GATE/v1 já existe sem registro local de aplicação; conferir a etiqueta no card antes de repetir');
      }
      const cartaAtual = await this.s.cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de marcar gate');
      await this.s.estado.registrarEvento({ tipo: 'GATE_PENDENTE', cartaId, chaveIdempotencia, gate: dados.proposta.gate, substituir });
      const resultado = await escrita.escritorGate({ projetoId: dados.projetoId, cartaId, chaveIdempotencia,
        versaoCarta, gate: dados.proposta.gate, html, remover: substituir });
      await this.s.estado.registrarEvento({ tipo: 'GATE_APLICADO', cartaId, chaveIdempotencia,
        gate: dados.proposta.gate, comentarioId: resultado.comentarioId });
      return { carta: dados.carta, gate: dados.proposta.gate, aplicado: true, duplicado: false, comentarioId: resultado.comentarioId };
    });
  }
}
