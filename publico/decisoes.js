// Aba Decisões: o que está visível, os três grupos maiores e o resto colapsado.
// A linha mora em decisoes-linha.js, o agrupamento em decisoes-grupo.js
// e o bloco do dono em decisoes-astargne.js.

class PaginaDecisoes {
  constructor() {
    this.aba = document.getElementById('aba-decisoes');
  }

  desenhar() {
    if (!decisoesDisponiveis) {
      this.aba.replaceChildren(el('p', { class: 'discreto' }, 'não consegui carregar as decisões agora.'));
      return;
    }
    const visiveis = dadosDecisoes.filter((d) => decisaoVisivel(d) && !projetoCongelado(d.projeto));
    const toggle = elToggleFiltro(desenharDecisoes);

    if (!visiveis.length) {
      this.aba.replaceChildren(
        el('div', { class: 'decisoes-cabecalho' }, el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 03 / DECISÕES'), el('h2', { class: 'titulo-secao' }, '0 decisões paradas')), toggle),
        el('p', { class: 'discreto' }, modoFiltroTag === 'aberto' ? 'nenhuma decisão aberta — tudo pronto ou congelado.' : 'nenhuma decisão parada — tudo limpo.'),
      );
      return;
    }

    const grupos = GruposDecisao.porProjeto(visiveis);
    const maisVelhaGeral = GruposDecisao.maisVelha(visiveis);
    const principais = grupos.slice(0, 3);
    const resto = grupos.slice(3);

    const detalhesProjeto = ([pasta, decisoes], aberto) => el(
      'details',
      { class: 'grupo-projeto-decisoes', ...(aberto ? { open: '' } : {}) },
      el(
        'summary',
        { class: 'grupo-projeto-cab' },
        el('span', { class: 'chev' }, '›'),
        el('span', { class: 'grupo-projeto-titulo' }, tituloDoProjeto(pasta)),
        el('span', { class: 'kicker grupo-projeto-arquivo' }, arquivoDoProjeto(pasta)),
        el('span', { class: 'selo-contagem' }, String(decisoes.length)),
      ),
      el('div', { class: 'lista-decisoes-tab' }, ...decisoes.map(d => LinhaDecisao.desenhar(d))),
    );

    const blocos = principais.map((g) => detalhesProjeto(g, true));

    if (resto.length) {
      const totalResto = resto.reduce((soma, [, d]) => soma + d.length, 0);
      blocos.push(el(
        'details',
        { class: 'grupo-projeto-decisoes' },
        el(
          'summary',
          { class: 'grupo-projeto-cab' },
          el('span', { class: 'chev' }, '›'),
          el('span', { class: 'grupo-projeto-titulo' }, `Outros ${resto.length} projetos`),
          el('span', { class: 'kicker grupo-projeto-arquivo' }, resto.map(([p, d]) => `${tituloDoProjeto(p)} ${d.length}`).join(' · ')),
          el('span', { class: 'selo-contagem' }, String(totalResto)),
        ),
        ...resto.map((g) => detalhesProjeto(g, false)),
      ));
    }

    const astargneEl = el('div', { class: 'astargne-ancora' });
    BlocoAstargne.ler().then(chaves => { if (astargneEl.isConnected) astargneEl.replaceChildren(BlocoAstargne.desenhar(BlocoAstargne.classificar(dadosDecisoes, chaves), chaves)); });
    this.aba.replaceChildren(
      el(
        'div',
        { class: 'decisoes-cabecalho' },
        el(
          'div',
          {},
          el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 03 / DECISÕES'),
          el('h2', { class: 'titulo-secao' }, `${visiveis.length} decisões paradas`),
          el('p', { class: 'kicker' }, `agrupadas por projeto${maisVelhaGeral?.desde ? ` · a mais velha é de ${new Date(maisVelhaGeral.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}`),
        ),
        toggle,
      ),
      astargneEl,
      ...blocos,
    );
  }
}

const paginaDecisoes = new PaginaDecisoes();
function desenharDecisoes() { paginaDecisoes.desenhar(); }
