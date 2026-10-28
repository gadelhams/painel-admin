// Hash é a fonte da view. Contas, chaves, docs e orquestração só buscam ao entrar.

const paineis = {
  projetos: document.getElementById('aba-projetos'),
  backlog: document.getElementById('aba-backlog'),
  decisoes: document.getElementById('aba-decisoes'),
  orquestracao: document.getElementById('aba-orquestracao'),
  contas: document.getElementById('aba-contas'),
  chaves: document.getElementById('aba-chaves'),
  docs: document.getElementById('aba-docs'),
};

function mostrarView(nome) {
  const naLinha = document.getElementById('ligar')?.classList.contains('na-linha');
  if (nome === 'projetos') recolherConsoleNoPalco();
  else if (naLinha) posicionarConsoleOverlay();
  viewAtual = nome;
  for (const [chave, painel] of Object.entries(paineis)) painel.hidden = chave !== nome;
  for (const botao of document.querySelectorAll('.aba')) botao.classList.toggle('ativa', botao.dataset.aba === nome);
}

for (const botao of document.querySelectorAll('.aba')) {
  botao.addEventListener('click', () => { location.hash = `#/${botao.dataset.aba}`; });
}

function selecionarProjeto(pasta) {
  projetoSelecionado = pasta;
  desenharTiraTelemetria();
  abrirProjeto(pasta);
  if (window.desenharBacklogDoProjeto) desenharBacklogDoProjeto(pasta);
}

function rotear() {
  if (!projetoSelecionado && dadosProjetos.length) selecionarProjeto(dadosProjetos[0].pasta);

  const [, view, param] = location.hash.slice(1).split('/');
  if (view === 'projeto' && param) {
    mostrarView('projetos');
    const [soPasta, consulta] = param.split('?');
    const pasta = decodeURIComponent(soPasta);
    window.abrirDocPedido = consulta ? new URLSearchParams(consulta).get('arquivo') : null;
    if (pasta !== projetoSelecionado) selecionarProjeto(pasta);
    else if (window.abrirDocPedido && window.abrirDocPedidoAgora) window.abrirDocPedidoAgora();
  } else if (view === 'backlog' || view === 'decisoes') {
    mostrarView(view);
    if (view === 'decisoes' && window.desenharDecisoes) desenharDecisoes();
  } else if (view === 'contas') {
    const entrando = viewAtual !== 'contas';
    mostrarView('contas');
    if (entrando && window.carregarContas) carregarContas();
  } else if (view === 'chaves') {
    const entrando = viewAtual !== 'chaves';
    mostrarView('chaves');
    if (entrando && window.carregarChaves) window.carregarChaves();
  } else if (view === 'docs') {
    const entrando = viewAtual !== 'docs';
    mostrarView('docs');
    if (entrando && window.carregarDocs) window.carregarDocs();
  } else if (view === 'orquestracao') {
    const entrando = viewAtual !== 'orquestracao';
    mostrarView('orquestracao');
    if (entrando && window.carregarOrquestracao) window.carregarOrquestracao();
  } else {
    mostrarView('projetos');
  }
}

window.addEventListener('hashchange', rotear);
