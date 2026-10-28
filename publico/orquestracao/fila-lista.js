// Desenha o seletor de projetos e os botões das cartas. Não busca a fila.

class ListaFila {
  constructor(painel, filtro, aoSelecionar) {
    this.painel = painel;
    this.filtro = filtro;
    this.aoSelecionar = aoSelecionar;
  }

  get n() { return this.painel.n; }

  renderProjetos() {
    const select = this.n.$('orq-projeto');
    const anterior = select.value;
    select.replaceChildren(new Option('Todos', ''));
    for (const p of this.n.estado.fila.projetos) {
      const opcao = new Option(`${p.nome} · ${p.candidatas}/${p.cartas}${p.acessivel ? '' : ' · sem acesso'}`, p.id);
      select.add(opcao);
    }
    select.value = anterior;
  }

  renderCartas() {
    const lista = this.n.$('orq-cartas');
    lista.replaceChildren();
    const visiveis = this.filtro.visiveis();
    if (!visiveis.length) return this.n.mensagem('orq-cartas', 'Nenhuma carta nesse filtro.');
    const estado = this.n.estado;
    for (const c of visiveis.slice(0, 100)) {
      const principal = estado.triagem?.porId.get(c.id)?.principal;
      const nomePrincipal = estado.triagem?.categorias.find(x => x.codigo === principal)?.nome;
      const botao = this.n.criar('button', '', 'orq-carta');
      botao.type = 'button';
      botao.append(this.n.criar('strong', c.identificador), this.n.criar('span', c.titulo),
        this.n.criar('small', nomePrincipal ?? (c.elegivel ? 'Elegível' : c.motivos[0] ?? 'Impedida')));
      botao.setAttribute('aria-pressed', String(estado.carta?.id === c.id));
      botao.addEventListener('click', () => this.aoSelecionar(c));
      lista.append(botao);
    }
    if (visiveis.length > 100) lista.append(this.n.criar('p', `Mostrando 100 de ${visiveis.length}; refine a busca.`, 'orq-ajuda'));
  }
}

globalThis.ListaFila = ListaFila;
