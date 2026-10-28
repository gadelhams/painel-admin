// Uma linha de segredo catalogado. O formulário da troca mora em chaves-troca-form.js.

class LinhaChaves {
  constructor(painel, formulario) {
    this.painel = painel;
    this.formulario = formulario;
  }

  desenhar(projeto, c, alvoPadrao) {
    const rot = c.rotacao;
    const estados = [];
    if (c.local !== null && c.local !== undefined) estados.push(`local: ${c.local}`);
    if (c.servidor !== null && c.servidor !== undefined) estados.push(`servidor: ${c.servidor}`);
    const acoes = el('div', { class: 'chaves-acoes' });
    for (const alvo of ['local', 'servidor']) {
      if (c[alvo] === null || c[alvo] === undefined || c.bloqueado) continue;
      const b = el('button', { type: 'button', class: 'orq-acao' }, alvo === 'local' ? 'Trocar aqui' : 'Trocar no servidor');
      b.addEventListener('click', () => this.formulario.abrir(projeto, c.nome, alvo, acoes));
      acoes.append(b);
    }
    if (alvoPadrao === 'fora') {
      const b = el('button', { type: 'button', class: 'orq-acao' }, 'Marcar como rotacionada');
      b.addEventListener('click', () => this.formulario.abrir(projeto, c.nome, 'fora', acoes));
      acoes.append(b);
    }
    return el('div', { class: `chaves-linha${rot ? ' chaves-pendente' : ''}` },
      el('div', { class: 'chaves-nome' }, el('code', {}, c.nome), c.descricao ? el('span', { class: 'kicker' }, ` ${c.descricao}`) : ''),
      el('div', { class: 'chaves-estado' }, estados.join(' · ') || '—', c.ultimaTroca ? ` · trocada em ${new Date(c.ultimaTroca).toLocaleString('pt-BR')}` : ''),
      rot ? el('div', { class: 'chaves-rotacao' }, el('strong', {}, 'ROTAÇÃO PENDENTE'), ` — ${rot.motivo} (${rot.card}, desde ${rot.desde})`, rot.depois ? el('div', { class: 'kicker' }, `depois: ${rot.depois}`) : '') : '',
      c.bloqueado ? el('div', { class: 'kicker chaves-bloqueado' }, `troca fora do painel: ${c.bloqueado}`) : '',
      c.depois ? el('div', { class: 'kicker' }, `toda troca exige depois: ${c.depois}`) : '',
      acoes);
  }
}

globalThis.LinhaChaves = LinhaChaves;
