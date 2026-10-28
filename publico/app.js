// Tema e o relógio discreto da sincronia. O resto do painel mora nos módulos ao lado.

function aplicarRotuloTema() {
  const claro = document.documentElement.getAttribute('data-tema') === 'light';
  document.getElementById('toggle-tema').textContent = claro ? 'claro' : 'escuro';
}
aplicarRotuloTema();

document.getElementById('toggle-tema').addEventListener('click', () => {
  const claro = document.documentElement.getAttribute('data-tema') === 'light';
  if (claro) {
    document.documentElement.removeAttribute('data-tema');
    localStorage.setItem('painel-tema', 'dark');
  } else {
    document.documentElement.setAttribute('data-tema', 'light');
    localStorage.setItem('painel-tema', 'light');
  }
  aplicarRotuloTema();
});

setInterval(() => {
  const seg = Math.round((Date.now() - ultimaAtualizacao) / 1000);
  document.getElementById('texto-sync').textContent = `auto · ${seg}s`;
}, 1000);

if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'dark' });
