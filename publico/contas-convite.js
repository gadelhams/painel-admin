// Convite pendente, formulário de convite e o resultado com o link.

class ConviteContas {
  static linha(painel, c) {
    return el(
      'div',
      { class: 'linha-conta' },
      el(
        'div',
        { class: 'conta-identidade' },
        el('div', { class: 'conta-nome' }, c.nome ?? '—'),
        el('div', { class: 'conta-email' }, c.email),
        el('div', { class: 'conta-meta' }, `#${c.id} · criado ${PecasContas.dataCurta(c.criado_em)} · expira ${PecasContas.expiraEm(c.expira_em)} (${PecasContas.dataCurta(c.expira_em)})`),
      ),
      el('div', { class: 'conta-apps' }, PecasContas.chips(painel, PecasContas.permissoesDe(c))),
      el(
        'div',
        { class: 'contas-acoes' },
        PecasContas.botao(painel, 'reenviar', async () => {
          const r = await painel.executar(`reenviar convite para ${c.email}`, 'POST', `/api/contas/convites/${c.id}/reenviar`);
          if (r?.ok) { painel.ultimoConvite = r.dados.convite; painel.desenhar(); }
        }, { title: 'gera link novo (o antigo deixa de valer) e manda o e-mail de novo' }),
        PecasContas.botao(painel, 'revogar', async () => {
          if (!confirm(`Revogar o convite de ${c.email}? O link deixa de funcionar.`)) return;
          const r = await painel.executar(`revogar convite de ${c.email}`, 'DELETE', `/api/contas/convites/${c.id}`);
          if (r?.ok && painel.ultimoConvite?.id === c.id) { painel.ultimoConvite = null; painel.desenhar(); }
        }, { perigo: true }),
      ),
    );
  }

  static resultado(c) {
    if (!c) return null;
    const caixa = el('div', { class: `contas-resultado${c.enviado ? ' ok' : ' erro'}` });
    caixa.append(el('p', { class: 'contas-resultado-cab' }, `convite #${c.id} · ${c.email} · expira ${PecasContas.dataCurta(c.expiraEm)}`));
    if (c.enviado) {
      caixa.append(el('p', {}, 'e-mail enviado. ', el('span', { class: 'discreto' }, 'Se não chegar, use "reenviar" na lista ou o link abaixo.')));
    } else {
      caixa.append(el('p', {}, el('strong', {}, 'e-mail NÃO enviado'), ` — ${c.erro ?? 'motivo desconhecido'}. Mande o link por outro canal:`));
    }
    const campo = el('input', { type: 'text', readonly: '', class: 'contas-link', value: c.link ?? '' });
    campo.addEventListener('focus', () => campo.select());
    const copiar = el('button', { type: 'button', class: 'botao-contas' }, 'copiar link');
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(c.link ?? '');
        copiar.textContent = 'copiado';
      } catch {
        campo.focus();
        copiar.textContent = 'selecione e copie (Ctrl+C)';
      }
    });
    caixa.append(el('div', { class: 'contas-acoes' }, campo, copiar));
    return caixa;
  }

  static formulario(painel) {
    const email = el('input', { type: 'email', name: 'email', required: '', placeholder: 'email@exemplo.com', autocomplete: 'off', class: 'contas-campo' });
    const nome = el('input', { type: 'text', name: 'nome', placeholder: 'nome (opcional)', maxlength: '100', autocomplete: 'off', class: 'contas-campo' });
    const checks = PecasContas.seletores(painel, [], 'novo');
    const enviar = el('button', { type: 'submit', class: 'botao-contas destaque' }, 'convidar');
    if (painel.acaoEmCurso) enviar.disabled = true;
    const form = el(
      'form',
      { class: 'contas-form', autocomplete: 'off' },
      el('h3', { class: 'contas-subtitulo' }, 'Convidar'),
      el('p', { class: 'discreto' }, 'Cria o convite e manda o e-mail. A pessoa escolhe a senha no link, que expira (o prazo é o do central; a data aparece no resultado).'),
      el('label', { class: 'contas-rotulo' }, 'e-mail', email),
      el('label', { class: 'contas-rotulo' }, 'nome', nome),
      el('div', { class: 'contas-rotulo' }, 'apps e papéis', checks),
      el('div', { class: 'contas-acoes' }, enviar),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corpo = { email: email.value.trim(), nome: nome.value.trim() || undefined, apps: PecasContas.marcados(checks, 'novo') };
      if (!corpo.apps.length && !confirm('Nenhum app marcado: a pessoa vai conseguir entrar, mas não vai ver nenhum app com SSO. Convidar assim mesmo?')) return;
      const r = await painel.executar(`convidar ${corpo.email}`, 'POST', '/api/contas/convites', corpo);
      if (r?.ok) { painel.ultimoConvite = r.dados.convite; painel.desenhar(); }
    });
    return form;
  }
}

globalThis.ConviteContas = ConviteContas;
