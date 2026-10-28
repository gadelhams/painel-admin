// Lease, agentes e tentativas da carta selecionada.

class DemandaHistorico {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  desenhar() {
    const alvo = this.n.$('orq-historico');
    const disponiveis = (this.n.estado.carta.agentesDisponiveis ?? []).map(a => a.id).join(', ') || 'nenhum';
    alvo.replaceChildren(this.n.criar('p', `Lease: ${this.n.estado.carta.leaseSituacao ?? 'desconhecido'} · Agentes disponíveis: ${disponiveis} · Responsável pela tentativa: ${this.n.estado.carta.lease?.agente ?? 'não atribuído'}`));
    for (const e of this.n.estado.carta.historico ?? []) alvo.append(this.n.criar('p', `${e.quando ?? '?'} · ${e.tipo} · ${e.resultado ?? e.tentativaId ?? ''}`));
    if (!this.n.estado.carta.historico?.length) alvo.append(this.n.criar('p', 'Nenhuma tentativa registrada.'));
  }
}

globalThis.DemandaHistorico = DemandaHistorico;
