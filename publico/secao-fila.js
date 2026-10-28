// O lugar da fila de jobs. O painel ainda não tem esse sistema.

class SecaoFila {
  static desenhar() {
    return el(
      'div',
      { class: 'bloco-contexto' },
      el('p', { class: 'rotulo-bloco' }, 'Fila de jobs'),
      el('p', { class: 'discreto' }, 'sem sistema de jobs ainda — fase 3 (ações com portão) não existe.'),
    );
  }
}

globalThis.SecaoFila = SecaoFila;
