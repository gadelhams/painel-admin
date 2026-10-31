// Valida o pedido de nave nova (nome, sigla opcional, módulos) e devolve a forma normalizada; não lê arquivo nem grava nada.
//
// O texto do usuário é guardado como veio (aparado) e só vira HTML pelo `esc()` do front;
// por isso aqui se recusa caractere de controle (quebra de linha no nome viraria outra
// linha no pedido) em vez de tentar limpar marcação. A mensagem de recusa nunca ecoa o
// texto livre: diz o campo e a posição.

export const LIMITES = Object.freeze({ nome: 60, modulos: 20, modulo: 80 });
const SIGLA = /^[A-Z]{2,6}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;

export class RecusaEncomenda extends Error {}

function texto(valor, campo, teto) {
  if (typeof valor !== 'string') throw new RecusaEncomenda(`${campo}: precisa ser texto`);
  const t = valor.trim();
  if (!t) throw new RecusaEncomenda(`${campo}: vazio`);
  if (t.length > teto) throw new RecusaEncomenda(`${campo}: passa de ${teto} caracteres`);
  if (CONTROLE.test(t)) throw new RecusaEncomenda(`${campo}: caractere de controle não é aceito`);
  return t;
}

// `siglasOcupadas`: Map sigla → onde já está (projeto do catálogo ou encomenda pendente).
export function validarPedido({ nome, sigla, modulos }, { siglasOcupadas = new Map() } = {}) {
  const n = texto(nome, 'nome', LIMITES.nome);
  let s = null;
  if (sigla !== null && sigla !== undefined && sigla !== '') {
    if (typeof sigla !== 'string' || !SIGLA.test(sigla)) throw new RecusaEncomenda('sigla: de 2 a 6 letras maiúsculas, sem acento nem número');
    if (siglasOcupadas.has(sigla)) throw new RecusaEncomenda(`sigla ${sigla} já é ${siglasOcupadas.get(sigla)}`);
    s = sigla;
  }
  if (!Array.isArray(modulos) || !modulos.length) throw new RecusaEncomenda('módulos: escreva pelo menos um');
  if (modulos.length > LIMITES.modulos) throw new RecusaEncomenda(`módulos: no máximo ${LIMITES.modulos}`);
  const ms = modulos.map((m, i) => texto(m, `módulo ${i + 1}`, LIMITES.modulo));
  const vistos = new Set();
  ms.forEach((m, i) => {
    const chave = m.toLocaleLowerCase('pt-BR');
    if (vistos.has(chave)) throw new RecusaEncomenda(`módulo ${i + 1}: repetido`);
    vistos.add(chave);
  });
  return { nome: n, sigla: s, modulos: ms };
}
