// Preparar e confirmar a troca da frota. A segunda ação é explícita; não desenha os seletores.

class ConfirmacaoFrota {
  constructor(painel, lerFrota, recarregar) {
    this.painel = painel;
    this.lerFrota = lerFrota;
    this.recarregar = recarregar;
  }

  get n() { return this.painel.n; }

  limpar() {
    this.n.estado.confirmacaoFrota = null;
    this.n.$('orq-frota-confirmacao').replaceChildren();
    this.n.$('orq-frota-confirmacao').hidden = true;
  }

  async preparar() {
    this.limpar();
    this.n.$('orq-frota-status').textContent = 'Verificando sessão e preparando a confirmação…';
    try {
      const dados = await this.n.json('/api/orquestracao/frota/preparar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.lerFrota()) });
      this.n.estado.confirmacaoFrota = dados.confirmacaoId;
      const alvo = this.n.$('orq-frota-confirmacao');
      const lista = this.n.criar('ul');
      for (const bloco of ['executor', 'zelador']) {
        for (const [papel, t] of Object.entries(dados.conteudo[bloco])) lista.append(this.n.criar('li', `${FrotaOrquestracao.NOMES[papel] ?? papel}: ${FrotaOrquestracao.tupla(t)}`));
      }
      const base = dados.atual.estado === 'ok' ? `substitui a v${dados.atual.versao}` : `substitui uma frota ${dados.atual.estado}`;
      const botao = this.n.criar('button', 'Confirmar a frota nova', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => this.confirmar());
      alvo.replaceChildren(this.n.criar('strong', `Frota nova · ${base}`), lista,
        this.n.criar('p', `${dados.aviso} Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.`), botao);
      alvo.hidden = false;
      this.n.$('orq-frota-status').textContent = 'Confira os quatro papéis e confirme só se estiverem certos.';
    } catch (erro) {
      this.n.$('orq-frota-status').textContent = erro.status === 401
        ? `${erro.message} Abra https://astargne.com/login e volte a esta tela.` : erro.message;
    }
  }

  async confirmar() {
    const id = this.n.estado.confirmacaoFrota;
    if (!id) return;
    this.n.estado.confirmacaoFrota = null;
    this.n.$('orq-frota-confirmacao').querySelector('button').disabled = true;
    this.n.$('orq-frota-status').textContent = 'Gravando a frota…';
    try {
      const dados = await this.n.json('/api/orquestracao/frota/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmacaoId: id }) });
      await this.recarregar();
      this.n.$('orq-frota-status').textContent = `Frota v${dados.versao} gravada. Nenhuma execução iniciada; tentativas em curso seguem com a frota que congelaram.`;
    } catch (erro) {
      this.limpar();
      this.n.$('orq-frota-status').textContent = erro.message;
    }
  }
}

globalThis.ConfirmacaoFrota = ConfirmacaoFrota;
