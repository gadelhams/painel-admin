// Sub-aba Frota: mostra a configuração geral (estado, versão, os quatro papéis) e o editor dos dois blocos. Nada por carta; a gravação mora em frota-confirmacao.js.

class FrotaOrquestracao {
  static NOMES = { orquestracao: 'orquestração', codificacao_testes: 'codificação e testes', validacao: 'validação', zelador: 'zelador' };

  constructor(painel) {
    this.painel = painel;
    this.seletores = new SeletoresModelo(painel.n);
    this.confirmacao = new ConfirmacaoFrota(painel, () => this.ler(), () => this.carregar());
  }

  get n() { return this.painel.n; }

  static tupla(t) { return t ? `${t.provedor}/${t.modelo}/${t.esforco === 'xhigh' ? 'extreme high' : t.esforco}` : '—'; }

  // A marca é a versão que esta tela mostrou; o preparar recusa se a frota mudou desde então.
  ler() {
    return { executor: this.seletores.ler(this.n.$('orq-frota-executor')), zelador: this.seletores.ler(this.n.$('orq-frota-zelador')),
      marca: this.n.estado.frota?.marca ?? '' };
  }

  // A pausa de versão vale para a frota exata (versão e hash), como no servidor.
  static pausas(dados) {
    const lista = Object.entries(dados.pausas?.provedores ?? {}).filter(([, p]) => Date.parse(p.ate) > Date.now())
      .map(([provedor, p]) => `${provedor} pausado até ${new Date(p.ate).toLocaleTimeString('pt-BR')} (${p.motivo})`);
    const v = dados.pausas?.versao;
    if (v && v.versao === dados.versao && v.hash === dados.hash) lista.push(`v${dados.versao} pausada: ${v.motivo}`);
    if (dados.pausas && !dados.pausas.legivel) lista.push('pausas da frota ilegíveis: a vigília fica parada até a próxima frota confirmada');
    return lista;
  }

  desenharAtual(dados) {
    const alvo = this.n.$('orq-frota-atual');
    alvo.replaceChildren();
    const titulo = dados.estado === 'ok'
      ? `Frota v${dados.versao} · em vigor desde ${new Date(dados.atualizadoEm).toLocaleString('pt-BR')}`
      : `Frota ${dados.estado}: nenhum despacho nem vigília roda${dados.motivo ? ` (${dados.motivo})` : ''}`;
    alvo.append(this.n.criar('h3', titulo));
    if (dados.estado === 'ok') {
      const lista = this.n.criar('ul');
      for (const [bloco, papeis] of Object.entries(dados.papeis)) {
        for (const papel of papeis) lista.append(this.n.criar('li', `${FrotaOrquestracao.NOMES[papel] ?? papel}: ${FrotaOrquestracao.tupla(dados.conteudo[bloco]?.[papel])}`));
      }
      alvo.append(lista);
    }
    const pausas = FrotaOrquestracao.pausas(dados);
    if (dados.zelador?.estado === 'invalida') alvo.append(this.n.criar('p', `Zelador inválido (${dados.zelador.motivo}); o executor segue com esta frota.`, 'orq-ajuda'));
    const h = dados.historico;
    if (h && !h.legivel) alvo.append(this.n.criar('p', `Histórico da frota ilegível (${h.motivo}); a numeração usa o piso.`, 'orq-ajuda'));
    else if (h?.truncadasNoMeio || h?.truncadaNoFim) alvo.append(this.n.criar('p', `Histórico da frota com escrita interrompida: ${h.truncadasNoMeio ?? 0} no meio${h.truncadaNoFim ? ', 1 no fim' : ''}; o restante foi preservado.`, 'orq-ajuda'));
    if (pausas.length) alvo.append(this.n.criar('p', `Pausas: ${pausas.join(' · ')}`, 'orq-ajuda'));
    alvo.append(this.n.criar('p', dados.observacao, 'orq-ajuda'));
  }

  desenharEditor(dados) {
    const opcoes = dados.catalogo;
    const aoAlterar = () => {
      this.confirmacao.limpar();
      this.n.$('orq-frota-status').textContent = 'Seleção alterada. Prepare de novo; nada foi gravado.';
    };
    for (const [bloco, id] of [['executor', 'orq-frota-executor'], ['zelador', 'orq-frota-zelador']]) {
      const alvo = this.n.$(id);
      alvo.replaceChildren();
      this.seletores.desenhar({ papeis: dados.papeis[bloco], opcoes, perfil: { selecoes: dados.conteudo?.[bloco] ?? {} } }, alvo, aoAlterar);
    }
  }

  async carregar() {
    this.confirmacao.limpar();
    this.n.$('orq-frota-preparar').disabled = true;
    this.n.mensagem('orq-frota-atual', 'Lendo a frota…');
    try {
      const dados = await this.n.json('/api/orquestracao/frota', { signal: this.n.sinal('frota') });
      this.n.estado.frota = dados;
      this.desenharAtual(dados);
      this.desenharEditor(dados);
      this.n.$('orq-frota-preparar').disabled = false;
      this.n.$('orq-frota-status').textContent = 'Preparar mostra a frota nova; confirmar é uma segunda ação, com sessão do Cadastro Único.';
    } catch (erro) { if (!this.n.abortado(erro)) this.n.mensagem('orq-frota-atual', `Frota indisponível: ${erro.message}`); }
  }
}

globalThis.FrotaOrquestracao = FrotaOrquestracao;
