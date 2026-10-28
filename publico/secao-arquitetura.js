// Moldura de arquitetura e a lista de documentos modeladores.

class SecaoArquitetura {
  static mermaid(conteudoMd) {
    return renderizarMarkdown(conteudoMd).find((b) => b.tagName === 'PRE' && b.className === 'mermaid') ?? null;
  }

  static modeladores(pasta, modeladores) {
    if (!modeladores.length) return el('p', { class: 'discreto' }, 'nenhum documento modelador (.md) visível.');
    const linhas = modeladores.map((caminho) => {
      const botao = el('button', { class: 'link-doc', type: 'button' }, caminho);
      const corpo = el('div', { class: 'doc-conteudo', hidden: '' });
      botao.addEventListener('click', async () => {
        if (!corpo.hidden) { corpo.hidden = true; return; }
        corpo.hidden = false;
        if (corpo.dataset.carregado) return;
        corpo.replaceChildren(el('p', { class: 'discreto' }, 'Carregando…'));
        const resposta = await fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs?arquivo=${encodeURIComponent(caminho)}`);
        const dados = await resposta.json();
        corpo.dataset.carregado = '1';
        corpo.replaceChildren(dados.erro
          ? el('p', { class: 'discreto' }, dados.erro)
          : el('div', {}, ...renderizarMarkdown(dados.conteudo)));
        if (window.mermaid) mermaid.run();
      });
      const item = el('div', { class: 'doc-item' }, botao, corpo);
      if (window.abrirDocPedido && window.abrirDocPedido === caminho) {
        window.abrirDocPedido = null;
        queueMicrotask(() => { botao.click(); item.scrollIntoView?.({ block: 'start' }); });
      }
      return item;
    });
    return el('div', { class: 'doc-lista' }, ...linhas);
  }

  static desenhar(projeto, docs) {
    const arquivo = SecaoArquitetura.COM_DIAGRAMA.has(projeto.pasta)
      ? docs?.curados?.arquitetura?.find((a) => !a.erro)
      : null;
    const mermaidEl = arquivo ? SecaoArquitetura.mermaid(arquivo.conteudo) : null;
    const moldura = el(
      'div',
      { class: 'moldura moldura-arquitetura' },
      el('i', { class: 'canto tl' }), el('i', { class: 'canto tr' }), el('i', { class: 'canto bl' }), el('i', { class: 'canto br' }),
      mermaidEl ?? el('span', { class: 'selo-arquitetura' }, arquivo ? arquivo.caminho : 'sem diagrama ainda'),
    );
    const linkProsa = el('a', { href: '#', class: 'link-prosa' }, 'prosa dos docs →');
    const listaModeladores = el('div', { class: 'lista-modeladores', hidden: '' });
    linkProsa.addEventListener('click', (e) => {
      e.preventDefault();
      listaModeladores.hidden = !listaModeladores.hidden;
      if (!listaModeladores.hidden && !listaModeladores.dataset.montado) {
        listaModeladores.dataset.montado = '1';
        listaModeladores.replaceChildren(SecaoArquitetura.modeladores(projeto.pasta, docs?.modeladores ?? []));
      }
    });
    return el(
      'div',
      { class: 'bloco-contexto' },
      el('p', { class: 'rotulo-bloco' }, 'Arquitetura'),
      moldura,
      linkProsa,
      listaModeladores,
    );
  }
}

SecaoArquitetura.COM_DIAGRAMA = new Set(['_oldSistemaLoreEngine', 'Mapa Khorvaire', 'DiscordTranscriber']);
globalThis.SecaoArquitetura = SecaoArquitetura;
