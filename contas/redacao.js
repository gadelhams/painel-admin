// Tira bearer do texto antes do log. Não fala com o servidor.

export class RedacaoSegredo {
  redigir(texto) {
    return String(texto ?? '').replace(/Bearer\s+\S+/gi, 'Bearer ***');
  }
}

export function redigirSegredo(texto) {
  return new RedacaoSegredo().redigir(texto);
}
