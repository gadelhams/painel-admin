// Pré-checagem de gate da carta selecionada. Não marca o gate.

class DemandaProntidao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  desenhar(alvo, c) {
    for (const gate of ['READY TO DEV', 'READY TO TEST']) {
      const botao = this.n.criar('button', `Pré-checar ${gate}`, 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', async () => {
        const saida = this.n.$('orq-prontidao');
        saida.textContent = 'Consultando…';
        try {
          const dados = await this.n.json(`/api/orquestracao/prontidao?carta=${encodeURIComponent(c.id)}&gate=${encodeURIComponent(gate)}`, { signal: this.n.sinal('prontidao') });
          if (this.n.estado.carta?.id !== c.id) return;
          this.n.estado.confirmacaoGate = null;
          saida.replaceChildren(this.n.criar('strong', gate), this.n.criar('h3', 'Pendências para marcar o gate'));
          const pendencias = this.n.criar('ul');
          for (const texto of dados.pendenciasDoGate) pendencias.append(this.n.criar('li', texto));
          if (!pendencias.childNodes.length) {
            pendencias.append(this.n.criar('li', dados.gatesAtuais?.length && !dados.gatePodeSerMarcado
              ? `Gate ${dados.gatesAtuais.join(' e ')} já presente; veja os ajustes abaixo.`
              : 'Nenhuma pendência estrutural detectada. Evidência ainda deve ser registrada.'));
          }
          saida.append(pendencias);
          if (dados.ajustesDoGate?.length) {
            const ajustes = this.n.criar('ul');
            for (const texto of dados.ajustesDoGate) ajustes.append(this.n.criar('li', texto));
            saida.append(this.n.criar('h3', 'Ajustes de gate e evidência'), ajustes);
          }
          saida.append(this.n.criar('h3', 'Impedimentos para despacho após o gate'));
          const despacho = this.n.criar('ul');
          for (const texto of dados.pendenciasTecnicas) despacho.append(this.n.criar('li', texto));
          if (!despacho.childNodes.length) despacho.append(this.n.criar('li', 'Nenhum impedimento adicional na prévia; despacho continua desligado.'));
          saida.append(despacho);
          if (dados.gatePodeSerMarcado && dados.podeRegistrarGate) {
            const justificativa = this.n.criar('textarea');
            justificativa.maxLength = 2000;
            justificativa.minLength = 10;
            justificativa.rows = 3;
            justificativa.setAttribute('aria-label', 'Justificativa do gate (mínimo 10 caracteres)');
            const evidencias = this.n.criar('textarea');
            evidencias.rows = 3;
            evidencias.setAttribute('aria-label', 'Evidências do gate, uma por linha (1 a 10, mínimo 5 caracteres cada)');
            for (const campo of [justificativa, evidencias]) campo.addEventListener('input', () => {
              this.n.estado.confirmacaoGate = null;
              saida.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(no => no.remove());
            });
            const preparar = this.n.criar('button', `Preparar marcação ${gate}`, 'orq-acao');
            preparar.type = 'button';
            preparar.addEventListener('click', () => this.painel.gates.preparar(c.id, dados.versaoCarta, gate,
              justificativa.value, evidencias.value, saida));
            saida.append(this.n.criar('p', 'Justificativa (mínimo 10 caracteres)'), justificativa,
              this.n.criar('p', 'Evidências (uma por linha; 1 a 10, mínimo 5 caracteres cada)'), evidencias, preparar);
          } else if (dados.gatePodeSerMarcado) {
            saida.append(this.n.criar('p', 'Gate estruturalmente pronto, mas a identidade restrita de escrita não está configurada para este projeto.'));
          }
        } catch (erro) { if (!this.n.abortado(erro)) saida.textContent = erro.message; }
      });
      alvo.append(botao);
    }
    const pronta = this.n.criar('div', '', 'orq-prontidao');
    pronta.id = 'orq-prontidao';
    alvo.append(pronta);
  }
}

globalThis.DemandaProntidao = DemandaProntidao;
