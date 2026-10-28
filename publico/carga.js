// Busca as quatro fontes e só então redesenha. O intervalo mora em projeto.js.

async function carregarProjetos() {
  const resposta = await fetch('/api/projetos');
  const { projetos } = await resposta.json();
  dadosProjetos = projetos;
}

async function carregarDecisoes() {
  try {
    const resposta = await fetch('/api/decisoes');
    if (!resposta.ok) throw new Error('rota indisponível');
    const { decisoes } = await resposta.json();
    dadosDecisoes = decisoes;
    decisoesDisponiveis = true;
  } catch {
    dadosDecisoes = [];
    decisoesDisponiveis = false;
  }
}

async function carregarProducao() {
  const resposta = await fetch('/api/producao');
  const { sondas } = await resposta.json();
  dadosProducao = sondas;
}

async function atualizarTudo() {
  await Promise.all([carregarProjetos(), carregarProducao(), carregarBacklog(), carregarDecisoes()]);
  atualizarPlacarCabecalho();
  ultimaAtualizacao = Date.now();
  rotear();
}
