// Narrador do Hangar: fila de falas prontas do C-3PO, balão digitado e diário. Não chama LLM; conversa de verdade é em /c3po/.

import { $, calmo, esc } from './util.js';
import { H } from './estado.js';

const fila = [];
const diario = [];
let falaAtual = '';
let falaDesde = -99;
let digitadas = 0;

export function falar(texto) {
  if (fila.length < 6) fila.push(texto);
}

export function diarioAdd(texto) {
  diario.unshift({ em: new Date(), texto });
  if (diario.length > 10) diario.pop();
  $('hg-diario').innerHTML = diario.map((e) => `<li><time>${e.em.toLocaleTimeString('pt-BR')}</time><span>${esc(e.texto)}</span></li>`).join('');
}

export function tickFala(dt) {
  if (fila.length && (H.T - falaDesde > Math.max(6, falaAtual.length / 22) || (fila.length > 2 && H.T - falaDesde > 3))) {
    falaAtual = fila.shift();
    falaDesde = H.T;
    digitadas = 0;
    diarioAdd(falaAtual);
  }
  if (digitadas < falaAtual.length) {
    digitadas = calmo ? falaAtual.length : Math.min(falaAtual.length, digitadas + dt * 55);
    $('hg-fala').textContent = falaAtual.slice(0, Math.ceil(digitadas));
  }
}
