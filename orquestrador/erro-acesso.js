// Erro das ações privilegiadas. Não decide quem entra.

export class ErroAcesso extends Error {
  constructor(mensagem, status) { super(mensagem); this.status = status; }
}
