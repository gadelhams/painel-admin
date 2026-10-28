// Segunda ação da vigília. O desenho do estado mora em vigilia-desenho.js.

class ConfirmacaoVigilia {
  constructor(n, aoConcluir) {
    this.n = n;
    this.aoConcluir = aoConcluir;
  }

  async preparar(projeto, ligar, alvo) {
    alvo.querySelectorAll('.orq-confirmacao, .orq-preparo').forEach(no => no.remove());
    const status = this.n.criar('p', 'Verificando sessão, contrato e executor…', 'orq-preparo');
    alvo.append(status);
    try {
      const dados = await this.n.json('/api/orquestracao/vigilia/preparar', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projeto, ligar }) });
      const caixa = this.n.criar('div', '', 'orq-confirmacao');
      const botao = this.n.criar('button', ligar ? 'Confirmar: ligar vigília' : 'Confirmar: desligar vigília', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', async () => {
        botao.disabled = true;
        status.textContent = ligar ? 'Ligando…' : 'Desligando…';
        try {
          const r = await this.n.json('/api/orquestracao/vigilia/confirmar', { method: 'POST',
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId: dados.confirmacaoId }) });
          status.textContent = `${r.nome}: vigília ${r.ligada ? 'ligada' : 'desligada'}.`;
          await this.aoConcluir();
        } catch (erro) { status.textContent = erro.message; }
      });
      caixa.append(this.n.criar('strong', `${dados.nome} · ${ligar ? 'ligar' : 'desligar'}`), this.n.criar('p', dados.aviso),
        this.n.criar('p', `Expira em ${new Date(dados.expiraEm).toLocaleTimeString('pt-BR')}.${dados.jaEstava ? ' A vigília já está neste estado.' : ''}`), botao);
      alvo.append(caixa);
      status.textContent = 'Confira e confirme em uma segunda ação.';
    } catch (erro) {
      status.textContent = erro.status === 401 ? `${erro.message} Abra https://astargne.com/login e volte a esta aba.` : erro.message;
    }
  }
}

globalThis.ConfirmacaoVigilia = ConfirmacaoVigilia;
