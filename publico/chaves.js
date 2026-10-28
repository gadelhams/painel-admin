// Aba Chaves: o estado da tela. O pedido mora em chaves-pedido.js e o desenho em chaves-desenho.js.

class PainelChaves {
  constructor() {
    this.aba = document.getElementById('aba-chaves');
    this.dados = null;
    this.status = null;
    this.preparo = null;
    this.desenho = new DesenhoChaves(this);
  }

  async carregar({ servidor = false } = {}) {
    this.status = { tipo: 'andamento', texto: servidor ? 'lendo o servidor por ssh (só nomes)…' : 'lendo os .env desta máquina (só nomes)…' };
    this.desenho.desenhar();
    const r = await PedidoChaves.pedir('GET', servidor ? '/api/chaves/servidor' : '/api/chaves').catch(e => ({ ok: false, status: 0, dados: { erro: e.message } }));
    if (r.ok) { this.dados = r.dados; this.status = null; }
    else this.status = { tipo: 'erro', texto: r.dados?.erro ? `${r.dados.erro} (HTTP ${r.status})` : `falha HTTP ${r.status}` };
    this.desenho.desenhar();
    const selo = document.getElementById('selo-chaves');
    if (selo) selo.textContent = this.dados ? String(this.dados.pendentes.length) : '—';
  }
}

const painelChaves = new PainelChaves();
window.carregarChaves = (opcoes) => painelChaves.carregar(opcoes);
