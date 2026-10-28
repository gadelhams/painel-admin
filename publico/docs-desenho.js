// Desenho da aba Docs: rótulos, links e a lista de sinais.

class DesenhoDocs {
  static ROTULO = { funcional: 'funcional', arquitetural: 'arquitetural', tecnica: 'técnica', contrato: 'contrato' };
  static SINAL = {
    fio_longo: 'fio longo', selado_sem_compactar: 'selado sem compactar', current_atras: 'current.md atrasado',
    cita_fechado: 'doc cita card fechado', sem_push: 'sem push', atras_remoto: 'atrás do remoto',
    check_docs: 'portão de docs', sem_current: 'sem current.md', catalogo: 'catálogo', erro: 'erro',
  };

  constructor(painel) {
    this.painel = painel;
  }

  sinal(s) {
    return el('li', { class: `docs-sinal gravidade-${s.gravidade}` },
      el('span', { class: 'chip-app' }, DesenhoDocs.SINAL[s.tipo] ?? s.tipo), ' ',
      s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'id-rastreador' }, s.carta ?? 'card') : '', s.url ? ' ' : '',
      s.texto);
  }

  links(p) {
    const itens = Object.entries(DesenhoDocs.ROTULO).map(([tipo, rotulo]) => {
      const arquivo = p.docs?.[tipo];
      return arquivo
        ? el('a', { href: `#/projeto/${encodeURIComponent(p.pasta)}?arquivo=${encodeURIComponent(arquivo)}`, class: 'docs-link', title: arquivo }, `${rotulo}: ${arquivo}`)
        : el('span', { class: 'discreto' }, `${rotulo}: —`);
    });
    return el('div', { class: 'docs-links' }, ...itens.flatMap((i, k) => (k ? [' · ', i] : [i])));
  }

  desenhar() {
    const blocos = [];
    const d = this.painel.dados;
    const status = this.painel.status;
    const varrer = el('button', { type: 'button', class: 'orq-acao' }, 'Varrer agora');
    varrer.addEventListener('click', () => this.painel.carregar({ agora: true }));
    blocos.push(el('div', { class: 'decisoes-cabecalho' },
      el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 07 / DOCS E ALINHAMENTO'),
        el('h2', { class: 'titulo-secao' }, d ? `${d.total} sinal(is) de desalinhamento` : 'Docs'),
        el('p', { class: 'kicker' }, d ? `varrido ${new Date(d.varridoEm).toLocaleString('pt-BR')} em ${Math.round(d.duracaoMs / 1000)} s · ${d.cartasMedidas} carta(s) remedidas · fio longo = ${d.limiarFio}+ comentários sem COMPACTADO/v1${d.erroPlane ? ` · Plane: ${d.erroPlane}` : ''}` : 'o Plane é só desenvolvimento; a documentação mora nos docs do projeto')),
      varrer));
    if (status) blocos.push(el('p', { class: status.tipo === 'erro' ? 'erro' : 'discreto' }, status.texto));
    if (d) {
      const ordenados = [...d.projetos].sort((a, b) => b.sinais.length - a.sinais.length || a.titulo.localeCompare(b.titulo));
      for (const p of ordenados) {
        blocos.push(el('details', { class: 'grupo-projeto-decisoes', ...(p.sinais.length ? { open: '' } : {}) },
          el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'),
            el('span', { class: 'grupo-projeto-titulo' }, p.titulo),
            el('span', { class: 'kicker grupo-projeto-arquivo' }, p.sinais.length ? p.sinais.map((s) => DesenhoDocs.SINAL[s.tipo] ?? s.tipo).join(' · ') : 'alinhado'),
            el('span', { class: 'selo-contagem' }, String(p.sinais.length))),
          this.links(p),
          p.sinais.length ? el('ul', { class: 'docs-sinais' }, ...p.sinais.map(s => this.sinal(s))) : el('p', { class: 'discreto' }, 'nada desalinhado nesta varredura.')));
      }
    }
    this.painel.aba.replaceChildren(el('div', { class: 'docs-painel' }, ...blocos));
    const selo = document.getElementById('selo-docs');
    if (selo && d) selo.textContent = String(d.total);
  }
}

globalThis.DesenhoDocs = DesenhoDocs;
