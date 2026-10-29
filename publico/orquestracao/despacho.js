// Preparar e confirmar o despacho. A segunda ação é explícita.

class DespachoOrquestracao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  async preparar(carta, comando, alvo) {
    this.n.estado.confirmacaoDespacho = null;
    alvo.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(no => no.remove());
    const status = this.n.criar('p', 'Revalidando carta, contrato, frota e executor…', 'orq-preparo');
    alvo.append(status);
    try {
      const dados = await this.n.json('/api/orquestracao/despacho/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carta: carta.id,
          comando, versaoCarta: carta.atualizadoEm }) });
      if (this.n.estado.carta?.id !== carta.id) return;
      this.n.estado.confirmacaoDespacho = dados.confirmacaoId;
      const caixa = this.n.criar('div', '', 'orq-confirmacao');
      const plano = this.n.criar('ul');
      for (const [papel, escolha] of Object.entries(dados.plano.papeis)) {
        plano.append(this.n.criar('li', `${papel}: ${escolha.provedor}/${escolha.modelo}/${escolha.esforco} · ${escolha.agenteId}`));
      }
      const botao = this.n.criar('button', 'Confirmar tentativa real', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.confirmar(carta.id, dados.confirmacaoId, status, botao));
      caixa.append(this.n.criar('strong', `${dados.carta} · comando ${dados.comando}`), plano,
        this.n.criar('p', `Frota v${dados.frota.versao}.${dados.perfilAntigo?.estado === 'ignorado' ? ` Perfil antigo ignorado (era ${dados.perfilAntigo.resumo}; roda a frota v${dados.frota.versao}).` : dados.perfilAntigo?.estado === 'indisponivel' ? ' Perfil antigo indisponível; a frota manda.' : ''} ${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.append(caixa);
      status.textContent = 'Confira os três papéis, comando e carta antes de confirmar.';
    } catch (erro) { status.textContent = erro.message; }
  }

  async confirmar(carta, confirmacaoId, status, botao) {
    if (this.n.estado.confirmacaoDespacho !== confirmacaoId || this.n.estado.carta?.id !== carta) {
      status.textContent = 'Confirmação substituída ou expirada; prepare de novo.';
      return;
    }
    this.n.estado.confirmacaoDespacho = null;
    botao.disabled = true;
    status.textContent = 'Tentativa em curso; não repita a confirmação…';
    try {
      const dados = await this.n.json('/api/orquestracao/despacho/confirmar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId }) });
      const texto = `${this.n.estado.carta?.identificador ?? dados.carta ?? ''}: tentativa ${dados.tentativaId} · ${dados.resultado ?? dados.observacao ?? 'resultado pendente'}${dados.duplicada ? ' (repetida, não reexecutada)' : ''}.`;
      this.n.estado.ultimoResultado = { cartaId: carta, texto };
      status.textContent = texto;
      await this.painel.fila.carregar();
    } catch (erro) { status.textContent = erro.message; }
  }
}

globalThis.DespachoOrquestracao = DespachoOrquestracao;
