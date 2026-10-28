// Preparar e confirmar a etiqueta de gate. Não inicia execução.

class GateOrquestracao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  async preparar(carta, versaoCarta, gate, justificativa, evidencias, alvo) {
    this.n.estado.confirmacaoGate = null;
    alvo.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(no => no.remove());
    const status = this.n.criar('p', 'Verificando sessão, versão e evidências…', 'orq-preparo');
    alvo.append(status);
    const limite = this.n.limitesDeTexto(justificativa, evidencias.split('\n').map(x => x.trim()).filter(Boolean), 'justificativa');
    if (limite) { status.textContent = limite; return; }
    try {
      const dados = await this.n.json('/api/orquestracao/gates/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta, versaoCarta,
          proposta: { gate, justificativa, evidencias: evidencias.split('\n').map(x => x.trim()).filter(Boolean) } }) });
      if (this.n.estado.carta?.id !== carta) return;
      this.n.estado.confirmacaoGate = dados.confirmacaoId;
      const caixa = this.n.criar('div', '', 'orq-confirmacao');
      const lista = this.n.criar('ul');
      for (const evidencia of dados.proposta.evidencias) lista.append(this.n.criar('li', evidencia));
      const botao = this.n.criar('button', 'Confirmar etiqueta no Plane', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.confirmar(carta, dados.confirmacaoId, status, botao));
      caixa.append(this.n.criar('strong', `${dados.carta} · ${dados.proposta.gate}`),
        this.n.criar('p', dados.proposta.justificativa), lista,
        this.n.criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.append(caixa);
      status.textContent = 'Confira e confirme em uma segunda ação.';
    } catch (erro) { status.textContent = erro.message; }
  }

  async confirmar(carta, confirmacaoId, status, botao) {
    if (this.n.estado.confirmacaoGate !== confirmacaoId || this.n.estado.carta?.id !== carta) {
      status.textContent = 'Confirmação substituída ou expirada; prepare de novo.';
      return;
    }
    this.n.estado.confirmacaoGate = null;
    botao.disabled = true;
    status.textContent = 'Aplicando gate com evidência no card…';
    try {
      const dados = await this.n.json('/api/orquestracao/gates/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId }) });
      const texto = `${dados.gate} registrado. Comentário ${dados.comentarioId}. Nenhuma execução iniciada.`;
      this.n.estado.ultimoResultado = { cartaId: carta, texto };
      status.textContent = texto;
      await this.painel.fila.carregar();
    } catch (erro) { status.textContent = erro.message; }
  }
}

globalThis.GateOrquestracao = GateOrquestracao;
