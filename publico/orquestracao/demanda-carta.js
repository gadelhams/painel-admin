// Elegibilidade e dependências da carta selecionada. Não lista a fila.

class DemandaCarta {
  constructor(painel) {
    this.painel = painel;
    this.prontidao = new DemandaProntidao(painel);
    this.portao = new DemandaPortao(painel);
    this.historicoDesenho = new DemandaHistorico(painel);
  }

  get n() { return this.painel.n; }

  render() {
    const c = this.n.estado.carta;
    const alvo = this.n.$('orq-elegibilidade');
    alvo.replaceChildren();
    const estadoAtual = this.n.criar('p', `${c.estado} · ${c.gate ?? 'sem gate'} · ${c.elegivel ? 'elegível' : 'impedida'}`);
    const motivos = this.n.criar('ul');
    for (const motivo of c.motivos) motivos.append(this.n.criar('li', motivo));
    if (!c.motivos.length) motivos.append(this.n.criar('li', 'Todos os portões de leitura passaram. Execução ainda indisponível.'));
    alvo.append(estadoAtual);
    if (this.n.estado.ultimoResultado?.cartaId === c.id) alvo.append(this.n.criar('p', this.n.estado.ultimoResultado.texto, 'orq-resultado'));
    alvo.append(motivos);
    const triagem = this.n.estado.triagem?.porId.get(c.id);
    if (triagem) {
      const categorias = this.n.criar('div', '', 'orq-categoria-dev');
      categorias.append(this.n.criar('h3', 'Pendências para READY TO DEV'));
      const lista = this.n.criar('ul');
      for (const codigo of triagem.categorias) {
        lista.append(this.n.criar('li', this.n.estado.triagem.categorias.find(x => x.codigo === codigo)?.nome ?? codigo));
      }
      categorias.append(lista, this.n.criar('p', 'Triagem estrutural só-leitura; escopo e aceite precisam de evidência no card.', 'orq-ajuda'));
      alvo.append(categorias);
    }
    const discutir = this.n.criar('button', 'Discutir pendências com C-3PO', 'orq-acao');
    discutir.type = 'button';
    discutir.addEventListener('click', () => window.abrirConsoleOrquestracao?.(c.identificador));
    alvo.append(discutir);
    const deps = this.n.criar('div', '', 'orq-dependencias');
    deps.append(this.n.criar('h3', 'Dependências'));
    const vistas = new Set();
    const dependencias = [...c.dependencias, ...(triagem?.dependencias ?? [])]
      .filter(d => { const k = `${d.id}|${d.estado}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
    for (const d of dependencias) deps.append(this.n.criar('p', `${d.id}: ${d.estado} — ${d.motivo}`));
    if (!dependencias.length) deps.append(this.n.criar('p', 'Nenhuma relação exibida.'));
    alvo.append(deps);
    this.prontidao.desenhar(alvo, c);
    this.portao.desenhar(alvo, c);
  }

  historico() { this.historicoDesenho.desenhar(); }
}

globalThis.DemandaCarta = DemandaCarta;
