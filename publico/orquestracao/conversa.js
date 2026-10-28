// Liga a leitura do card ao handoff em duas ações. Não grava sozinho.

class ConversaOrquestracao {
  constructor(painel) {
    this.painel = painel;
    this.canal = new CanalConversa(painel);
    this.handoff = new HandoffConversa(painel, () => this.carregar());
  }

  carregar() { return this.canal.carregar(); }

  limparHandoff() { this.handoff.limpar(); }

  prepararHandoff() { return this.handoff.preparar(); }
}

globalThis.ConversaOrquestracao = ConversaOrquestracao;
