// Bloco Astargne da aba Decisões. Classifica o que depende do dono; não desenha o resto da aba.

class BlocoAstargne {
  static SEM = { pendentes: [], feitas: [] };
  static cache = { quando: 0, dados: BlocoAstargne.SEM };
  static ABERTO = 'painel-astargne-aberto';
  static PUSH = /\b(push|deploy|publicar|sudo|instalar|borda|unit de usu)/i;
  static PROVA = /\b(prova|aceite|conferir|conferência|exercitar|retestar|testar|entra no|aprova|convidar|olho humano|rotulad|revisada e aceita|medir|real)\b/i;

  static async ler() {
    if (Date.now() - this.cache.quando < 60_000) return this.cache.dados;
    try {
      const r = await fetch('/api/chaves');
      const dados = await r.json();
      this.cache = { quando: Date.now(), dados: r.ok ? { pendentes: dados.pendentes ?? [], feitas: dados.rotacoesFeitas ?? [] } : this.SEM };
    } catch { this.cache = { quando: Date.now(), dados: this.SEM }; }
    return this.cache.dados;
  }

  static classificar(decisoes, { pendentes, feitas }) {
    const cardsDeChave = new Set(pendentes.map(c => c.card));
    const feitaPorCard = new Map(feitas.map(f => [f.card, f]));
    const grupos = { chaves: [], feitas: [], push: [], provas: [], produto: [] };
    for (const d of decisoes) {
      if (d.estado !== 'aberto' || !['ASTARGNE', 'TAREFA DONO', 'EMPÍRICA'].includes(d.tag) || projetoCongelado(d.projeto)) continue;
      if (feitaPorCard.has(d.identificador)) grupos.feitas.push({ ...d, feita: feitaPorCard.get(d.identificador) });
      else if (cardsDeChave.has(d.identificador)) grupos.chaves.push(d);
      else if (this.PUSH.test(d.texto)) grupos.push.push(d);
      else if (d.tag === 'TAREFA DONO' || d.tag === 'EMPÍRICA' || this.PROVA.test(d.texto)) grupos.provas.push(d);
      else grupos.produto.push(d);
    }
    return grupos;
  }

  static aberto() {
    try { return localStorage.getItem(this.ABERTO) !== 'nao'; } catch { return true; }
  }

  static desenhar(grupos, { pendentes }) {
    const lista = (itens, vazio) => itens.length ? el('ul', {}, ...itens.map(d => el('li', {}, ...(d.url ? [linkIssue(d), ' '] : []), `${tituloDoProjeto(d.projeto)} · ${d.texto.slice(0, 110)}`))) : el('p', { class: 'discreto' }, vazio);
    const chaves = pendentes.length
      ? el('ul', {}, ...pendentes.map(c => el('li', {}, el('a', { href: '#/chaves', class: 'id-rastreador' }, c.card), ` ${c.projeto} · `, el('code', {}, c.nome), ` — ${c.motivo}`)))
      : el('p', { class: 'discreto' }, 'nenhuma rotação pendente.');
    const feitas = grupos.feitas.length
      ? el('ul', { class: 'astargne-feitas' }, ...grupos.feitas.map(d => el('li', {}, ...(d.url ? [linkIssue(d), ' '] : []), `${tituloDoProjeto(d.projeto)} · rotação registrada${d.feita.quando ? ` em ${new Date(d.feita.quando).toLocaleDateString('pt-BR')}` : ''} — card a fechar pelo orquestrador`)))
      : null;
    const total = pendentes.length + grupos.push.length + grupos.provas.length + grupos.produto.length;
    const painel = el('details', { class: 'astargne-painel', ...(this.aberto() ? { open: '' } : {}) },
      el('summary', { class: 'astargne-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'pagina-kicker' }, 'ASTARGNE · O QUE DEPENDE DE VOCÊ'), el('span', { class: 'selo-contagem' }, String(total))),
      el('h3', {}, `Chaves e contas externas (${pendentes.length})`), chaves, ...(feitas ? [feitas] : []),
      el('h3', {}, `Push, deploy e sudo (${grupos.push.length})`), lista(grupos.push, 'nada esperando push, deploy ou sudo.'),
      el('h3', {}, `Tarefas suas (${grupos.provas.length})`), lista(grupos.provas, 'nenhuma tarefa sua pendente.'),
      el('h3', {}, `Decisões de produto (${grupos.produto.length})`), lista(grupos.produto, 'nenhuma decisão de produto pendente.'),
      el('p', { class: 'kicker' }, 'classificação por etiqueta e verbo do título; projetos congelados ficam de fora; o resto da aba é o orquestrador quem resolve.'));
    painel.addEventListener('toggle', () => { try { localStorage.setItem(this.ABERTO, painel.open ? 'sim' : 'nao'); } catch { /* sem armazenamento: só não lembra */ } });
    return painel;
  }
}

globalThis.BlocoAstargne = BlocoAstargne;
