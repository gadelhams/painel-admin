// Aba Docs: lê a última varredura. O desenho mora em docs-desenho.js.

class PainelDocs {
  constructor() {
    this.aba = document.getElementById('aba-docs');
    this.dados = null;
    this.status = null;
    this.desenho = new DesenhoDocs(this);
  }

  async carregar({ agora = false } = {}) {
    this.status = { tipo: 'andamento', texto: agora ? 'varrendo agora (git, Plane, portões)…' : 'lendo a última varredura…' };
    this.desenho.desenhar();
    try {
      const r = await fetch(`/api/alinhamento${agora ? '?agora=1' : ''}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro ?? `HTTP ${r.status}`);
      this.dados = dados;
      this.status = null;
    } catch (erro) { this.status = { tipo: 'erro', texto: `não consegui ler o alinhamento: ${erro.message}` }; }
    this.desenho.desenhar();
  }
}

const painelDocs = new PainelDocs();
window.carregarDocs = (opcoes) => painelDocs.carregar(opcoes);
