// Validar, preparar e confirmar o perfil. Não desenha os seletores.

class ConfirmacaoModelo {
  constructor(painel, lerSelecoes) {
    this.painel = painel;
    this.lerSelecoes = lerSelecoes;
  }

  get n() { return this.painel.n; }

  limpar() {
    this.n.estado.confirmacao = null;
    this.n.$('orq-confirmacao-modelos').replaceChildren();
    this.n.$('orq-confirmacao-modelos').hidden = true;
  }

  async validar() {
    if (!this.n.estado.carta) return;
    const selecoes = this.lerSelecoes();
    this.n.$('orq-modelos-status').textContent = 'Validando proposta…';
    try {
      const dados = await this.n.json('/api/orquestracao/modelos/validar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta: this.n.estado.carta.id, selecoes }) });
      this.n.$('orq-modelos-status').textContent = `${dados.carta}: combinação permitida pelo contrato, mas ainda não gravada no card. ${dados.impedimentosExecucao.length ? `Despacho impedido: ${dados.impedimentosExecucao.join('; ')}.` : 'O perfil exato seria exigido, sem fallback.'}`;
    } catch (erro) { this.n.$('orq-modelos-status').textContent = erro.message; }
  }

  async preparar() {
    if (!this.n.estado.carta || !this.n.estado.modeloDados?.podeRegistrar) return;
    this.limpar();
    const carta = this.n.estado.carta.id;
    this.n.$('orq-modelos-status').textContent = 'Verificando sessão e preparando confirmação…';
    try {
      const dados = await this.n.json('/api/orquestracao/modelos/preparar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carta, versaoCarta: this.n.estado.modeloDados.versaoCarta, selecoes: this.lerSelecoes() }) });
      if (this.n.estado.carta?.id !== carta) return;
      this.n.estado.confirmacao = dados.confirmacaoId;
      const alvo = this.n.$('orq-confirmacao-modelos');
      const lista = this.n.criar('ul');
      for (const [papel, escolha] of Object.entries(dados.selecoes)) {
        lista.append(this.n.criar('li', `${papel}: ${escolha.provedor}/${escolha.modelo}/${escolha.esforco}`));
      }
      const botao = this.n.criar('button', 'Confirmar registro no card', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.confirmar());
      alvo.replaceChildren(this.n.criar('strong', `${dados.carta} · versão ${dados.versaoCarta}`), lista,
        this.n.criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.hidden = false;
      this.n.$('orq-modelos-status').textContent = 'Confira as três escolhas e confirme somente se estiverem corretas.';
    } catch (erro) {
      this.n.$('orq-modelos-status').textContent = erro.status === 401
        ? `${erro.message} Abra https://astargne.com/login e volte a esta carta.` : erro.message;
    }
  }

  async confirmar() {
    const id = this.n.estado.confirmacao;
    if (!id) return;
    this.n.estado.confirmacao = null;
    this.n.$('orq-confirmacao-modelos').querySelector('button').disabled = true;
    this.n.$('orq-modelos-status').textContent = 'Confirmando no card do Plane…';
    try {
      const dados = await this.n.json('/api/orquestracao/modelos/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmacaoId: id }) });
      this.limpar();
      this.n.$('orq-modelos-status').textContent = `${dados.carta}: perfil registrado no comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      if (this.n.estado.topico === 'conversa') this.painel.conversa.carregar();
    } catch (erro) {
      this.limpar();
      this.n.$('orq-modelos-status').textContent = erro.message;
    }
  }
}

globalThis.ConfirmacaoModelo = ConfirmacaoModelo;
