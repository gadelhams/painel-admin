// Outline do backlog do projeto aberto. Não desenha o cabeçalho.

class SecaoOutline {
  static desenhar(prBacklog, tagAtiva) {
    if (!prBacklog) return el('p', { class: 'discreto' }, 'este projeto não tem o campo backlog no catálogo.');
    if (prBacklog.estado !== 'ok') {
      return el('div', { class: 'sonda' }, el('span', { class: 'luz falha' }), el('span', {}, mensagemFalhaBacklog(prBacklog)));
    }
    if (!prBacklog.features.length) return el('p', { class: 'discreto' }, 'backlog sem features ainda.');
    const features = tagAtiva
      ? prBacklog.features.filter((f) => nosComTag(f.itens, tagAtiva).length)
      : prBacklog.features;
    if (tagAtiva && !features.length) return el('p', { class: 'discreto' }, `nenhuma feature com (${tagAtiva}) neste projeto.`);
    return el('div', { class: 'outline-backlog' }, ...features.map((f, i) => outlineFeatureDetalhes(f, i === 0, tagAtiva)));
  }
}

globalThis.SecaoOutline = SecaoOutline;
