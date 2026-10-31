// Selo do cabeçalho: de quem é a sessão do Cadastro Único neste navegador. Só lê /api/sessao.
//
// O central só aceita sair por POST de mesma origem: o painel não sai por você, leva à
// home de astargne.com, onde está o botão Sair. Entrar volta para cá pelo ?next=.

(function () {
  const CENTRAL = 'https://astargne.com';
  const BORDA = 'painel.vpn.astargne.com';

  function link(texto, href) {
    const a = document.createElement('a');
    a.textContent = texto;
    a.href = href;
    return a;
  }

  function desenhar(alvo, s) {
    const naBorda = location.host === BORDA;
    const entrar = `${CENTRAL}/login?next=${encodeURIComponent(location.href)}`;
    const quem = document.createElement('span');
    quem.className = 'sessao-quem';
    const partes = [];
    alvo.dataset.estado = s.estado;
    if (s.estado === 'dono') {
      quem.textContent = `${s.nome || s.email} · dono`;
      quem.title = s.email;
      partes.push(link('trocar', CENTRAL));
    } else if (s.estado === 'outra-conta') {
      quem.textContent = `${s.nome || s.email} · não é o dono`;
      quem.title = `${s.email}: as ações do painel são recusadas com esta conta. Saia em astargne.com e entre com a conta do dono.`;
      partes.push(link('sair em astargne.com', CENTRAL));
    } else if (s.estado === 'expirada') {
      quem.textContent = 'sessão expirada';
      partes.push(link('entrar', entrar));
    } else if (s.estado === 'indisponivel') {
      quem.textContent = 'sessão não verificada';
      quem.title = 'O Cadastro Único não respondeu; tente recarregar.';
    } else {
      quem.textContent = naBorda ? 'sem sessão' : 'sem sessão (loopback)';
      quem.title = naBorda ? '' : `Ações do painel só pela borda: https://${BORDA}`;
      partes.push(naBorda ? link('entrar', entrar) : link('abrir pela borda', `https://${BORDA}${location.pathname}`));
    }
    alvo.replaceChildren(quem, ...partes);
  }

  async function carregar() {
    const alvo = document.getElementById('sessao-sso');
    if (!alvo) return;
    try {
      const r = await fetch('/api/sessao', { cache: 'no-store' });
      desenhar(alvo, r.ok ? await r.json() : { estado: 'indisponivel' });
    } catch { desenhar(alvo, { estado: 'indisponivel' }); }
  }

  // Ao voltar para a aba (depois de trocar de conta em astargne.com), relê.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
  carregar();
}());
