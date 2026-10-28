// Utilidades do Hangar: curvas de movimento, sorteio com semente, escape de HTML e atalhos de DOM. Sem estado.

export const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const aleatorio = (semente) => () => {
  semente = semente + 0x6D2B79F5 | 0;
  let t = Math.imul(semente ^ semente >>> 15, 1 | semente);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

export const suave = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export const bez = (a, b, c, u) => {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y, z: v * v * a.z + 2 * v * u * c.z + u * u * b.z };
};

export const pct = (p) => `${Math.floor(p * 100)}%`;
export const $ = (id) => document.getElementById(id);
export const nomeCurto = (a) => String(a ?? '').split('/').pop();

// Tudo que vem do Plane ou do disco (título de carta, nome de arquivo) passa por aqui antes de virar HTML.
const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

export const plural = (n, um, varios) => (n === 1 ? um : varios);

export function haQuanto(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `há ${s} s`;
  return `há ${Math.round(s / 60)} min`;
}

export function dentro(px, py, poly) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
