// Hash é a fonte da view. Hangar (a entrada desde 28/10/2026), contas, chaves, docs e orquestração só buscam ao entrar.

const paineis = {
  hangar: document.getElementById('aba-hangar'),
  projetos: document.getElementById('aba-projetos'),
  backlog: document.getElementById('aba-backlog'),
  decisoes: document.getElementById('aba-decisoes'),
  orquestracao: document.getElementById('aba-orquestracao'),
  contas: document.getElementById('aba-contas'),
  chaves: document.getElementById('aba-chaves'),
  docs: document.getElementById('aba-docs'),
};

// O Hangar é módulo ES (publico/hangar/) e pode chegar depois deste script clássico.
function hangarAgora(acao) {
  if (window.hangar) window.hangar[acao]();
  else if (acao === 'entrar') window.addEventListener('hangar-pronto', () => { if (viewAtual === 'hangar') window.hangar.entrar(); }, { once: true });
}

function mostrarView(nome) {
  const naLinha = document.getElementById('ligar')?.classList.contains('na-linha');
  if (nome === 'projetos') recolherConsoleNoPalco();
  else if (naLinha) posicionarConsoleOverlay();
  const entrandoNoHangar = nome === 'hangar' && viewAtual !== 'hangar';
  if (viewAtual === 'hangar' && nome !== 'hangar') hangarAgora('sair');
  viewAtual = nome;
  document.body.classList.toggle('hg-ativo', nome === 'hangar');
  for (const [chave, painel] of Object.entries(paineis)) painel.hidden = chave !== nome;
  for (const botao of document.querySelectorAll('.aba')) botao.classList.toggle('ativa', botao.dataset.aba === nome);
  if (entrandoNoHangar) hangarAgora('entrar');
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
  } else if (view === 'projetos') {
    mostrarView('projetos');
  } else {
    mostrarView('hangar');
  }
}

window.addEventListener('hashchange', rotear);

// O Hangar não depende das quatro fontes de carga.js (o Plane frio leva ~16 s): abre já.
if (['', 'hangar'].includes(location.hash.slice(1).split('/')[1] ?? '')) mostrarView('hangar');
