// Uma linha da aba Decisões. O clique abre o console; o link do card não abre junto.

class LinhaDecisao {
  static link(d) {
    const a = el('a', { class: 'id-rastreador', href: d.url, target: '_blank', rel: 'noopener' }, d.identificador);
    a.addEventListener('click', (e) => e.stopPropagation());
    return a;
  }

  static desenhar(d) {
    const linha = el(
      'div',
      { class: 'linha-decisoes-tab', tabindex: '0', role: 'button' },
      el('span', { class: 'idade-decisoes-tab' }, d.desde ? `${new Date(d.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${idadeCurta(d.desde)}` : '—'),
      el(
        'div',
        { class: 'texto-decisoes-tab' },
        el('div', { class: 'texto-decisao-principal' }, ...formatar(d.texto)),
        el(
          'div',
          { class: 'contexto-decisao' },
          ...(d.url ? [this.link(d), ' · '] : []),
          `${d.feature}`,
        ),
      ),
      chipTag({ tag: d.tag, detalhe: d.detalhe }),
    );
    const abrir = () => abrirConsoleComDecisao(d);
    linha.addEventListener('click', abrir);
    linha.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    return linha;
  }
}

function linkIssue(d) { return LinhaDecisao.link(d); }

globalThis.LinhaDecisao = LinhaDecisao;
