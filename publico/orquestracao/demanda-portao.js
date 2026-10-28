// Portão de execução da carta selecionada. Preparar continua em despacho.js.

class DemandaPortao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  desenhar(alvo, c) {
    const despacho = this.n.criar('div', '', 'orq-despacho');
    despacho.append(this.n.criar('h3', 'Portão de execução'));
    if (!this.n.estado.fila?.execucaoHabilitada) {
      despacho.append(this.n.criar('p', 'Desligado: falta o executor aprovado, identidade restrita e piloto offline. Nenhum comando será iniciado.'));
    } else if (!c.elegivel) {
      despacho.append(this.n.criar('p', 'Carta impedida; resolva os portões acima antes de preparar.'));
    } else {
      const comando = this.n.criar('select');
      comando.setAttribute('aria-label', 'Comando do contrato');
      for (const id of c.comandos) comando.add(new Option(id, id));
      const botao = this.n.criar('button', 'Preparar despacho', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.painel.despacho.preparar(c, comando.value, despacho));
      despacho.append(comando, botao, this.n.criar('p', 'Confirmar exibirá o plano exato e exigirá uma segunda ação explícita.'));
    }
    alvo.append(despacho);
  }
}

globalThis.DemandaPortao = DemandaPortao;
