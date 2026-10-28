// Prepara e confirma a troca de um nome. O valor fica no campo e sai ao enviar.

class FormularioTroca {
  constructor(painel) { this.painel = painel; }

  async abrir(projeto, nome, alvo, alvoEl) {
    alvoEl.querySelectorAll('.chaves-form').forEach(n => n.remove());
    const form = el('div', { class: 'chaves-form' });
    const status = el('p', { class: 'kicker' }, 'verificando sessão…');
    form.append(status);
    alvoEl.append(form);
    const r = await PedidoChaves.pedir('POST', '/api/chaves/preparar', { projeto, nome, alvo });
    if (!r.ok) { status.textContent = r.status === 401 ? `${r.dados.erro} Abra https://astargne.com/login e volte a esta aba.` : (r.dados.erro ?? `falha HTTP ${r.status}`); return; }
    this.painel.preparo = r.dados;
    status.textContent = r.dados.depois ? `${r.dados.aviso} Depois: ${r.dados.depois}` : r.dados.aviso;
    const entrada = alvo === 'fora' ? null : el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': `novo valor de ${nome}`, placeholder: 'novo valor (não é exibido nem guardado na tela)', maxlength: '4096' });
    const confirmar = el('button', { type: 'button', class: 'orq-acao' }, alvo === 'fora' ? 'Confirmar: já rotacionei no provedor' : 'Confirmar troca');
    confirmar.addEventListener('click', async () => {
      const valor = entrada ? entrada.value : undefined;
      if (entrada && !valor) { status.textContent = 'informe o novo valor.'; return; }
      confirmar.disabled = true;
      status.textContent = 'gravando…';
      const c = await PedidoChaves.pedir('POST', '/api/chaves/confirmar', valor === undefined ? { confirmacaoId: r.dados.confirmacaoId } : { confirmacaoId: r.dados.confirmacaoId, valor });
      if (entrada) entrada.value = '';
      if (!c.ok) { status.textContent = c.dados.erro ?? `falha HTTP ${c.status}`; confirmar.disabled = false; return; }
      status.textContent = c.dados.alvo === 'fora' ? 'registrado: rotação feita fora do painel.' : `gravado em ${c.dados.arquivo}${c.dados.reinicia ? ` · ${c.dados.reinicia} reinicia em 1 s` : c.dados.reiniciou ? ' · serviço reiniciado' : ''}.`;
      setTimeout(() => this.painel.carregar(), 1500);
    });
    form.append(...(entrada ? [entrada] : []), confirmar);
  }
}

globalThis.FormularioTroca = FormularioTroca;
