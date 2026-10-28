// Compõe o desenho da aba Contas. A aba chama estes nomes.

class DesenhoContas {
  static botao(...args) { return PecasContas.botao(...args); }

  static secao(...args) { return PecasContas.secao(...args); }

  static usuario(painel, u) { return UsuarioContas.linha(painel, u); }

  static convite(painel, c) { return ConviteContas.linha(painel, c); }

  static formulario(painel) { return ConviteContas.formulario(painel); }

  static resultado(c) { return ConviteContas.resultado(c); }
}

globalThis.DesenhoContas = DesenhoContas;
