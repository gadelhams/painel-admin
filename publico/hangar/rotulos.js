// Rótulos HTML sobre a cena (docas, vagas, droids, bancadas, Oficina), projetados do 3D para a tela a cada quadro. Não monta o popup.

import {
  H, BAIAS, FABRICAS, PATIO, ARQ, COR_TIPO, setor, fabrica, vagaPos, pose, ouvir,
} from './estado.js';
import { esc, pct, plural } from './util.js';
import { C, projetar } from './cena.js';

const el = { doca: new Map(), vaga: new Map(), est: new Map(), dec: new Map(), item: new Map(), droid: new Map(), livre: [], fab: new Map(), acervo: new Map() };
let raiz;
let aoClicar;

function rotulo(cls, cor, html, alvo) {
  const e = document.createElement(alvo ? 'button' : 'div');
  if (alvo) { e.type = 'button'; e.addEventListener('click', () => aoClicar(alvo)); }
  e.className = `hg-rotulo ${cls}`; e.style.setProperty('--cor', cor); e.innerHTML = html;
  raiz.appendChild(e);
  return e;
}

function rotulosNave(n) {
  for (const mapa of [el.doca, el.vaga, el.est]) { mapa.get(n.id)?.remove(); mapa.delete(n.id); }
  for (const [k, e] of el.dec) if (k.startsWith(`${n.id}:`)) { e.remove(); el.dec.delete(k); }
  el.doca.set(n.id, rotulo('hg-r-doca hg-preench', n.cor, `<span>${esc(n.nome)}</span><span class="dec"></span><span class="pct"></span>`, { tipo: 'doca', nave: n.id }));
  el.vaga.set(n.id, rotulo('hg-r-vaga hg-preench', n.cor, '', { tipo: 'vaga', nave: n.id }));
  el.est.set(n.id, rotulo('hg-r-est', '#e8b54a', 'planejamento <span></span>', { tipo: 'estacao', nave: n.id }));
  for (const x of n.chao) el.dec.set(x.id, rotulo('hg-r-dec', '#fbbf24', `decisão · ${esc(x.modulo)}${x.decisoes.length > 1 ? ` · ${x.decisoes.length}` : ''}`, { tipo: 'decisao', nave: n.id, id: x.id }));
}

function rotuloItem(n, b) {
  el.item.set(`${n.id}|${b.chave}`, rotulo(`hg-r-item ${b.tipo}`, COR_TIPO[b.tipo], esc(b.rotulo), { tipo: 'item', nave: n.id, chave: b.chave }));
}

export function iniciarRotulos(container, clicar) {
  raiz = container; aoClicar = clicar;
  for (const n of H.naves) { rotulosNave(n); for (const b of n.bancada) rotuloItem(n, b); }
  el.berco = rotulo('hg-r-berco', '#e8b54a', '+ nova nave', { tipo: 'berco' });
  for (const b of BAIAS) el.livre[b.i] = rotulo('hg-r-livre', '#8299b8', `doca ${b.i + 1} · livre`, { tipo: 'baia', i: b.i });
  for (const f of FABRICAS) el.fab.set(f.id, rotulo('hg-r-fab', f.cor, `Fábrica ${f.nome}<small></small>`, { tipo: 'fabrica', id: f.id }));
  for (const d of H.droids) el.droid.set(d.id, rotulo('hg-r-droid', fabrica(d.ia).cor, esc(d.rotulo), { tipo: 'droid', id: d.id }));
  el.oficina = rotulo('hg-r-zona', '#c4b5fd', 'Oficina central <small></small>', { tipo: 'oficina' });
  el.patio = rotulo('hg-r-zona', '#7c9cff', 'Pátio do Plane <small></small>', { tipo: 'patio' });
  for (const x of H.acervo) el.acervo.set(x.id, rotulo('hg-r-acervo', setor(x.setor).cor, esc(x.nome.replace(/^~\/\.claude\//, '~/')), { tipo: 'acervo', id: x.id }));
  ouvir('naveMontada', rotulosNave);
  ouvir('itemNovo', rotuloItem);
  ouvir('itemSaiu', (n, b) => { const k = `${n.id}|${b.chave}`; el.item.get(k)?.remove(); el.item.delete(k); });
  ouvir('droidNovo', (d) => el.droid.set(d.id, rotulo('hg-r-droid', fabrica(d.ia).cor, esc(d.rotulo), { tipo: 'droid', id: d.id })));
  ouvir('droidSaiu', (d) => { el.droid.get(d.id)?.remove(); el.droid.delete(d.id); });
}

function colocar(e, p, visivel = true, ax = '-50%', ay = '-100%') {
  if (!e) return;
  e.hidden = !visivel || !p.ok;
  if (!e.hidden) e.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(${ax},${ay})`;
}

export function posicionarRotulos() {
  if (!C.pronto) return;
  const perto = H.foco && H.foco !== 'PATIO';
  const T = H.T;
  for (const n of H.naves) {
    const p = pose(n); const docada = n.estado === 'docada';
    colocar(el.doca.get(n.id), projetar(p.x, 7 * p.s + p.y, p.z - 18 * p.s), n.estado !== 'estacionada');
    const v = vagaPos(n.vaga);
    // Na visão geral as 15 vagas viram uma parede de texto; o nome aparece no foco do pátio.
    colocar(el.vaga.get(n.id), projetar(v.x, 1.5, v.z + 5), H.foco === 'PATIO', '-50%', '0');
    for (const b of n.bancada) {
      const e = el.item.get(`${n.id}|${b.chave}`); const ativo = T - b.ativo < 0.25;
      e?.classList.toggle('ativo', ativo);
      colocar(e, projetar(b.x, (b.tipo === 'editar' ? 4 : 3) + b.alto, b.z), docada && (H.foco === n.id || ativo));
    }
    for (const x of n.chao) colocar(el.dec.get(x.id), projetar(x.x, x.alto, x.z), docada && (H.foco === n.id || !H.foco));
    colocar(el.est.get(n.id), projetar(n.estacao.x, 4.8, n.estacao.z), docada && H.foco === n.id);
  }
  for (const b of BAIAS) colocar(el.livre[b.i], projetar(b.x, 1, b.z), !b.ocupante, '-50%', '-50%');
  const vb = vagaPos(H.naves.length);
  colocar(el.berco, projetar(vb.x, 3.2, vb.z), !perto || H.foco === 'PATIO');
  for (const f of FABRICAS) colocar(el.fab.get(f.id), projetar(f.x, 10.5, f.z));
  colocar(el.oficina, projetar(ARQ.x, 9, ARQ.z - ARQ.r - 3));
  colocar(el.patio, projetar(PATIO.x, 13, PATIO.z - PATIO.d / 2 - 4));
  for (const x of H.acervo) {
    const e = el.acervo.get(x.id);
    e.classList.toggle('ativo', T - x.ativo < 0.25);
    colocar(e, projetar(x.slot.x, x.slot.y + 1.3, x.slot.z), H.foco === 'OFICINA' || T - x.ativo < 2.5);
  }
  for (const d of H.droids) colocar(el.droid.get(d.id), projetar(d.pos.x, d.pos.y + 1.4, d.pos.z), d.escala > 0.5);
}

// Textos que mudam devagar: atualizados junto com os painéis, não a cada quadro.
export function atualizarRotulos() {
  for (const f of FABRICAS) {
    const k = H.droids.filter((d) => d.ia === f.id && !d.encerrar).length;
    const s = el.fab.get(f.id)?.querySelector('small');
    if (s) s.textContent = f.ativa ? `${k} em campo` : 'offline';
  }
  for (const n of H.naves) {
    const e = el.doca.get(n.id); const v = el.vaga.get(n.id);
    if (!e || !v) continue;
    const k = n.chao.length + n.chaoExtra + n.produto.length;
    e.style.setProperty('--pct', `${(n.pct * 100).toFixed(1)}%`);
    e.querySelector('.pct').textContent = pct(n.pct);
    const dec = e.querySelector('.dec'); dec.textContent = k ? `${k} ${plural(k, 'decisão', 'decisões')}` : ''; dec.hidden = !k;
    e.classList.toggle('sel', H.foco === n.id);
    el.est.get(n.id).querySelector('span').textContent = n.produto.length ? `· ${n.produto.length}` : '';
    v.style.setProperty('--pct', `${(n.pct * 100).toFixed(1)}%`);
    v.textContent = n.estado === 'estacionada' ? `${n.nome} · ${pct(n.pct)}` : `${n.nome} · ${n.estado === 'docada' ? `doca ${n.baia.i + 1}` : 'em trânsito'}`;
    v.classList.toggle('fora', n.estado !== 'estacionada');
  }
  const docadas = H.naves.filter((n) => n.estado !== 'estacionada').length;
  el.patio.querySelector('small').textContent = `${H.naves.length - docadas} estacionadas · ${docadas} nas docas`;
  const consultados = H.acervo.filter((x) => x.consultas.length).length;
  el.oficina.querySelector('small').textContent = consultados ? `${consultados} de ${H.acervo.length} consultados` : `${H.acervo.length} definições`;
}
