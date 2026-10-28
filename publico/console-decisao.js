// Abre uma decisão parada e manda o contexto. Não conta o digest do dia.

function abrirConsoleComDecisao(decisao) {
  document.getElementById('console-kicker').textContent = 'decisão parada · lida do working tree';
  ConsolePalco.chips(['o que isso trava', 'o que você precisa de mim', 'outra decisão deste projeto']);
  abrirConsole();
  const contexto = `${decisao.projeto} · ${decisao.arquivo} · ${decisao.feature} · tag ${decisao.tag}${decisao.detalhe ? ` (${decisao.detalhe})` : ''}`;
  window.mandarMensagemC3po?.(
    `Decisão parada — ${contexto}:\n"${decisao.texto}"\n\nO que isso trava, e o que você precisa de mim pra destravar? Não decida por mim, só explique e pergunte.`,
  );
}
