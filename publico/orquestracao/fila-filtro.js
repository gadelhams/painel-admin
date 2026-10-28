// Quais cartas passam no filtro da tela. Não desenha a lista.

class FiltroFila {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  visiveis() {
    const projeto = this.n.$('orq-projeto').value;
    const filtro = this.n.$('orq-filtro').value;
    const categoria = this.n.$('orq-categoria').value;
    const busca = this.n.$('orq-busca').value.trim().toLocaleLowerCase('pt-BR');
    const estado = this.n.estado;
    return estado.fila.itens.filter(c => {
      if (projeto && c.projetoId !== projeto) return false;
      const temGate = c.labels.includes('READY TO DEV') || c.labels.includes('READY TO TEST');
      if (filtro === 'candidatas' && !temGate) return false;
      if (filtro === 'sem-gate' && temGate) return false;
      if (categoria && !estado.triagem?.porId.get(c.id)?.categorias.includes(categoria)) return false;
      return !busca || [c.identificador, c.titulo, c.projeto, ...c.motivos].join(' ').toLocaleLowerCase('pt-BR').includes(busca);
    });
  }
}

globalThis.FiltroFila = FiltroFila;
