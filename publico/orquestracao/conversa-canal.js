// Lê os comentários do card. Não prepara handoff.

class CanalConversa {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  async carregar() {
    if (!this.n.estado.carta) return;
    const id = this.n.estado.carta.id;
    this.n.mensagem('orq-conversa', 'Lendo comentários do Plane…');
    try {
      const canal = await this.n.json(`/api/orquestracao/canal?carta=${encodeURIComponent(id)}&projeto=${encodeURIComponent(this.n.estado.carta.projetoId)}`, { signal: this.n.sinal('conversa') });
      if (this.n.estado.carta?.id !== id) return;
      const alvo = this.n.$('orq-conversa');
      alvo.replaceChildren();
      const estruturados = new Map((canal.handoffs ?? []).map(h => [h.comentarioId, h]));
      for (const e of canal.interacoes) {
        const item = this.n.criar('article', '', 'orq-interacao');
        const handoff = estruturados.get(e.id);
        item.append(this.n.criar('strong', `${e.papel} · ${e.autor}`), this.n.criar('time', e.quando ? new Date(e.quando).toLocaleString('pt-BR') : ''));
        if (handoff) {
          item.append(this.n.criar('p', `${handoff.resultado} · tentativa ${handoff.tentativaId ?? 'não iniciada'} · ${handoff.resumo}`));
          const evidencias = this.n.criar('ul');
          for (const evidencia of handoff.evidencia) evidencias.append(this.n.criar('li', evidencia));
          item.append(evidencias);
        } else item.append(this.n.criar('p', e.texto));
        alvo.append(item);
      }
      if (!canal.interacoes.length) this.n.mensagem('orq-conversa', 'O card ainda não tem comentários.');
    } catch (erro) { if (this.n.abortado(erro)) return; if (this.n.estado.carta?.id === id) this.n.mensagem('orq-conversa', `Canal indisponível: ${erro.message}`); }
  }
}

globalThis.CanalConversa = CanalConversa;
