// Pré-checagem só-leitura do gate. A marcação mora em registro-gate.js.

export class PreavaliacaoGate {
  constructor(servico) { this.s = servico; }

  async preavaliar(cartaId, gate) {
    if (!/^[0-9a-f-]{36}$/i.test(cartaId ?? '') || !['READY TO DEV', 'READY TO TEST'].includes(gate)) {
      throw new Error('carta ou gate inválido');
    }
    const dados = await this.s.fila({ preavaliarId: cartaId, preavaliarGate: gate });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const gatesAtuais = item.labels.filter(x => x === 'READY TO DEV' || x === 'READY TO TEST');
    const ajustesDoGate = gatesAtuais.length > 1 ? ['Resolver gates conflitantes; somente um pode permanecer. Registrar a decisão na carta.']
      : gatesAtuais.length === 1 && gatesAtuais[0] !== gate ? [`Revisar evidência e registrar a troca de ${gatesAtuais[0]} para ${gate} no Plane.`]
        : gatesAtuais.length === 0 ? [`Revisar e registrar evidência de prontidão na carta; IA autorizada ou pessoa pode marcar ${gate} no Plane.`] : [];
    if (gatesAtuais.length === 1 && item.provenienciaGate !== 'verificada') {
      ajustesDoGate.push(`Comprovar no card a autoria e a evidência GATE/v1 do gate atual: ${item.provenienciaGate}.`);
    }
    return {
      carta: item.identificador, gateProposto: gate, gatesAtuais,
      ajustesDoGate,
      pendenciasTecnicas: item.preavaliacao.pendencias,
      pendenciasDoGate: item.preavaliacaoGate.motivos,
      gatePodeSerMarcado: item.preavaliacaoGate.pronta && gatesAtuais.length === 0,
      podeRegistrarGate: Boolean(this.s.identidade(item.projetoId)?.escritorGate && this.s.identidade(item.projetoId)?.autorEscrita),
      versaoCarta: item.atualizadoEm,
      pendencias: [...ajustesDoGate, ...item.preavaliacao.pendencias],
      dependencias: item.dependencias,
      despachoPassaria: item.preavaliacao.tecnicamentePronta &&
        (gatesAtuais.length === 0 || (gatesAtuais.length === 1 && gatesAtuais[0] === gate && item.provenienciaGate === 'verificada')),
      observacao: 'pré-checagem só-leitura; a marcação por IA exige identidade de escrita própria e evidência auditável; a etiqueta não autoriza despacho',
    };
  }
}
