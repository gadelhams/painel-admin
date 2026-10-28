// Estado da aba Contas. O pedido mora em contas-pedido.js; o desenho, em contas-desenho.js.

class PainelContas {
  constructor(raiz) {
    this.raiz = raiz;
    this.apps = [];
    this.usuarios = [];
    this.convites = [];
    this.usuarioEditando = null;
    this.acaoEmCurso = false;
    this.ultimoConvite = null;
    this.status = null;
  }

  async carregar() {
    this.status = { tipo: 'andamento', texto: 'buscando no servidor via ssh…' };
    this.desenhar();
    try {
      const [apps, usuarios, convites] = await Promise.all([
        PedidoContas.pedir('GET', '/api/contas/apps'),
        PedidoContas.pedir('GET', '/api/contas/usuarios'),
        PedidoContas.pedir('GET', '/api/contas/convites'),
      ]);
      const falha = [apps, usuarios, convites].find((r) => !r.ok);
      if (falha) {
        this.status = { tipo: 'erro', texto: `não consegui carregar as contas: ${PedidoContas.erro(falha)}` };
        this.desenhar();
        return false;
      }
      this.apps = (apps.dados.apps ?? []).filter((a) => a.sso);
      this.usuarios = usuarios.dados.usuarios ?? [];
      this.convites = convites.dados.convites ?? [];
      this.status = { tipo: 'ok', texto: `atualizado ${new Date().toLocaleTimeString('pt-BR')}` };
    } catch (erro) {
      this.status = { tipo: 'erro', texto: `não consegui carregar as contas: ${erro.message}` };
      this.desenhar();
      return false;
    }
    this.desenhar();
    return true;
  }

  async executar(descricao, metodo, caminho, corpo) {
    if (this.acaoEmCurso) return null;
    this.acaoEmCurso = true;
    this.status = { tipo: 'andamento', texto: `${descricao}… (ssh até o servidor)` };
    this.desenhar();
    let r;
    try {
      r = await PedidoContas.pedir(metodo, caminho, corpo);
    } catch (erro) {
      r = { ok: false, status: 0, dados: { erro: erro.message } };
    }
    if (!r.ok) {
      this.acaoEmCurso = false;
      this.status = { tipo: 'erro', texto: `${descricao}: ${PedidoContas.erro(r)}` };
      this.desenhar();
      return r;
    }
    const recarregou = await this.carregar();
    this.acaoEmCurso = false;
    if (recarregou) this.status = { tipo: 'ok', texto: `${descricao}: feito` };
    else this.status = { tipo: 'erro', texto: `${descricao}: feito, mas ${this.status.texto} — a lista pode estar velha` };
    this.desenhar();
    return r;
  }

  desenhar() {
    const recarregar = DesenhoContas.botao(this, 'recarregar', () => this.carregar());
    if (this.status?.tipo === 'andamento') recarregar.disabled = true;
    const cabecalho = el(
      'div',
      { class: 'decisoes-cabecalho' },
      el(
        'div',
        {},
        el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 05 / ACESSO'),
        el('h2', { class: 'titulo-secao' }, 'Contas'),
        el('p', { class: 'kicker' }, 'cadastro único do astargne.com · cada ação roda no servidor por ssh · o token nunca sai de lá'),
      ),
      el('div', { class: 'contas-cab-direita' }, this.status ? el('span', { class: `contas-status ${this.status.tipo}` }, this.status.texto) : '', recarregar),
    );
    const carregou = this.apps.length > 0 || this.usuarios.length > 0;
    if (!carregou && this.status?.tipo !== 'ok') {
      this.raiz.replaceChildren(cabecalho, el('p', { class: 'discreto' }, this.status?.tipo === 'erro' ? 'sem dado — veja o erro acima e tente "recarregar".' : 'carregando…'));
      return;
    }
    const ativos = this.usuarios.filter((u) => u.ativo).length;
    const principal = el(
      'div',
      { class: 'contas-principal' },
      DesenhoContas.secao(`Usuários · ${ativos} ativos`, this.usuarios.length, this.usuarios.map((u) => DesenhoContas.usuario(this, u)), 'nenhum usuário cadastrado.'),
      DesenhoContas.secao('Convites pendentes', this.convites.length, this.convites.map((c) => DesenhoContas.convite(this, c)), 'nenhum convite pendente.'),
    );
    const lateral = el('div', { class: 'contas-lateral' }, DesenhoContas.formulario(this), DesenhoContas.resultado(this.ultimoConvite) ?? '');
    this.raiz.replaceChildren(cabecalho, el('div', { class: 'grid-contas' }, principal, lateral));
  }
}

const painelContas = new PainelContas(document.getElementById('aba-contas'));
window.carregarContas = () => painelContas.carregar();
