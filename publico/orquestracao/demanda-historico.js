// Diário da frota: o que cada droid fez, em que carta e com que resultado. Com uma carta
// escolhida, mostra o lease dela e filtra o diário; sem carta, mostra o diário inteiro.

class DemandaHistorico {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  static linha(e) {
    const quando = e.quando ? new Date(e.quando).toLocaleString('pt-BR') : '?';
    const detalhe = [e.resultado, e.de && e.para ? `${e.de} → ${e.para}` : null, e.motivo].filter(Boolean).join(' · ');
    return `${quando} · ${e.origem} · ${e.carta ?? (e.cartaId ? e.cartaId.slice(0, 8) : '—')} · ${e.tipo}${detalhe ? ` · ${detalhe}` : ''}`;
  }

  async desenhar() {
    const alvo = this.n.$('orq-historico');
    const carta = this.n.estado.carta;
    alvo.replaceChildren();
    if (carta) {
      const disponiveis = (carta.agentesDisponiveis ?? []).map(a => a.id).join(', ') || 'nenhum';
      alvo.append(this.n.criar('p', `${carta.identificador} · Lease: ${carta.leaseSituacao ?? 'desconhecido'} · Agentes disponíveis: ${disponiveis} · Responsável pela tentativa: ${carta.lease?.agente ?? 'não atribuído'}`, 'orq-ajuda'));
    }
    // A carta escolhida redesenha a sub-aba; o diário só é lido com ela aberta.
    if (this.n.estado.topico !== 'historico') return;
    const lista = this.n.criar('div');
    alvo.append(lista);
    lista.append(this.n.criar('p', 'Lendo o diário…'));
    try {
      const dados = await this.n.json(`/api/orquestracao/diario${carta ? `?carta=${encodeURIComponent(carta.id)}` : ''}`, { signal: this.n.sinal('diario') });
      lista.replaceChildren();
      for (const aviso of dados.avisos ?? []) lista.append(this.n.criar('p', `⚠ ${aviso}`, 'orq-ajuda'));
      for (const e of dados.eventos) lista.append(this.n.criar('p', DemandaHistorico.linha(e)));
      if (!dados.eventos.length) lista.append(this.n.criar('p', carta ? 'Nenhum evento da frota nesta carta.' : 'Nenhum evento da frota ainda: nenhum despacho nem vigília rodou nesta máquina.'));
    } catch (erro) { if (!this.n.abortado(erro)) lista.replaceChildren(this.n.criar('p', `Diário indisponível: ${erro.message}`)); }
  }
}

globalThis.DemandaHistorico = DemandaHistorico;
