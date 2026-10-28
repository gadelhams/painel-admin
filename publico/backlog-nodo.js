// Árvore do backlog: placar, tag e o nó. A aba só escolhe o projeto e o filtro.

class ArvoreBacklog {
  static TAGS = ['ASTARGNE', 'BLOQUEADA', 'EMPÍRICA', 'CONGELADA', 'SEM ESCOPO', 'PÓS-PLAYTEST'];
  static CLASSE = {
    ASTARGNE: 'tag-astargne',
    BLOQUEADA: 'tag-bloqueada',
    CONGELADA: 'tag-congelada',
    'EMPÍRICA': 'tag-empirica',
    'PÓS-PLAYTEST': 'tag-empirica',
    'SEM ESCOPO': 'tag-sem-escopo',
  };

  static placar(nodos) {
    let total = 0;
    let prontos = 0;
    for (const nodo of nodos) {
      if (nodo.tipo === 'item') {
        total += 1;
        if (nodo.estado === 'pronto') prontos += 1;
      }
      const sub = this.placar(nodo.filhos ?? []);
      total += sub.total;
      prontos += sub.prontos;
    }
    return { total, prontos };
  }

  static chip({ tag, detalhe }) {
    const classe = this.CLASSE[tag];
    return el(
      'span',
      { class: `etiqueta tag${classe ? ` ${classe}` : ''}`, ...(detalhe ? { title: detalhe } : {}) },
      tag,
    );
  }

  static mensagemDeFalha(pr) {
    if (pr.estado === 'erro_plane') return `falha ao consultar o Plane — ${pr.erro ?? pr.estado}`;
    return pr.estado === 'sem_arquivo'
      ? `sem arquivo — ${pr.pasta}/${pr.backlog} não existe no disco`
      : `falha ao ler ${pr.pasta}/${pr.backlog} — ${pr.erro ?? pr.estado}`;
  }

  static conteudo(nodo) {
    const partes = [];
    if (nodo.tipo === 'item') {
      partes.push(el('span', { class: `marca ${nodo.estado}` }, nodo.estado === 'pronto' ? '☑' : '☐'));
    }
    if (nodo.identificador) {
      partes.push(el('a', { class: 'id-rastreador', href: nodo.url, target: '_blank', rel: 'noopener' }, nodo.identificador));
    }
    partes.push(el('span', { class: 'item-texto' }, ...formatar(nodo.texto)));
    const p = this.placar(nodo.filhos ?? []);
    if (p.total) partes.push(el('span', { class: 'placar' }, `${p.prontos}/${p.total}`));
    partes.push(...nodo.tags.map((t) => this.chip(t)));
    return partes;
  }

  static desenhar(nodo, comFilhos = true) {
    const classeTipo = nodo.tipo === 'cru' ? ' cru' : '';
    const classeEstado = nodo.tipo === 'item' ? ` ${nodo.estado}` : '';
    const temFilhos = comFilhos && (nodo.filhos ?? []).length > 0;
    if (temFilhos) {
      return el(
        'details',
        { class: `item${classeEstado}${classeTipo}` },
        el('summary', { class: 'item-linha' }, ...this.conteudo(nodo)),
        el('div', { class: 'item-filhos' }, ...nodo.filhos.map((f) => this.desenhar(f))),
      );
    }
    return el('div', { class: `item-linha folha${classeEstado}${classeTipo}` }, ...this.conteudo(nodo));
  }

  static visivel(nodo) {
    return modoFiltroTag === 'todos' || nodo.tipo !== 'item' || nodo.estado !== 'pronto';
  }

  static comTag(nodos, tag, achados = []) {
    for (const nodo of nodos) {
      if (nodo.tags.some((t) => t.tag === tag) && this.visivel(nodo)) achados.push(nodo);
      this.comTag(nodo.filhos ?? [], tag, achados);
    }
    return achados;
  }

  static contar(nodos, contagem) {
    for (const nodo of nodos) {
      if (this.visivel(nodo)) {
        for (const t of nodo.tags) contagem.set(t.tag, (contagem.get(t.tag) ?? 0) + 1);
      }
      this.contar(nodo.filhos ?? [], contagem);
    }
  }

  static outline(f, aberta, tagAtiva) {
    const p = this.placar(f.itens);
    const corpo = tagAtiva
      ? this.comTag(f.itens, tagAtiva).map((nodo) => this.desenhar(nodo, false))
      : f.itens.map((nodo) => this.desenhar(nodo));
    return el(
      'details',
      { class: 'feature-outline', ...(aberta ? { open: '' } : {}) },
      el(
        'summary',
        { class: 'feature-outline-cab' },
        el('span', { class: 'chev' }, '›'),
        el('span', { class: 'feature-token' }, f.estado === 'pronto' ? '[x]' : '[ ]'),
        el('span', { class: 'feature-outline-titulo' }, ...formatar(f.titulo)),
        el('span', { class: 'placar' }, `${p.prontos}/${p.total}`),
      ),
      el('div', { class: 'feature-outline-corpo' }, ...corpo),
    );
  }
}

function placar(nodos) { return ArvoreBacklog.placar(nodos); }
function chipTag(tag) { return ArvoreBacklog.chip(tag); }
function mensagemFalhaBacklog(pr) { return ArvoreBacklog.mensagemDeFalha(pr); }
function desenharNodo(nodo, comFilhos) { return ArvoreBacklog.desenhar(nodo, comFilhos); }
function nosComTag(nodos, tag, achados) { return ArvoreBacklog.comTag(nodos, tag, achados); }
function contarTags(nodos, contagem) { return ArvoreBacklog.contar(nodos, contagem); }
function outlineFeatureDetalhes(f, aberta, tagAtiva) { return ArvoreBacklog.outline(f, aberta, tagAtiva); }
const TAGS_CANONICAS = ArvoreBacklog.TAGS;

globalThis.ArvoreBacklog = ArvoreBacklog;
