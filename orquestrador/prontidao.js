// Os dois julgamentos da carta. Quem importa daqui recebe as mesmas funções.

import { ProntidaoGate } from './prontidao-gate.js';
import { ProntidaoDespacho } from './prontidao-despacho.js';

const gate = new ProntidaoGate();
const despacho = new ProntidaoDespacho();

export function avaliarProntidaoGate(carta, opcoes) {
  return gate.avaliar(carta, opcoes);
}

export function avaliarCarta(carta, opcoes) {
  return despacho.avaliar(carta, opcoes);
}
