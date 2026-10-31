// Painel "Memória do C-3PO" do /c3po/: mostra a L1, edita (preparar → confirmar com SSO), lista o histórico com desfazer e a proposta pendente da reflexão. Não grava nada sem a confirmação.

(() => {
  const { el, diffEm, prepararEConfirmar } = globalThis.MemoriaC3po;
  const $ = (id) => document.getElementById(id);
  const painel = $('memoria');
  const botao = $('abrir-memoria');
  if (!painel || !botao) return;
  let atual = null;

  const ROTULO_QUEM = { dono: 'o Mestre', reflexao: 'a reflexão noturna', 'proposta-aceita': 'proposta aceita' };
  const ROTULO_ORIGEM = { desfazer: 'desfazer', c3po: 'do C-3PO', reflexao: 'da reflexão' };

  function fluxo(corpo) {
    return prepararEConfirmar({ alvo: $('mem-confirmacao'), estado: $('mem-estado'), corpo, aoGravar: carregar });
  }

  function itemHistorico(h) {
    const li = el('li');
    const quando = new Date(h.quando).toLocaleString('pt-BR');
    const origem = h.origem && ROTULO_ORIGEM[h.origem] ? ` (${ROTULO_ORIGEM[h.origem]})` : '';
    li.append(el('span', 'mem-quem', `${quando} · ${ROTULO_QUEM[h.quem] ?? h.quem}${origem}${h.foraDoPainel ? ' · havia edição à mão antes' : ''}`));
    const detalhes = el('details');
    detalhes.append(el('summary', null, `+${h.linhasAcrescentadas ?? '?'} −${h.linhasRemovidas ?? '?'} linhas · versão ${String(h.hashDepois).slice(0, 12)}`));
    const pre = el('pre', 'mem-diff');
    diffEm(pre, h.diff);
    detalhes.append(pre);
    const desfazer = el('button', 'mem-desfazer', 'Desfazer (voltar ao texto de antes)');
    desfazer.type = 'button';
    desfazer.addEventListener('click', () => fluxo({ base: atual.hash, origem: 'versao', valor: h.hashAntes }));
    li.append(detalhes, desfazer);
    return li;
  }

  function mostrarPendente(p) {
    const caixa = $('mem-pendente');
    caixa.hidden = !p;
    if (!p) { caixa.replaceChildren(); return; }
    const pre = el('pre', 'mem-diff');
    diffEm(pre, p.diff);
    const rever = el('button', null, 'Rever e aceitar a proposta da reflexão');
    rever.type = 'button';
    rever.addEventListener('click', () => fluxo({ base: atual.hash, origem: 'reflexao', valor: p.id }));
    caixa.replaceChildren(el('h3', null, 'Proposta pendente da reflexão'), el('p', 'mem-nota', p.motivo ?? ''), pre, rever);
  }

  async function carregar() {
    let r;
    try { r = await fetch('/api/c3po/memoria', { cache: 'no-store' }); }
    catch { $('mem-resumo').textContent = 'o painel não respondeu'; return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('mem-resumo').textContent = d.erro || `HTTP ${r.status}`; return; }
    atual = d;
    const versao = d.hash ? ` · versão ${d.hash.slice(0, 12)}` : '';
    const estado = { ausente: 'vazia', ok: 'em dia', grande: 'acima do teto (editada à mão)', ilegivel: 'ilegível' }[d.estado] ?? d.estado;
    $('mem-resumo').textContent = `${estado} · ${d.bytes}/${d.teto} bytes${versao}${d.motivo ? ` · ${d.motivo}` : ''}`;
    $('mem-texto').value = d.texto ?? '';
    $('mem-confirmacao').hidden = true;
    mostrarPendente(d.pendente);
    const lista = $('mem-historico');
    lista.replaceChildren(...(d.historico ?? []).map(itemHistorico));
    if (!lista.children.length) lista.append(el('li', 'mem-nota', d.erroHistorico ? `histórico ilegível: ${d.erroHistorico}` : 'nenhuma versão gravada pelo painel ainda'));
  }

  function alternar(abrir) {
    painel.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
    if (abrir) carregar();
  }

  botao.addEventListener('click', () => alternar(painel.hidden));
  $('mem-recarregar').addEventListener('click', carregar);
  $('mem-preparar').addEventListener('click', () => {
    if (!atual) return;
    fluxo({ base: atual.hash, origem: 'texto', valor: $('mem-texto').value });
  });
  globalThis.addEventListener('memoria-c3po-gravada', () => { if (!painel.hidden) carregar(); });
  if (location.hash === '#memoria') alternar(true);
})();
