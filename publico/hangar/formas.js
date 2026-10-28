// Formas das peças da nave (polígonos vistos de cima, nariz para +x) e a escolha da forma de cada módulo. Não desenha.

import { dentro } from './util.js';

// As seis primeiras são o corpo da nave; as seis seguintes, acessórios; do
// 13º módulo em diante (o CKBL tem 17) viram contêineres empilhados no dorso.
// Nenhum projeto agrupa módulos: cada módulo do Plane continua sendo uma peça.
const BASE = {
  casco: { nome: 'Casco', h: 3, ordem: 'x', polys: [[[-6, -2.5], [-5, -3], [5, -3], [5, 3], [-5, 3], [-6, 2.5]]] },
  motor: { nome: 'Motor', h: 2, ordem: 'x', polys: [[[-10, -2.5], [-6, -2.5], [-6, 2.5], [-10, 2.5]]] },
  asaE: { nome: 'Asa de bombordo', h: 1, ordem: 'y', polys: [[[-4, -3], [3, -3], [0, -10], [-5, -10]]] },
  asaD: { nome: 'Asa de estibordo', h: 1, ordem: 'y', polys: [[[-4, 3], [3, 3], [0, 10], [-5, 10]]] },
  cabine: { nome: 'Cabine', h: 2, ordem: 'x', polys: [[[5, -2.4], [9, -1.4], [12.5, 0], [9, 1.4], [5, 2.4]]] },
  canhao: { nome: 'Canhões', h: 1, ordem: 'x', polys: [[[2, -7], [9, -7], [9, -6], [2, -6]], [[2, 6], [9, 6], [9, 7], [2, 7]]] },
  aletas: { nome: 'Aletas traseiras', h: 2, ordem: 'x', polys: [[[-10, -6], [-7, -6], [-7, -3], [-10, -3]], [[-10, 3], [-7, 3], [-7, 6], [-10, 6]]] },
  torre: { nome: 'Torre dorsal', h: 1.6, y0: 3, ordem: 'x', polys: [[[-2, -1], [2, -1], [2, 1], [-2, 1]]] },
  pods: { nome: 'Pods das asas', h: 1.4, ordem: 'x', polys: [[[-5, -12], [0, -12], [0, -10], [-5, -10]], [[-5, 10], [0, 10], [0, 12], [-5, 12]]] },
  esporao: { nome: 'Esporão', h: 1, y0: 0.5, ordem: 'x', polys: [[[12, -1], [15, -1], [15, 1], [12, 1]]] },
  sensores: { nome: 'Domo de sensores', h: 1, y0: 2, ordem: 'x', polys: [[[6, -1], [9, -1], [9, 1], [6, 1]]] },
  torretas: { nome: 'Torretas das asas', h: 1, y0: 1, ordem: 'x', polys: [[[-3, -8], [1, -8], [1, -7], [-3, -7]], [[-3, 7], [1, 7], [1, 8], [-3, 8]]] },
};
const ORDEM = Object.keys(BASE);
const VAGAS_CARGA = [[-6, -3, -4, -1], [-6, 1, -4, 3], [-4, -3, -2, -1], [-4, 1, -2, 3], [3, -3, 5, -1], [3, 1, 5, 3], [-6, -1, -4, 1], [3, -1, 5, 1]];

function celulas(f) {
  const pts = f.polys.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cells = [];
  for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
      if (f.polys.some((p) => dentro(x + 0.5, y + 0.5, p))) cells.push({ x, y });
    }
  }
  cells.sort(f.ordem === 'y'
    ? (a, b) => (Math.abs(a.y) - Math.abs(b.y)) || (a.x - b.x)
    : (a, b) => (a.x - b.x) || (Math.abs(a.y) - Math.abs(b.y)));
  return {
    ...f,
    y0: f.y0 ?? 0,
    cells,
    centro: { x: cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length, y: cells.reduce((s, c) => s + c.y + 0.5, 0) / cells.length },
  };
}

const cache = new Map();
export function formaDe(indice) {
  if (cache.has(indice)) return cache.get(indice);
  let f;
  if (indice < ORDEM.length) f = celulas({ chave: ORDEM[indice], ...BASE[ORDEM[indice]] });
  else {
    const k = indice - ORDEM.length;
    const [x0, y0, x1, y1] = VAGAS_CARGA[k % VAGAS_CARGA.length];
    f = celulas({ chave: `carga${k}`, nome: `Contêiner ${k + 1}`, h: 1.1, y0: 3 + Math.floor(k / VAGAS_CARGA.length) * 1.2, ordem: 'x', polys: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]] });
  }
  cache.set(indice, f);
  return f;
}
