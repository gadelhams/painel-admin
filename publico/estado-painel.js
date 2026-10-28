// Estado compartilhado das abas. Projetos e Backlog leem o mesmo projeto em foco.

let modoFiltroTag = 'todos';
let dadosProjetos = [];
let dadosDecisoes = [];
let dadosProducao = [];
let projetoSelecionado = null;
let decisoesDisponiveis = false;
let viewAtual = null;
let ultimaAtualizacao = Date.now();

function elToggleFiltro(aoMudar) {
  const par = el('div', { class: 'par-toggle-filtro' });
  const desenhar = () => {
    par.replaceChildren(
      el('button', { type: 'button', class: `toggle-filtro${modoFiltroTag === 'todos' ? ' ativa' : ''}` }, 'todas'),
      el('button', { type: 'button', class: `toggle-filtro${modoFiltroTag === 'aberto' ? ' ativa' : ''}` }, 'abertas'),
    );
    par.children[0].addEventListener('click', () => { modoFiltroTag = 'todos'; desenhar(); atualizarPlacarCabecalho(); desenharTiraTelemetria(); aoMudar(); });
    par.children[1].addEventListener('click', () => { modoFiltroTag = 'aberto'; desenhar(); atualizarPlacarCabecalho(); desenharTiraTelemetria(); aoMudar(); });
  };
  desenhar();
  return par;
}

function decisaoVisivel(d) {
  return modoFiltroTag === 'todos' || d.estado !== 'pronto';
}

function tempoRelativo(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

function decisoesDoProjeto(pasta) {
  return dadosDecisoes.filter((d) => d.projeto === pasta);
}
