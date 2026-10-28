// Cabeçalho do projeto e os chips de etiqueta. Não desenha o outline.

class SecaoCabecalho {
  static chips(painel, decisoes) {
    const visiveis = decisoes.filter(decisaoVisivel);
    const contagem = new Map();
    for (const d of visiveis) contagem.set(d.tag, (contagem.get(d.tag) ?? 0) + 1);
    const ordem = [...contagem.keys()].sort((a, b) => (a === 'ASTARGNE' ? -1 : b === 'ASTARGNE' ? 1 : a.localeCompare(b)));
    return ordem.map((tag) => {
      const chip = el(
        'span',
        {
          class: `chip-resumo${tag === 'ASTARGNE' ? ' hot' : ''}${painel.tag === tag ? ' ativa' : ''}`,
          role: 'button',
          tabindex: '0',
        },
        `${tag} ${contagem.get(tag)}`,
      );
      const alternar = () => {
        painel.tag = painel.tag === tag ? null : tag;
        painel.desenharPrincipal();
      };
      chip.addEventListener('click', alternar);
      chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') alternar(); });
      return chip;
    });
  }

  static desenhar(painel, projeto, prBacklog, decisoes) {
    const portas = projeto.portas.length ? ` · ${projeto.portas.map((p) => `:${p.porta}`).join(' ')}` : '';
    return el(
      'div',
      { class: 'cabecalho-projeto' },
      el(
        'div',
        { class: 'cabecalho-projeto-texto' },
        el('p', { class: 'kicker' }, prBacklog?.backlog ? `${projeto.pasta} · ${prBacklog.backlog}` : projeto.pasta),
        el('h1', { class: 'titulo-projeto' }, projeto.titulo),
        el('p', { class: 'sub-projeto' }, `${projeto.stack}${portas}`),
      ),
      el(
        'div',
        { class: 'linha-chips-resumo' },
        el('div', { class: 'chips-resumo' }, ...SecaoCabecalho.chips(painel, decisoes)),
        elToggleFiltro(() => { painel.desenharPrincipal(); painel.desenharContexto(); }),
      ),
    );
  }
}

globalThis.SecaoCabecalho = SecaoCabecalho;
