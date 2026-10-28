// Liga os seletores à confirmação em duas ações. Não grava sozinho.

class ModelosOrquestracao {
  constructor(painel) {
    this.painel = painel;
    this.seletores = new SeletoresModelo(painel.n);
    this.confirmacao = new ConfirmacaoModelo(painel, () => this.seletores.ler());
  }

  get n() { return this.painel.n; }

  limpar() { this.confirmacao.limpar(); }

  validar() { return this.confirmacao.validar(); }

  preparar() { return this.confirmacao.preparar(); }

  async carregar() {
    if (!this.n.estado.carta) return;
    const id = this.n.estado.carta.id;
    this.limpar();
    this.n.mensagem('orq-modelos', 'Lendo opções do contrato…');
    this.n.$('orq-validar-modelos').disabled = true;
    this.n.$('orq-preparar-modelos').disabled = true;
    try {
      const dados = await this.n.json(`/api/orquestracao/modelos?carta=${encodeURIComponent(id)}`, { signal: this.n.sinal('modelos') });
      if (this.n.estado.carta?.id !== id) return;
      const alvo = this.n.$('orq-modelos');
      alvo.replaceChildren();
      this.n.estado.opcoes = dados.opcoes;
      this.n.estado.modeloDados = dados;
      if (dados.impedimentos.length || !dados.opcoes.length) return this.n.mensagem('orq-modelos', dados.impedimentos.join('; ') || 'Sem modelos declarados no contrato.');
      this.seletores.desenhar(dados, alvo, () => {
        this.limpar();
        this.n.$('orq-modelos-status').textContent = 'Seleção alterada. Valide ou prepare novamente; nenhum perfil foi gravado.';
      });
      this.n.$('orq-validar-modelos').disabled = false;
      this.n.$('orq-preparar-modelos').disabled = !dados.podeRegistrar;
      const quando = dados.perfil?.quando ? new Date(dados.perfil.quando).toLocaleString('pt-BR') : '';
      this.n.$('orq-modelos-status').textContent = dados.perfil
        ? `Perfil vinculante registrado no comentário ${dados.perfil.comentarioId}${quando ? ` em ${quando}` : ''}; os seletores mostram essa escolha. Alterar e preparar grava um novo perfil.`
        : dados.podeRegistrar
          ? 'Padrões: Claude max e OpenAI extreme high. Nenhum perfil gravado neste card. Para gravar, prepare e confirme em duas ações separadas.'
          : 'Identidade restrita de escrita não configurada para este projeto; só validação e simulação disponíveis.';
    } catch (erro) { if (!this.n.abortado(erro) && this.n.estado.carta?.id === id) this.n.mensagem('orq-modelos', erro.message); }
  }
}

globalThis.ModelosOrquestracao = ModelosOrquestracao;
