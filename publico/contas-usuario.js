// Linha de usuário e o editor de permissões. Não cria convite.

class UsuarioContas {
  static editor(painel, u) {
    const caixa = el('div', { class: 'contas-editor' });
    const checks = PecasContas.seletores(painel, PecasContas.permissoesDe(u), `u${u.id}`);
    caixa.append(
      el('p', { class: 'kicker' }, 'permissão e papel por app (só apps com SSO); o app aplica o papel'),
      checks,
      el(
        'div',
        { class: 'contas-acoes' },
        PecasContas.botao(painel, 'salvar', async () => {
          const apps = PecasContas.marcados(checks, `u${u.id}`);
          const r = await painel.executar(`permissões de ${u.email}`, 'PUT', `/api/contas/usuarios/${u.id}/permissoes`, { apps });
          if (r?.ok) painel.usuarioEditando = null;
          painel.desenhar();
        }),
        PecasContas.botao(painel, 'cancelar', () => { painel.usuarioEditando = null; painel.desenhar(); }),
      ),
    );
    return caixa;
  }

  static linha(painel, u) {
    const acoes = el(
      'div',
      { class: 'contas-acoes' },
      PecasContas.botao(painel, painel.usuarioEditando === u.id ? 'fechar' : 'permissões', () => {
        painel.usuarioEditando = painel.usuarioEditando === u.id ? null : u.id;
        painel.desenhar();
      }),
      u.ativo
        ? PecasContas.botao(painel, 'desativar', () => {
          if (!confirm(`Desativar ${u.email}? As sessões abertas dessa pessoa são encerradas na hora.`)) return;
          painel.executar(`desativar ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/desativar`);
        }, { perigo: true })
        : PecasContas.botao(painel, 'reativar', () => painel.executar(`reativar ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/reativar`)),
      PecasContas.botao(painel, 'redefinir senha', async () => {
        const r = await painel.executar(`redefinição de senha de ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/redefinir`);
        if (r?.ok && r.dados.enviado === false) {
          painel.status = { tipo: 'erro', texto: `redefinição de ${u.email}: e-mail NÃO enviado — ${r.dados.erro ?? 'motivo desconhecido'}` };
          painel.desenhar();
        }
      }, { title: u.ativo ? 'manda o e-mail "redefinir senha" (o link expira; o prazo é o do central)' : 'só para usuário ativo' }),
    );
    const linha = el(
      'div',
      { class: `linha-conta${u.ativo ? '' : ' inativa'}` },
      el(
        'div',
        { class: 'conta-identidade' },
        el('div', { class: 'conta-nome' }, u.nome ?? '—', u.ativo ? '' : el('span', { class: 'etiqueta inativo' }, 'desativado')),
        el('div', { class: 'conta-email' }, u.email),
        el('div', { class: 'conta-meta' }, `#${u.id} · desde ${PecasContas.dataCurta(u.criado_em)}`),
      ),
      el('div', { class: 'conta-apps' }, PecasContas.chips(painel, PecasContas.permissoesDe(u))),
      acoes,
    );
    if (painel.usuarioEditando === u.id) linha.append(this.editor(painel, u));
    return linha;
  }
}

globalThis.UsuarioContas = UsuarioContas;
