// Carrega a fila e abre a carta. O filtro, a lista e a triagem moram ao lado.

class FilaOrquestracao {
  constructor(painel) {
    this.painel = painel;
    this.demanda = new DemandaCarta(painel);
    this.filtro = new FiltroFila(painel);
    this.lista = new ListaFila(painel, this.filtro, (carta) => this.selecionar(carta));
    this.triagem = new TriagemFila(painel, () => {
      if (this.n.estado.fila) this.renderCartas();
      if (this.n.estado.carta) this.renderDemanda();
    });
  }

  get n() { return this.painel.n; }

  renderProjetos() { this.lista.renderProjetos(); }

  renderCartas() { this.lista.renderCartas(); }

  renderDemanda() { this.demanda.render(); }

  renderHistorico() { this.demanda.historico(); }

  carregarTriagem() { return this.triagem.carregar(); }

  selecionar(carta) {
    if (this.n.estado.carta?.id !== carta.id) this.painel.voz.descartar();
    this.n.estado.carta = carta;
    this.painel.modelos.limpar();
    this.painel.conversa.limparHandoff();
    this.n.estado.confirmacaoGate = null;
    this.n.estado.confirmacaoDespacho = null;
    const cab = this.n.$('orq-card-cabecalho');
    cab.replaceChildren();
    const link = this.n.criar('a', carta.identificador);
    link.href = carta.url;
    link.target = '_blank';
    link.rel = 'noopener';
    cab.append(link, this.n.criar('h2', carta.titulo), this.n.criar('p', carta.projeto));
    this.renderCartas();
    this.renderDemanda();
    this.renderHistorico();
    this.n.mensagem('orq-conversa', 'Abra o tópico para ler as interações deste card.');
    this.n.mensagem('orq-modelos', 'Abra o tópico para escolher os modelos.');
    this.n.$('orq-voz-texto').textContent = '';
    this.n.$('orq-voz-usar').hidden = true;
    this.n.estado.transcricao = null;
    this.n.$('orq-validar-modelos').disabled = true;
    this.n.$('orq-preparar-modelos').disabled = true;
    if (this.n.estado.topico === 'conversa') this.painel.conversa.carregar();
    if (this.n.estado.topico === 'modelos') this.painel.modelos.carregar();
  }

  async carregar() {
    this.n.$('orq-status').textContent = 'Lendo fila do Plane…';
    try {
      this.n.estado.fila = await this.n.json('/api/orquestracao');
      this.n.estado.triagem = null;
      this.n.$('orq-categoria').replaceChildren(new Option('Todas as categorias', ''));
      this.n.$('orq-categoria').disabled = true;
      this.n.$('orq-triagem-resumo').replaceChildren();
      this.n.$('orq-triagem-status').textContent = 'Triagem geral sob demanda; nenhuma etiqueta será alterada.';
      this.renderProjetos();
      this.renderCartas();
      const candidatas = this.n.estado.fila.itens.filter(c => c.labels.includes('READY TO DEV') || c.labels.includes('READY TO TEST')).length;
      this.n.$('orq-status').textContent = `${this.n.estado.fila.projetos.length} projetos · ${this.n.estado.fila.itens.length} cartas · ${candidatas} candidatas · ${this.n.estado.fila.itens.filter(c => c.elegivel).length} elegíveis · leitura/simulação`;
      if (this.n.estado.carta) {
        const atual = this.n.estado.fila.itens.find(c => c.id === this.n.estado.carta.id);
        if (atual) this.selecionar(atual);
      } else {
        const idDaUrl = new URL(location.href).searchParams.get('carta');
        const inicial = this.n.estado.fila.itens.find(c => c.id === idDaUrl || c.identificador === idDaUrl);
        if (inicial) this.selecionar(inicial);
      }
    } catch (erro) {
      this.n.estado.fila = null;
      this.n.estado.triagem = null;
      this.n.$('orq-cartas').replaceChildren();
      this.n.$('orq-status').textContent = `Fila indisponível: ${erro.message}`;
    }
  }
}

globalThis.FilaOrquestracao = FilaOrquestracao;
