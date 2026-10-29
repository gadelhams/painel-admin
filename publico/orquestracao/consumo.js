// Medidores de consumo. Sem fonte verificável, mostra o motivo e nenhum percentual inventado.

class ConsumoOrquestracao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  static zera(j) {
    return j.reiniciaEm ? ` · zera em ${new Date(j.reiniciaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '';
  }

  async carregar() {
    this.n.mensagem('orq-consumo', 'Lendo fontes de consumo…');
    try {
      const dados = await this.n.json('/api/orquestracao/consumo');
      const alvo = this.n.$('orq-consumo');
      alvo.replaceChildren();
      for (const provedor of ['claude', 'openai']) {
        const item = dados[provedor];
        const caixa = this.n.criar('div', '', 'orq-medidor');
        caixa.append(this.n.criar('strong', provedor));
        if (item.disponivel) {
          for (const janela of item.janelas) {
            const barra = this.n.criar('progress');
            barra.max = 100;
            barra.value = janela.percentual;
            caixa.append(this.n.criar('span', `${janela.percentual}% da assinatura · ${janela.janela}${ConsumoOrquestracao.zera(janela)} · ${janela.fonte}`), barra);
          }
        } else {
          caixa.append(this.n.criar('span', `— · ${item.motivo}`));
          for (const u of item.ultimasLeituras ?? []) {
            caixa.append(this.n.criar('span', `última leitura: ${u.percentual}% · ${u.janela} · ${new Date(u.atualizadoEm).toLocaleString('pt-BR')}${ConsumoOrquestracao.zera(u)}`, 'discreto'));
          }
        }
        alvo.append(caixa);
      }
    } catch (erro) { this.n.mensagem('orq-consumo', erro.message); }
  }
}

globalThis.ConsumoOrquestracao = ConsumoOrquestracao;
