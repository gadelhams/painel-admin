// Classifica as folhas sem gate. Não altera etiqueta e não desenha a carta.

class TriagemFila {
  constructor(painel, aoDesenhar) {
    this.painel = painel;
    this.aoDesenhar = aoDesenhar;
  }

  get n() { return this.painel.n; }

  async carregar() {
    const botao = this.n.$('orq-triagem-carregar');
    botao.disabled = true;
    this.n.$('orq-triagem-status').textContent = 'Lendo relações formais das folhas sem gate; isso pode levar alguns segundos…';
    try {
      const dados = await this.n.json('/api/orquestracao/triagem-dev');
      this.n.estado.triagem = { ...dados, porId: new Map(dados.itens.map(item => [item.id, item])) };
      const select = this.n.$('orq-categoria');
      select.replaceChildren(new Option('Todas as categorias', ''));
      for (const categoria of dados.categorias.filter(x => x.total)) {
        select.add(new Option(`${categoria.nome} · ${categoria.total}`, categoria.codigo));
      }
      select.disabled = false;
      this.n.$('orq-filtro').value = 'sem-gate';
      const resumo = this.n.$('orq-triagem-resumo');
      resumo.replaceChildren(this.n.criar('p', `${dados.total} ${dados.total === 1 ? 'carta aberta' : 'cartas abertas'} sem gate · ${dados.folhas} ${dados.folhas === 1 ? 'folha' : 'folhas'} · ${dados.total - dados.folhas} cartas-pai.`),
        this.n.criar('p', 'Categorias se sobrepõem; ASTARGNE não significa necessariamente decisão de produto.'));
      this.n.$('orq-triagem-status').textContent = `Triagem atualizada às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}. Nenhuma etiqueta alterada.`;
      this.aoDesenhar();
    } catch (erro) {
      this.n.estado.triagem = null;
      this.n.$('orq-categoria').replaceChildren(new Option('Todas as categorias', ''));
      this.n.$('orq-categoria').disabled = true;
      this.n.$('orq-triagem-resumo').replaceChildren();
      this.n.$('orq-triagem-status').textContent = `Triagem indisponível: ${erro.message}`;
    } finally { botao.disabled = false; }
  }
}

globalThis.TriagemFila = TriagemFila;
