// Uma célula da tira de projetos.

class TiraTelemetria {
  static estado(p, decisoes) {
    if (p.congelado) return { texto: 'PAUSADO', classe: 'pausa' };
    if (decisoes.length) return { texto: 'COM DECISÃO', classe: 'decisao' };
    if (p.producao) return { texto: 'NO AR', classe: 'no-ar' };
    return { texto: 'EM DIA', classe: 'em-dia' };
  }

  static celula(p) {
    const decisoes = decisoesDoProjeto(p.pasta).filter(decisaoVisivel);
    const estado = TiraTelemetria.estado(p, decisoes);
    const partes = [];
    if (decisoes.length) partes.push(decisoes.length === 1 ? '1 decisão' : `${decisoes.length} decisões`);
    partes.push(p.producao ? 'no ar' : 'local');
    const celula = el(
      'button',
      {
        type: 'button',
        class: `celula-telemetria${decisoes.length ? ' com-decisao' : ' limpa'}${p.pasta === projetoSelecionado ? ' selecionada' : ''}`,
        'data-pasta': p.pasta,
      },
      el('span', { class: 'tt-topo' },
        el('span', { class: 'tt-nome' }, nomeCurto(p.pasta) ?? p.titulo),
        el('span', { class: `tt-estado ${estado.classe}` }, estado.texto),
      ),
      el('span', { class: 'tt-meta' }, partes.join(' · ')),
    );
    celula.addEventListener('click', () => { location.hash = `#/projeto/${encodeURIComponent(p.pasta)}`; });
    return celula;
  }

  static desenhar() {
    document.getElementById('tira-telemetria').replaceChildren(...dadosProjetos.map((p) => TiraTelemetria.celula(p)));
  }
}

globalThis.TiraTelemetria = TiraTelemetria;
