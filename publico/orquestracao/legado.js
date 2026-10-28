// Canal legado do SupervisorHandoff. Leitura só ao abrir o tópico.

class LegadoOrquestracao {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  async carregar() {
    const status = this.n.$('orq-legado-status');
    const alvo = this.n.$('orq-legado');
    status.textContent = 'Lendo os canais do SupervisorHandoff (python só-leitura)…';
    try {
      const dados = await this.n.json('/api/orquestracao/legado', { signal: this.n.sinal('legado') });
      alvo.replaceChildren();
      for (const canal of dados.canais) {
        const caixa = this.n.criar('article', '', 'orq-legado-canal');
        caixa.append(this.n.criar('h3', `${canal.config}${canal.documento ? ` · ${canal.documento}` : ''}`));
        if (!canal.disponivel) { caixa.append(this.n.criar('p', `Indisponível: ${canal.motivo}`, 'orq-ajuda')); alvo.append(caixa); continue; }
        caixa.append(this.n.criar('p', `commit ${canal.commit ?? '?'} · HEAD ${canal.head ?? '?'} · origin ${canal.origin ?? '?'} · protocolo ${canal.protocolo ?? '?'} · último bloco ${canal.ultimoBloco ?? '?'}`));
        caixa.append(this.n.criar('p', `trava ${canal.trava.ativa ? `ativa há ${canal.trava.idadeSegundos ?? '?'} s` : 'livre'} · pausas ${Object.keys(canal.pausas).length || 'nenhuma'} · integridade ${canal.integridade.length ? canal.integridade.join('; ') : 'ok'}${canal.erro ? ` · leitura parcial: ${canal.erro}` : ''}`));
        const pend = this.n.criar('ul', '', 'orq-legado-pendencias');
        for (const p of canal.pendencias) pend.append(this.n.criar('li', `${p.card} · ${p.ator} · ${p.acao} · ${p.motivo} · tentativas ${p.tentativas}${p.bloqueado ? ' · BLOQUEADO' : ''}`));
        if (!canal.pendencias.length) pend.append(this.n.criar('li', 'Ninguém tem a vez.'));
        caixa.append(this.n.criar('h4', 'Quem tem a vez'), pend);
        if (canal.sugestoes.length) caixa.append(this.n.criar('p', `Sugestões: ${canal.sugestoes.map(s => typeof s === 'string' ? s : JSON.stringify(s)).join(' · ')}`, 'orq-ajuda'));
        const cards = this.n.criar('ul', '', 'orq-legado-cards');
        for (const c of canal.cards) cards.append(this.n.criar('li', `${c.id} · ${c.estado ?? '?'} · próximo ${c.proximoAtor ?? '—'}${c.titulo ? ` · ${c.titulo}` : ''}`));
        caixa.append(this.n.criar('h4', `Cards do controle (${canal.cards.length})`), cards);
        const tps = this.n.criar('ul', '', 'orq-legado-touchpoints');
        for (const t of canal.touchpoints) tps.append(this.n.criar('li', `${t.quando ?? '?'} · ${t.card ?? '?'} · ${t.ator ?? '?'} · ${t.acao ?? '?'} · ${t.resultado ?? '?'} · ${String(t.resumo ?? '').slice(0, 160)}`));
        if (!canal.touchpoints.length) tps.append(this.n.criar('li', 'Sem touchpoints.'));
        caixa.append(this.n.criar('h4', 'Últimos touchpoints'), tps);
        if (canal.execucao.arquivo) caixa.append(this.n.criar('p', `Saída mais recente: ${canal.execucao.arquivo} (há ${canal.execucao.modificadoHa ?? '?'} s)`, 'orq-ajuda'));
        alvo.append(caixa);
      }
      status.textContent = `${dados.fonte} · lido às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}. ${dados.observacao}`;
    } catch (erro) { if (!this.n.abortado(erro)) status.textContent = `Canal legado indisponível: ${erro.message}`; }
  }
}

globalThis.LegadoOrquestracao = LegadoOrquestracao;
