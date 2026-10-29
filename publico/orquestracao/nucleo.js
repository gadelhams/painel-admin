// Estado e HTTP da aba Orquestração. Não desenha tela e não decide portão.

class NucleoOrquestracao {
  constructor() {
    this.estado = {
      fila: null, triagem: null, carta: null, topico: 'demanda', frota: null,
      confirmacaoFrota: null, confirmacaoHandoff: null, confirmacaoGate: null,
      confirmacaoDespacho: null, gravacao: null, transcricao: null, ultimoResultado: null, abortos: {},
    };
  }

  $(id) {
    return document.getElementById(id);
  }

  criar(tag, texto = '', classe = '') {
    const no = document.createElement(tag);
    no.textContent = texto;
    if (classe) no.className = classe;
    return no;
  }

  sinal(nome) {
    this.estado.abortos[nome]?.abort();
    this.estado.abortos[nome] = new AbortController();
    return this.estado.abortos[nome].signal;
  }

  abortado(erro) {
    return erro?.name === 'AbortError';
  }

  async json(url, opcoes) {
    const resposta = await fetch(url, opcoes);
    const dados = await resposta.json();
    if (!resposta.ok) {
      const erro = new Error(dados.erro ?? `HTTP ${resposta.status}`);
      erro.status = resposta.status;
      throw erro;
    }
    return dados;
  }

  mensagem(id, texto) {
    this.$(id).replaceChildren(this.criar('p', texto, 'orq-ajuda'));
  }

  // Os limites são os de validarHandoff/validarPropostaGate no servidor.
  limitesDeTexto(resumo, evidencias, nome) {
    if (resumo.trim().length < 10 || resumo.length > 2000) return `${nome[0].toUpperCase()}${nome.slice(1)} precisa de 10 a 2000 caracteres.`;
    if (!evidencias.length || evidencias.length > 10) return 'Informe de 1 a 10 evidências, uma por linha.';
    if (evidencias.some(x => x.length < 5 || x.length > 500)) return 'Cada evidência precisa de 5 a 500 caracteres.';
    return null;
  }
}

globalThis.NucleoOrquestracao = NucleoOrquestracao;
