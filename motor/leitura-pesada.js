// Leituras que varrem o Plane inteiro (fila, triagem, decisões: 15–35 s cada) para as ferramentas do C-3PO.
//
// O C-3PO costuma chamar as três juntas; em paralelo, o Plane fica lento e alguma
// chamada passa do prazo de 15 s do cliente ("aborted due to timeout"). Aqui elas
// rodam uma de cada vez, a mesma leitura em curso é compartilhada, e o resultado
// vale `validadeMs`. Falha não fica guardada: a próxima pergunta tenta de novo.
export class LeituraPesada {
  constructor({ validadeMs = 120_000, agora = Date.now } = {}) {
    this.validadeMs = validadeMs;
    this.agora = agora;
    this.guardadas = new Map(); // chave → { em, valor }
    this.emCurso = new Map(); // chave → promessa
    this.fila = Promise.resolve();
  }

  ler(chave, coletor) {
    const g = this.guardadas.get(chave);
    if (g && this.agora() - g.em < this.validadeMs) return Promise.resolve(g.valor);
    if (this.emCurso.has(chave)) return this.emCurso.get(chave);
    const vez = this.fila.then(async () => {
      const valor = await coletor();
      this.guardadas.set(chave, { em: this.agora(), valor });
      return valor;
    }).finally(() => this.emCurso.delete(chave));
    this.emCurso.set(chave, vez);
    this.fila = vez.catch(() => {});
    return vez;
  }
}
