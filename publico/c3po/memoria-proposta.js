// Cartão "Memória proposta" do chat do C-3PO e o passo comum preparar → confirmar da memória L1. Não propõe nem grava sozinho: confirmar pede a sessão do dono.
//
// Usado pelo /c3po/ (que também abre o painel da memória), pelo console do painel e pelo
// popup do Hangar (que o importa como módulo). Todo texto entra por textContent: motivo,
// diff e erro vêm de fora.

(() => {
  const SEM_SESSAO = 'Sem a sessão do dono no Cadastro Único nada é gravado; entre em https://astargne.com e volte a esta aba.';

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

  const mensagemDeRecusa = ({ status, dados }) => {
    const msg = dados?.erro || `HTTP ${status}`;
    return status === 401 || status === 403 ? `${msg}. ${SEM_SESSAO}` : msg;
  };

  // Diff unificado com uma linha por <span>, para o CSS colorir "+" e "-".
  function diffEm(pre, texto) {
    pre.replaceChildren(...String(texto || '(sem diferença)').split('\n').map((linha) => {
      const s = el('span', linha.startsWith('+') ? 'mem-mais' : linha.startsWith('-') ? 'mem-menos' : linha.startsWith('@@') ? 'mem-bloco' : null, `${linha}\n`);
      return s;
    }));
  }

  // Prepara {base, origem, valor}; mostra o diff e um botão de confirmar dentro de `alvo`.
  // `aoGravar` recebe o resultado da confirmação.
  async function prepararEConfirmar({ alvo, estado, corpo, aoGravar }) {
    const avisar = (texto, classe = '') => { estado.hidden = false; estado.className = `mem-estado ${classe}`.trim(); estado.textContent = texto; };
    avisar('preparando…');
    let r;
    try { r = await postar('/api/c3po/memoria/preparar', corpo); }
    catch { avisar('o painel não respondeu', 'mem-erro'); return false; }
    if (!r.ok) { avisar(mensagemDeRecusa(r), 'mem-erro'); return false; }
    const d = r.dados;
    estado.hidden = true;
    const pre = el('pre', 'mem-diff');
    diffEm(pre, d.diff);
    const confirmar = el('button', 'mem-confirmar', 'Confirmar e gravar');
    confirmar.type = 'button';
    alvo.replaceChildren(el('p', 'mem-nota', `${d.linhasAcrescentadas} linha(s) entram, ${d.linhasRemovidas} saem · ${d.bytes}/${d.teto} bytes`), pre,
      el('p', 'mem-nota', d.aviso ?? ''), confirmar);
    alvo.hidden = false;
    confirmar.addEventListener('click', async () => {
      confirmar.disabled = true;
      avisar('gravando…');
      let c;
      try { c = await postar('/api/c3po/memoria/confirmar', { confirmacaoId: d.confirmacaoId }); }
      catch { avisar('o painel não respondeu; confira o histórico da memória antes de repetir', 'mem-erro'); return; }
      if (!c.ok) { avisar(mensagemDeRecusa(c), 'mem-erro'); return; }
      alvo.hidden = true;
      avisar(`memória gravada (versão ${String(c.dados.hash).slice(0, 12)})`, 'mem-ok');
      aoGravar?.(c.dados);
    });
    return true;
  }

  class CartaoMemoria {
    static criar(proposta) {
      const cartao = el('div', 'acao-cartao mem-cartao');
      cartao.dataset.propostaMemoria = proposta.id;
      const titulo = el('p', 'acao-titulo', 'Memória proposta: ');
      titulo.append(el('span', null, proposta.motivo));
      const pre = el('pre', 'mem-diff');
      diffEm(pre, proposta.diff);
      const nota = el('p', 'acao-nota', 'O C-3PO só propõe. Preparar confere o diff contra a memória de agora; confirmar pede a sua sessão do Cadastro Único.');
      const preparar = el('button', 'acao-preparar', 'Preparar');
      preparar.type = 'button';
      const detalhe = el('div', 'mem-detalhe');
      detalhe.hidden = true;
      const estado = el('p', 'mem-estado');
      estado.hidden = true;
      cartao.append(titulo, pre, nota, preparar, detalhe, estado);
      preparar.addEventListener('click', async () => {
        preparar.disabled = true;
        const ok = await prepararEConfirmar({ alvo: detalhe, estado, corpo: { base: proposta.base, origem: 'proposta', valor: proposta.id },
          aoGravar: () => globalThis.dispatchEvent(new CustomEvent('memoria-c3po-gravada')) });
        if (ok) preparar.hidden = true; else preparar.disabled = false;
      });
      return cartao;
    }
  }

  globalThis.CartaoMemoria = CartaoMemoria;
  globalThis.MemoriaC3po = { el, diffEm, prepararEConfirmar };
})();
