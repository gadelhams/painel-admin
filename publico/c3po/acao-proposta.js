// Cartão "Ação proposta" do chat do C-3PO: Preparar mostra o comando exato, Confirmar roda com a sessão do dono e mostra o resultado. Não propõe nem decide.
//
// Usado pelo /c3po/, pelo console do painel e pelo popup do Hangar (que o importa como
// módulo, como o fluxo-sse.js). Todo texto entra por textContent: projeto, saída e
// mensagem de erro vêm de fora.

(() => {
  const SEM_SESSAO = 'Sem a sessão do dono no Cadastro Único nada é executado; entre em https://astargne.com e volte a esta aba.';

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  async function postar(caminho, corpo) {
    const r = await fetch(caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados };
  }

  function linhaDetalhe(lista, rotulo, valor) {
    lista.append(el('dt', null, rotulo), el('dd', null, valor));
  }

  class CartaoAcao {
    static criar(proposta) {
      const cartao = el('div', 'acao-cartao');
      cartao.dataset.proposta = proposta.id;
      const titulo = el('p', 'acao-titulo', 'Ação proposta: rodar ');
      titulo.append(el('code', null, proposta.comando), ' em ', el('code', null, proposta.projeto));
      const nota = el('p', 'acao-nota', 'O C-3PO só propõe. Preparar mostra exatamente o que roda; confirmar pede a sua sessão do Cadastro Único.');
      const preparar = el('button', 'acao-preparar', 'Preparar');
      preparar.type = 'button';
      const detalhe = el('div', 'acao-detalhe');
      detalhe.hidden = true;
      const estado = el('p', 'acao-estado');
      estado.hidden = true;
      const saida = el('pre', 'acao-saida');
      saida.hidden = true;
      cartao.append(titulo, nota, preparar, detalhe, estado, saida);

      const avisar = (texto, classe = '') => { estado.hidden = false; estado.className = `acao-estado ${classe}`.trim(); estado.textContent = texto; };
      const recusa = ({ status, dados }) => {
        const msg = dados?.erro || `HTTP ${status}`;
        avisar(status === 401 || status === 403 ? `${msg}. ${SEM_SESSAO}` : msg, 'acao-erro');
      };

      preparar.addEventListener('click', async () => {
        preparar.disabled = true;
        avisar('preparando…');
        let r;
        try { r = await postar('/api/acoes/preparar', { propostaId: proposta.id }); }
        catch { preparar.disabled = false; avisar('o painel não respondeu', 'acao-erro'); return; }
        if (!r.ok) { preparar.disabled = false; recusa(r); return; }
        estado.hidden = true;
        preparar.hidden = true;
        const d = r.dados;
        const lista = el('dl', 'acao-lista');
        linhaDetalhe(lista, 'projeto', d.projeto);
        linhaDetalhe(lista, 'pasta', d.pasta);
        linhaDetalhe(lista, 'comando', d.executavel);
        linhaDetalhe(lista, 'argumentos', (d.argumentos ?? []).join(' ') || '(nenhum)');
        const confirmar = el('button', 'acao-confirmar', 'Confirmar e rodar');
        confirmar.type = 'button';
        detalhe.replaceChildren(lista, el('p', 'acao-nota', d.aviso ?? ''), confirmar);
        detalhe.hidden = false;
        confirmar.addEventListener('click', async () => {
          confirmar.disabled = true;
          avisar('rodando… (a suíte pode levar minutos)');
          let c;
          try { c = await postar('/api/acoes/confirmar', { confirmacaoId: d.confirmacaoId }); }
          catch { avisar('o painel não respondeu; confira o diário de ações antes de repetir', 'acao-erro'); return; }
          if (!c.ok) { recusa(c); return; }
          const x = c.dados;
          const segundos = Math.round((x.duracaoMs ?? 0) / 100) / 10;
          const fim = x.expirou ? 'tempo esgotado' : `código de saída ${x.codigo ?? x.sinal ?? '?'}`;
          avisar(`${fim} · ${segundos} s${x.truncada ? ' · saída truncada' : ''}${x.aviso ? ` · ${x.aviso}` : ''}`, x.codigo === 0 ? 'acao-ok' : 'acao-erro');
          saida.textContent = x.saida || '(sem saída)';
          saida.hidden = false;
        });
      });
      return cartao;
    }
  }

  globalThis.CartaoAcao = CartaoAcao;
})();
