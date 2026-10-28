// Estado da vigília por projeto. O desenho mora em vigilia-desenho.js; a segunda ação, em vigilia-confirmacao.js.

class VigiliaOrquestracao {
  constructor(painel) {
    this.painel = painel;
    this.desenho = new DesenhoVigilia(painel.n);
    this.confirmacao = new ConfirmacaoVigilia(painel.n, () => this.carregar());
  }

  get n() { return this.painel.n; }

  async carregar() {
    const status = this.n.$('orq-vigilia-status');
    const alvo = this.n.$('orq-vigilia');
    status.textContent = 'Lendo o estado da vigília…';
    try {
      const dados = await this.n.json('/api/orquestracao/vigilia', { signal: this.n.sinal('vigilia') });
      alvo.replaceChildren();
      for (const p of dados.projetos) {
        alvo.append(this.desenho.projeto(p, (projeto, ligar, caixa) => this.confirmacao.preparar(projeto, ligar, caixa)));
      }
      if (!dados.projetos.length) alvo.append(this.n.criar('p', 'Nenhum projeto com contrato local.', 'orq-ajuda'));
      status.textContent = `Varredura a cada ${dados.intervaloSegundos} s · lido às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}. ${dados.observacao}`;
    } catch (erro) { if (!this.n.abortado(erro)) status.textContent = `Vigília indisponível: ${erro.message}`; }
  }
}

globalThis.VigiliaOrquestracao = VigiliaOrquestracao;
