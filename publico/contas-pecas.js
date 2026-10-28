// Peças comuns da aba Contas: data, app, papel, botão e seção.

class PecasContas {
  static dataCurta(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  static expiraEm(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    const horas = Math.ceil(ms / 3_600_000);
    if (horas <= 0) return 'expirado';
    if (horas < 48) return `em ${horas} h`;
    return `em ${Math.ceil(horas / 24)} dias`;
  }

  static nomeDoApp(painel, id) {
    return painel.apps.find((a) => a.id === id)?.nome ?? id;
  }

  static nomeDoPapel(painel, appId, papelId) {
    return painel.apps.find((a) => a.id === appId)?.papeis?.find((p) => p.id === papelId)?.nome ?? papelId;
  }

  static permissoesDe(objeto) {
    if (Array.isArray(objeto.permissoes)) return objeto.permissoes;
    return (objeto.apps ?? []).map((app) => ({ app, papel: null }));
  }

  static chips(painel, permissoes) {
    if (!permissoes.length) return el('span', { class: 'discreto' }, 'nenhum app');
    return el('span', { class: 'chips-resumo' }, ...permissoes.map(({ app, papel }) =>
      el('span', { class: 'chip-app', title: `${app}${papel ? `:${papel}` : ''}` }, this.nomeDoApp(painel, app), papel ? ` · ${this.nomeDoPapel(painel, app, papel)}` : '')));
  }

  static seletores(painel, marcados, prefixo) {
    const atual = new Map(marcados.map((p) => [p.app, p.papel]));
    return el(
      'div',
      { class: 'contas-checkboxes' },
      ...painel.apps.map((app) => {
        const papeis = app.papeis ?? [];
        if (!papeis.length) {
          const caixa = el('input', { type: 'checkbox', name: `${prefixo}-apps`, value: app.id });
          if (atual.has(app.id)) caixa.checked = true;
          return el('label', { class: 'contas-checkbox' }, caixa, ` ${app.nome} `, el('code', {}, app.id));
        }
        const sel = el('select', { name: `${prefixo}-papel`, 'data-app': app.id, class: 'contas-select' },
          el('option', { value: '' }, 'sem acesso'),
          ...papeis.map((pp) => el('option', { value: pp.id, title: pp.descricao }, `${pp.nome}${pp.id === app.papelPadrao ? ' (padrão)' : ''}`)));
        sel.value = atual.get(app.id) ?? '';
        return el('label', { class: 'contas-checkbox' }, `${app.nome} `, el('code', {}, app.id), ' ', sel);
      }),
    );
  }

  static marcados(container, prefixo) {
    const comPapel = [...container.querySelectorAll(`select[name="${prefixo}-papel"]`)].filter((s) => s.value).map((s) => ({ app: s.dataset.app, papel: s.value }));
    const semPapel = [...container.querySelectorAll(`input[name="${prefixo}-apps"]:checked`)].map((c) => c.value);
    return [...comPapel, ...semPapel];
  }

  static botao(painel, rotulo, aoClicar, extra = {}) {
    const b = el('button', { type: 'button', class: `botao-contas${extra.perigo ? ' perigo' : ''}`, ...(extra.title ? { title: extra.title } : {}) }, rotulo);
    if (painel.acaoEmCurso) b.disabled = true;
    b.addEventListener('click', aoClicar);
    return b;
  }

  static secao(titulo, contagem, filhos, vazio) {
    return el(
      'section',
      { class: 'contas-secao' },
      el('div', { class: 'contas-secao-cab' }, el('h3', { class: 'contas-subtitulo' }, titulo), el('span', { class: 'selo-contagem' }, String(contagem))),
      ...(filhos.length ? filhos : [el('p', { class: 'discreto' }, vazio)]),
    );
  }
}

globalThis.PecasContas = PecasContas;
