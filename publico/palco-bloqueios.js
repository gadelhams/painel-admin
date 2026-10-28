// Os cinco bloqueios mais antigos do palco.

class PalcoBloqueios {
  static stat(valor, rotulo) {
    return el('div', { class: 'palco-stat' },
      el('span', { class: 'palco-stat-valor' }, valor),
      el('span', { class: 'palco-stat-rotulo' }, rotulo),
    );
  }

  static bloqueio(decisao, indice) {
    const nome = nomeCurto(decisao.projeto) ?? decisao.projeto;
    const idade = decisao.desde ? tempoRelativo(decisao.desde) : 'sem data';
    const card = indice === 0
      ? el('button', { type: 'button', class: 'bloqueio-destaque' },
        el('span', { class: 'bloqueio-meta' },
          el('span', {}, `1 · ${nome}`),
          el('span', {}, idade),
        ),
        el('span', { class: 'bloqueio-titulo' }, ...formatar(decisao.texto)),
        el('span', { class: 'bloqueio-dica' }, 'perguntar ao C-3PO'),
      )
      : el('button', { type: 'button', class: 'bloqueio-item' },
        el('span', { class: 'bloqueio-indice' }, String(indice + 1)),
        el('span', { class: 'bloqueio-corpo' },
          el('span', { class: 'bloqueio-titulo' }, ...formatar(decisao.texto)),
          el('span', { class: 'bloqueio-dica' }, `${nome} · ${idade}`),
        ),
      );
    card.addEventListener('click', () => abrirConsoleComDecisao(decisao));
    return card;
  }

  static desenhar() {
    const abertas = dadosDecisoes.filter(decisaoVisivel);
    const stats = document.getElementById('palco-stats');
    if (stats) {
      stats.replaceChildren(
        PalcoBloqueios.stat(decisoesDisponiveis ? String(abertas.length) : '—', 'BLOQUEIOS'),
        PalcoBloqueios.stat(String(dadosProjetos.length), 'PROJETOS'),
        PalcoBloqueios.stat(String(dadosProjetos.filter((p) => p.producao).length), 'NO AR'),
      );
    }
    const rotuloProjetos = document.getElementById('rotulo-projetos');
    if (rotuloProjetos) rotuloProjetos.textContent = `PROJETOS · ${dadosProjetos.length}`;
    const rotuloBloqueios = document.getElementById('rotulo-bloqueios');
    if (rotuloBloqueios) rotuloBloqueios.textContent = decisoesDisponiveis ? `BLOQUEIOS · ${abertas.length}` : 'BLOQUEIOS';
    const lista = document.getElementById('lista-bloqueios');
    if (!lista) return;
    if (!decisoesDisponiveis) {
      lista.replaceChildren(el('p', { class: 'discreto' }, 'não consegui ler as decisões.'));
      return;
    }
    const ordenadas = [...abertas].sort((a, b) => {
      if (a.desde == null) return 1;
      if (b.desde == null) return -1;
      return new Date(a.desde) - new Date(b.desde);
    }).slice(0, 5);
    lista.replaceChildren(...(ordenadas.length
      ? ordenadas.map(PalcoBloqueios.bloqueio)
      : [el('p', { class: 'discreto' }, 'nenhuma decisão parada.')]));
  }
}

globalThis.PalcoBloqueios = PalcoBloqueios;
