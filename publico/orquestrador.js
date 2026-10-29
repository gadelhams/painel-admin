// Liga as vistas da aba. Cada assunto mora no próprio arquivo.
class PainelOrquestracao {
  constructor() {
    this.n = new NucleoOrquestracao();
    this.fila = new FilaOrquestracao(this);
    this.despacho = new DespachoOrquestracao(this);
    this.gates = new GateOrquestracao(this);
    this.conversa = new ConversaOrquestracao(this);
    this.modelos = new ModelosOrquestracao(this);
    this.vigilia = new VigiliaOrquestracao(this);
    this.consumo = new ConsumoOrquestracao(this);
    this.voz = new VozCartaOrquestracao(this);
  }

  mostrarTopico(nome) {
    this.n.estado.topico = nome;
    for (const botao of document.querySelectorAll('[data-orq-topico]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.orqTopico === nome));
    }
    for (const secao of document.querySelectorAll('.orq-topico')) secao.hidden = secao.id !== `orq-topico-${nome}`;
    if (nome === 'conversa') this.conversa.carregar();
    if (nome === 'modelos') this.modelos.carregar();
    if (nome === 'consumo') this.consumo.carregar();
    if (nome === 'vigilia') this.vigilia.carregar();
  }

  iniciar() {
    const $ = id => this.n.$(id);
    for (const botao of document.querySelectorAll('[data-orq-topico]')) botao.addEventListener('click', () => this.mostrarTopico(botao.dataset.orqTopico));
    for (const id of ['orq-projeto', 'orq-filtro', 'orq-busca']) $(id).addEventListener(id === 'orq-busca' ? 'input' : 'change', () => { if (this.n.estado.fila) this.fila.renderCartas(); });
    $('orq-categoria').addEventListener('change', () => {
      if ($('orq-categoria').value) $('orq-filtro').value = 'sem-gate';
      if (this.n.estado.fila) this.fila.renderCartas();
    });
    $('orq-triagem-carregar').addEventListener('click', () => this.fila.carregarTriagem());
    $('orq-atualizar').addEventListener('click', () => this.fila.carregar());
    $('orq-vigilia-atualizar').addEventListener('click', () => this.vigilia.carregar());
    $('orq-validar-modelos').addEventListener('click', () => this.modelos.validar());
    $('orq-preparar-modelos').addEventListener('click', () => this.modelos.preparar());
    $('orq-handoff-preparar').addEventListener('click', () => this.conversa.prepararHandoff());
    $('orq-voz-gravar').addEventListener('click', () => this.voz.alternar());
    $('orq-voz-usar').addEventListener('click', () => this.voz.usar());
    for (const id of ['orq-handoff-papel', 'orq-handoff-tentativa', 'orq-handoff-resultado', 'orq-handoff-resumo', 'orq-handoff-evidencias']) {
      $(id).addEventListener('input', () => this.conversa.limparHandoff());
    }
  }
}

(() => {
  const painel = new PainelOrquestracao();
  painel.iniciar();
  window.carregarOrquestracao = () => painel.fila.carregar();
})();
