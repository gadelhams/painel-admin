// Número de decisões no cabeçalho e no selo.

function atualizarPlacarCabecalho() {
  const texto = decisoesDisponiveis ? String(dadosDecisoes.filter(decisaoVisivel).length) : '—';
  document.getElementById('placar-decisoes').textContent = texto;
  document.getElementById('selo-decisoes').textContent = texto;
}
