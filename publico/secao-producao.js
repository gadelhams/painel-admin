// Sondas de produção e a consulta SSH sob demanda. Não abre o console.

class SecaoProducao {
  static desenhar() {
    const botao = el('button', { type: 'button', class: 'botao-ssh-ctx' }, 'consultar SSH (leitura)');
    const saida = el('pre', { class: 'saida-ssh-ctx', hidden: '' });
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      saida.hidden = false;
      saida.textContent = 'Consultando linuxuser@astargne.com…';
      try {
        const resposta = await fetch('/api/producao/ssh');
        const resultado = await resposta.json();
        saida.textContent = resultado.ok ? resultado.saida : `Falhou: ${resultado.erro}`;
      } catch (erro) {
        saida.textContent = `Falhou: ${erro.message}`;
      } finally {
        botao.disabled = false;
      }
    });
    return el(
      'div',
      { class: 'bloco-contexto' },
      el('p', { class: 'rotulo-bloco' }, 'Produção · astargne.com'),
      ...dadosProducao.map((s) => el(
        'div',
        { class: 'linha-sonda-ctx' },
        el('span', {}, s.rotulo),
        el('span', { class: s.ok ? 'hot' : 'faint' }, s.ok ? `${s.status} · ${s.ms}ms` : (s.erro ?? `HTTP ${s.status}`)),
      )),
      botao,
      saida,
    );
  }
}

globalThis.SecaoProducao = SecaoProducao;
