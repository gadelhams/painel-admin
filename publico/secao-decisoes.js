// Decisões paradas do projeto aberto. Abrir uma delas continua no console.

class SecaoDecisoes {
  static linha(decisao, ehMaisVelha) {
    const classeCor = ['CONGELADA', 'SEM ESCOPO'].includes(decisao.tag) ? 'faint' : ehMaisVelha ? 'hot' : 'dim';
    const linha = el(
      'div',
      { class: `linha-decisao ${classeCor}`, tabindex: '0', role: 'button', title: decisao.texto },
      el('span', { class: 'idade-decisao' }, IdadeCurta.de(decisao.desde)),
      el('span', { class: 'texto-decisao' }, ...formatar(decisao.texto)),
    );
    const abrir = () => abrirConsoleComDecisao(decisao);
    linha.addEventListener('click', abrir);
    linha.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    return linha;
  }

  static desenhar(pasta) {
    const decisoes = decisoesDoProjeto(pasta).filter(decisaoVisivel).sort((a, b) => {
      if (a.desde === null) return 1;
      if (b.desde === null) return -1;
      return new Date(a.desde) - new Date(b.desde);
    });
    const maisVelhaId = decisoes[0]?.id;
    return el(
      'div',
      { class: 'bloco-contexto' },
      el(
        'div',
        { class: 'rotulo-bloco-linha' },
        el('p', { class: 'rotulo-bloco' }, 'Decisões paradas'),
        el('span', { class: 'contagem-bloco' }, `${decisoes.length} neste projeto`),
      ),
      decisoes.length
        ? el('div', { class: 'lista-decisoes' }, ...decisoes.map((d) => SecaoDecisoes.linha(d, d.id === maisVelhaId)))
        : el('p', { class: 'discreto' }, 'nenhuma.'),
    );
  }
}

globalThis.SecaoDecisoes = SecaoDecisoes;
