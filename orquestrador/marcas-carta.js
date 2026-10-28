// Marcas da carta que os dois julgamentos leem. Não decide gate nem despacho.

export const GATES = ['READY TO DEV', 'READY TO TEST'];
export const BLOQUEIOS = ['ASTARGNE', 'BLOQUEADA', 'CONGELADA', 'SEM ESCOPO', 'PÓS-PLAYTEST'];
export const DECISAO_HUMANA_NA_DESCRICAO = /\((ASTARGNE|DONO|BLOQUEADA)(?![\p{L}])/iu;

export class MarcasCarta {
  static nomes(carta) {
    return (carta.labels ?? []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean);
  }
}
