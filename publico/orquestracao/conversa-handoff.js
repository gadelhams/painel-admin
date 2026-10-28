// Prepara e confirma o handoff. Não lista os comentários.

class HandoffConversa {
  constructor(painel, aoRegistrar) {
    this.painel = painel;
    this.aoRegistrar = aoRegistrar;
  }

  get n() { return this.painel.n; }

  limpar() {
    this.n.estado.confirmacaoHandoff = null;
    this.n.$('orq-handoff-confirmacao').replaceChildren();
    this.n.$('orq-handoff-confirmacao').hidden = true;
  }

  entrada() {
    return { papel: this.n.$('orq-handoff-papel').value,
      tentativaId: this.n.$('orq-handoff-tentativa').value.trim() || null,
      resultado: this.n.$('orq-handoff-resultado').value,
      resumo: this.n.$('orq-handoff-resumo').value.trim(),
      evidencia: this.n.$('orq-handoff-evidencias').value.split('\n').map(x => x.trim()).filter(Boolean) };
  }

  async preparar() {
    if (!this.n.estado.carta) return;
    this.limpar();
    const carta = this.n.estado.carta.id;
    this.n.$('orq-handoff-status').textContent = 'Verificando sessão, carta e evidências…';
    const entrada = this.entrada();
    const limite = this.n.limitesDeTexto(entrada.resumo, entrada.evidencia, 'resumo');
    if (limite) { this.n.$('orq-handoff-status').textContent = limite; return; }
    try {
      const dados = await this.n.json('/api/orquestracao/handoff/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carta, versaoCarta: this.n.estado.carta.atualizadoEm, entrada }) });
      if (this.n.estado.carta?.id !== carta) return;
      this.n.estado.confirmacaoHandoff = dados.confirmacaoId;
      const alvo = this.n.$('orq-handoff-confirmacao');
      const evidencias = this.n.criar('ul');
      for (const linha of dados.entrada.evidencia) evidencias.append(this.n.criar('li', linha));
      const botao = this.n.criar('button', 'Confirmar handoff no card', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.confirmar());
      alvo.replaceChildren(this.n.criar('strong', `${dados.carta} · ${dados.entrada.papel} · ${dados.entrada.resultado}`),
        this.n.criar('p', dados.entrada.resumo), evidencias,
        this.n.criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.hidden = false;
      this.n.$('orq-handoff-status').textContent = 'Confira o conteúdo e confirme em uma segunda ação.';
    } catch (erro) { this.n.$('orq-handoff-status').textContent = erro.message; }
  }

  async confirmar() {
    const id = this.n.estado.confirmacaoHandoff;
    if (!id) return;
    this.n.estado.confirmacaoHandoff = null;
    this.n.$('orq-handoff-confirmacao').querySelector('button').disabled = true;
    this.n.$('orq-handoff-status').textContent = 'Registrando no card…';
    try {
      const dados = await this.n.json('/api/orquestracao/handoff/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId: id }) });
      this.limpar();
      this.n.$('orq-handoff-status').textContent = `${dados.carta}: handoff no comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      await this.aoRegistrar();
    } catch (erro) { this.limpar(); this.n.$('orq-handoff-status').textContent = erro.message; }
  }
}

globalThis.HandoffConversa = HandoffConversa;
