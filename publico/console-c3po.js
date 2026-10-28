// Carta da orquestração: preenche a entrada e não envia.

window.abrirConsoleOrquestracao = function abrirConsoleOrquestracao(identificador) {
  const carta = typeof identificador === 'string' && /^[A-Z][A-Z0-9]*-\d+$/i.test(identificador)
    ? identificador.toUpperCase() : null;
  document.getElementById('console-kicker').textContent = carta ? `Orquestração · ${carta} · leitura do Plane` : 'Orquestração · leitura do Plane';
  ConsolePalco.chips(carta
    ? [`O que falta para ${carta} ficar READY TO DEV?`, `Quais pendências de ${carta} são decisões de produto?`, `Quais passos técnicos destravam ${carta}?`]
    : ['quais categorias de pendências se repetem?', 'quais cartas estão impedidas?', 'o que depende de decisão de produto?']);
  abrirConsole();
  const entrada = document.getElementById('entrada');
  if (carta && entrada && !entrada.value.trim()) entrada.value = `O que falta para ${carta} ficar READY TO DEV? Separe pendências técnicas, autorizações e decisões de produto, com evidências do Plane e dos documentos do projeto.`;
};

document.getElementById('abrir-console').addEventListener('click', abrirConsoleDigest);
document.getElementById('console-fechar').addEventListener('click', fecharConsole);
document.getElementById('console-scrim').addEventListener('click', (e) => { if (e.target === document.getElementById('console-scrim')) fecharConsole(); });

document.addEventListener('keydown', (e) => {
  const scrim = document.getElementById('console-scrim');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    abrirConsoleDigest();
  } else if (e.key === 'Escape' && !scrim.hidden) {
    fecharConsole();
  }
});
