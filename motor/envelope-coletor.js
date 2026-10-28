// Embrulha a falha de um coletor interno. Não escolhe a ferramenta.

export class EnvelopeColetor {
  async consultar(nome, coletor) {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await coletor()) }] };
    } catch (erro) {
      return {
        content: [{
          type: 'text',
          text: `COLETA FALHOU: o coletor interno ${nome} deu erro (${erro.message}). Sem ele não há dado vivo dessa visão — diga isso ao usuário em vez de estimar.`,
        }],
        isError: true,
      };
    }
  }
}
