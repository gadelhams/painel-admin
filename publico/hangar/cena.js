// Cena 3D do Hangar (Three.js r128 vendorizado + bloom): monta as estruturas, reconstrói o que os dados mudam e desenha cada quadro. Não decide nada.

import {
  H, BAIAS, FABRICAS, PATIO, ARQ, SETORES, LADOS, COR_TIPO,
  fabrica, setor, nave, naDoca, travada, pose, vagaPos, ouvir,
} from './estado.js';
import { aleatorio, calmo, suave } from './util.js';
import { formaDe } from './formas.js';
import { faiscas, estadoDroid } from './simulacao.js';

const VENDOR = '/vendor/three/';
const LIBS = ['three.min.js', 'CopyShader.js', 'LuminosityHighPassShader.js', 'EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'UnrealBloomPass.js', 'OrbitControls.js'];
const script = (src) => new Promise((ok, falhou) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = falhou;
  document.head.appendChild(s);
});

export const GERAL = { alvo: { x: -7, y: 0, z: -10 }, posicao: { x: -7, y: 150, z: 118 } };
export const C = { pronto: false, W: 1, H: 1, cam: null, controles: null, viagem: null, ociosoDesde: 0 };
const obj = { projetos: new Map(), baias: [], droids: new Map(), fabricas: [], bancadas: new Map() };
const clicaveis = [];
let T3;
let R;
let cena;
let composer;
let v3;
let geoCel;

function linhas(pontos, cor, opac = 1) {
  const g = new T3.BufferGeometry().setFromPoints(pontos.map((p) => new T3.Vector3(...p)));
  return new T3.LineSegments(g, new T3.LineBasicMaterial({ color: cor, transparent: opac < 1, opacity: opac }));
}
const retangulo = (w, d, y = 0.05) => [[-w, y, -d], [w, y, -d], [w, y, -d], [w, y, d], [w, y, d], [-w, y, d], [-w, y, d], [-w, y, -d]];
const emissivo = (cor, intens = 0.6, base = 0x0b1322) => new T3.MeshStandardMaterial({ color: base, emissive: cor, emissiveIntensity: intens, metalness: 0.5, roughness: 0.45 });
function marcar(o, alvo) { o.traverse((x) => { x.userData.alvo = alvo; }); clicaveis.push(o); }
function desmarcar(raiz) {
  for (let i = clicaveis.length - 1; i >= 0; i--) {
    let p = clicaveis[i];
    while (p && p !== raiz) p = p.parent;
    if (p === raiz) clicaveis.splice(i, 1);
  }
}
function descartar(o) {
  o.traverse((x) => { x.geometry?.dispose?.(); if (x.material) [].concat(x.material).forEach((m) => m.dispose()); });
}

// ---------- Estruturas fixas ----------

function montarFabricas() {
  for (const f of FABRICAS) {
    const g = new T3.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = -Math.PI / 2;
    const corpo = new T3.BoxGeometry(12, 5, 10);
    const m = new T3.Mesh(corpo, new T3.MeshStandardMaterial({ color: 0x0d1626, metalness: 0.5, roughness: 0.6 })); m.position.y = 2.5;
    const ar = new T3.LineSegments(new T3.EdgesGeometry(corpo), new T3.LineBasicMaterial({ color: f.cor })); ar.position.y = 2.5;
    const chamine = new T3.Mesh(new T3.CylinderGeometry(1, 1.2, 5, 16), new T3.MeshStandardMaterial({ color: 0x111b2c })); chamine.position.set(-3.5, 7, -2.5);
    const anelCh = new T3.Mesh(new T3.TorusGeometry(1.05, 0.14, 8, 24), emissivo(f.cor, 1.4)); anelCh.rotation.x = Math.PI / 2; anelCh.position.set(-3.5, 9.5, -2.5);
    const esteira = new T3.Mesh(new T3.BoxGeometry(6, 0.4, 2.2), new T3.MeshStandardMaterial({ color: 0x141f33 })); esteira.position.set(8.5, 0.2, 0);
    const listras = [];
    for (let i = 0; i < 4; i++) { const l = new T3.Mesh(new T3.BoxGeometry(0.25, 0.06, 2), emissivo(f.cor, 0.9)); l.position.set(6 + i * 1.5, 0.44, 0); g.add(l); listras.push(l); }
    const anel = new T3.Mesh(new T3.RingGeometry(1.9, 2.3, 40), new T3.MeshBasicMaterial({ color: f.cor, side: T3.DoubleSide, transparent: true, opacity: 0.9 }));
    anel.rotation.x = -Math.PI / 2; anel.position.set(11, 0.05, 0);
    const base = new T3.Mesh(new T3.CylinderGeometry(0.6, 0.8, 1.4, 12), new T3.MeshStandardMaterial({ color: 0x1a2740 })); base.position.set(3, 5.7, 3.2);
    const braco = new T3.Group(); braco.position.set(3, 6.4, 3.2);
    const lanca = new T3.Mesh(new T3.BoxGeometry(6, 0.5, 0.5), emissivo(f.cor, 0.5)); lanca.position.x = 3; braco.add(lanca);
    const porta = new T3.Mesh(new T3.PlaneGeometry(4, 3.4), new T3.MeshBasicMaterial({ color: f.cor, transparent: true, opacity: 0.55 }));
    porta.rotation.y = Math.PI / 2; porta.position.set(6.02, 1.7, 0);
    const barreira = new T3.Group();
    for (let i = 0; i < 4; i++) { const s = new T3.Mesh(new T3.BoxGeometry(0.06, 0.5, 4.2), new T3.MeshBasicMaterial({ color: i % 2 ? 0x1a1a1a : 0xfbbf24 })); s.position.set(6.06, 0.6 + i * 0.8, 0); barreira.add(s); }
    const luz = new T3.PointLight(f.cor, 1.3, 34); luz.position.set(13, 4, 0);
    g.add(m, ar, chamine, anelCh, esteira, anel, base, braco, porta, barreira, luz);
    cena.add(g); marcar(m, { tipo: 'fabrica', id: f.id });
    obj.fabricas.push({ f, braco, listras, anel, ar, anelCh, lanca, porta, barreira, luz });
  }
}

function montarDocas() {
  for (const b of BAIAS) {
    const g = new T3.Group(); g.position.set(b.x, 0, b.z);
    const piso = new T3.Mesh(new T3.PlaneGeometry(42, 36), new T3.MeshStandardMaterial({ color: 0x08101d, roughness: 0.9 }));
    piso.rotation.x = -Math.PI / 2; piso.position.y = 0.01; g.add(piso);
    const bw = 21; const bd = 18; const gp = 5;
    const borda = linhas([[-bw, 0.05, -bd], [bw, 0.05, -bd], [bw, 0.05, -bd], [bw, 0.05, bd], [bw, 0.05, bd], [gp, 0.05, bd], [-gp, 0.05, bd], [-bw, 0.05, bd], [-bw, 0.05, bd], [-bw, 0.05, -bd]], 0x2a3b55);
    const interna = linhas(retangulo(bw - 1.5, bd - 1.5), 0x2a3b55, 0.25);
    const alarme = linhas(retangulo(bw + 1, bd + 1, 0.06), 0xff4d6d, 0.9);
    const parede = new T3.Mesh(new T3.BoxGeometry(42, 6, 0.6), new T3.MeshStandardMaterial({ color: 0x0c1525, metalness: 0.4, roughness: 0.7 })); parede.position.set(0, 3, -bd - 0.3);
    const topo = linhas([[-bw, 6, -bd], [bw, 6, -bd]], 0x2a3b55);
    g.add(borda, interna, alarme, parede, topo);
    const postes = [];
    for (const s of [-1, 1]) {
      const p = new T3.Mesh(new T3.BoxGeometry(1, 5, 1), new T3.MeshStandardMaterial({ color: 0x141f33 })); p.position.set(s * (gp + 0.5), 2.5, bd);
      const luz = new T3.Mesh(new T3.SphereGeometry(0.45, 12, 8), new T3.MeshBasicMaterial({ color: s < 0 ? 0xff4d6d : 0x4ade80 })); luz.position.set(s * (gp + 0.5), 5.4, bd);
      g.add(p, luz); postes.push(luz);
    }
    for (const x of [-4, 4]) { const c = new T3.Mesh(new T3.BoxGeometry(1.4, 0.9, 7), new T3.MeshStandardMaterial({ color: 0x1a2740 })); c.position.set(x, 0.45, 0); g.add(c); }
    cena.add(g); marcar(piso, { tipo: 'baia', i: b.i });
    obj.baias.push({ b, linhas: [borda.material, interna.material, topo.material], alarme, postes });
  }
}

function montarPatio() {
  const g = new T3.Group(); g.position.set(PATIO.x, 0, PATIO.z);
  const piso = new T3.Mesh(new T3.PlaneGeometry(PATIO.w, PATIO.d), new T3.MeshStandardMaterial({ color: 0x080c1c, roughness: 0.9 }));
  piso.rotation.x = -Math.PI / 2; piso.position.y = 0.01;
  g.add(piso, linhas(retangulo(PATIO.w / 2, PATIO.d / 2), 0x7c9cff), linhas([[0, 0.05, -PATIO.d / 2 + 2], [0, 0.05, PATIO.d / 2 - 2]], 0x7c9cff, 0.3));
  const torre = new T3.Mesh(new T3.CylinderGeometry(1.2, 1.8, 9, 12), new T3.MeshStandardMaterial({ color: 0x121a33, metalness: 0.5 })); torre.position.set(0, 4.5, -PATIO.d / 2 - 4);
  const farol = new T3.Mesh(new T3.SphereGeometry(0.8, 16, 10), new T3.MeshBasicMaterial({ color: 0x7c9cff })); farol.position.set(0, 9.6, -PATIO.d / 2 - 4);
  g.add(torre, farol);
  cena.add(g); marcar(piso, { tipo: 'patio' }); marcar(torre, { tipo: 'patio' }); obj.farolPatio = farol;
  const bg = new T3.Group();
  const cruz = new T3.Group();
  cruz.add(new T3.Mesh(new T3.BoxGeometry(3.2, 0.3, 0.6), emissivo(0xe8b54a, 0.9)), new T3.Mesh(new T3.BoxGeometry(0.6, 0.3, 3.2), emissivo(0xe8b54a, 0.9)));
  cruz.position.y = 1.4;
  const anel = new T3.Mesh(new T3.RingGeometry(2.6, 2.9, 40), new T3.MeshBasicMaterial({ color: 0xe8b54a, side: T3.DoubleSide, transparent: true, opacity: 0.6 }));
  anel.rotation.x = -Math.PI / 2; anel.position.y = 0.06;
  bg.add(linhas(retangulo(7.4, 4.8, 0.04), 0xe8b54a, 0.7), cruz, anel); cena.add(bg); marcar(bg, { tipo: 'berco' });
  obj.berco = { g: bg, cruz, anel };
}

function montarOficina() {
  const ag = new T3.Group(); ag.position.set(ARQ.x, 0, ARQ.z);
  const L = ARQ.r + 3;
  const piso = new T3.Mesh(new T3.PlaneGeometry(L * 2, L * 2), new T3.MeshStandardMaterial({ color: 0x0a0d1d, roughness: 0.9 }));
  piso.rotation.x = -Math.PI / 2; piso.position.y = 0.01;
  const salao = new T3.Mesh(new T3.CylinderGeometry(3.4, 4.2, 3, 24), new T3.MeshStandardMaterial({ color: 0x121a30, metalness: 0.5, roughness: 0.5 })); salao.position.y = 1.5;
  const aro = new T3.Mesh(new T3.TorusGeometry(3.5, 0.1, 8, 64), emissivo(0xc4b5fd, 0.8)); aro.rotation.x = Math.PI / 2; aro.position.y = 3.05;
  const nucleo = new T3.Mesh(new T3.OctahedronGeometry(1.4, 0), emissivo(0xd8c8ff, 0.9, 0x1a1030)); nucleo.position.y = ARQ.y;
  const nucleoFio = new T3.Mesh(new T3.OctahedronGeometry(1.9, 0), new T3.MeshBasicMaterial({ color: 0xc4b5fd, wireframe: true, transparent: true, opacity: 0.45 })); nucleoFio.position.y = ARQ.y;
  const aro2 = new T3.Mesh(new T3.TorusGeometry(2.5, 0.06, 8, 64), new T3.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.6 })); aro2.rotation.x = Math.PI / 2; aro2.position.y = ARQ.y;
  ag.add(piso, linhas(retangulo(L, L), 0xc4b5fd), salao, aro, nucleo, nucleoFio, aro2);
  for (const s of SETORES) {
    const [lx, lz] = LADOS[s.id];
    const comp = 18.8;
    const bancada = new T3.Mesh(new T3.BoxGeometry(lz ? comp : 1.2, 1.1, lz ? 1.2 : comp), new T3.MeshStandardMaterial({ color: 0x141b30, metalness: 0.5, roughness: 0.5 }));
    bancada.position.set(lx * (ARQ.r + 0.6), 0.55, lz * (ARQ.r + 0.6));
    const m = comp / 2; const d = ARQ.r - 1.4;
    ag.add(bancada, linhas(lz ? [[-m, 0.05, lz * d], [m, 0.05, lz * d]] : [[lx * d, 0.05, -m], [lx * d, 0.05, m]], s.cor));
    marcar(bancada, { tipo: 'oficina' });
  }
  const slots = [];
  for (const x of H.acervo) {
    const cor = setor(x.setor).cor;
    const painel = new T3.Mesh(new T3.BoxGeometry(x.largura, 1.4, 0.22), emissivo(cor, 0.3));
    painel.position.set(x.slot.x - ARQ.x, x.slot.y, x.slot.z - ARQ.z); painel.rotation.y = x.lado[0] ? Math.PI / 2 : 0;
    const fio = new T3.Line(new T3.BufferGeometry().setFromPoints([painel.position.clone(), new T3.Vector3(0, ARQ.y, 0)]), new T3.LineBasicMaterial({ color: cor }));
    fio.visible = false;
    ag.add(painel, fio); marcar(painel, { tipo: 'acervo', id: x.id }); slots.push({ x, painel, fio });
  }
  cena.add(ag);
  marcar(piso, { tipo: 'oficina' }); marcar(salao, { tipo: 'oficina' }); marcar(nucleo, { tipo: 'oficina' });
  obj.oficina = { nucleo, nucleoFio, aneis: [aro2], slots };
}

// ---------- Naves (reconstruídas quando os módulos ou as peças no chão mudam) ----------

function montarVaga(n) {
  const v = vagaPos(n.vaga); const vg = new T3.Group(); vg.position.set(v.x, 0, v.z);
  vg.add(linhas(retangulo(7.4, 4.8, 0.04), n.congelado ? 0x2a3045 : 0x34437a));
  const cores = { aberto: 0x60708f, andamento: 0xfbbf24, feito: 0x4ade80 };
  const pilhas = ['aberto', 'andamento', 'feito'].map((k, j) => {
    const pilha = new T3.Mesh(new T3.BoxGeometry(0.9, 1, 0.9), emissivo(cores[k], k === 'andamento' ? 0.7 : 0.35, 0x10162a));
    pilha.position.set(5.9, 0, -1.6 + j * 1.6); vg.add(pilha);
    return { k, pilha };
  });
  cena.add(vg); marcar(vg, { tipo: 'vaga', nave: n.id });
  return { vg, pilhas };
}

function montarItem(n, b, extras) {
  const bg = new T3.Group(); bg.position.set(b.lx, 0, b.lz);
  const cor = COR_TIPO[b.tipo]; const it = { b, g: bg, mats: [], extra: null };
  if (b.tipo === 'cartao') {
    const caixa = new T3.Mesh(new T3.BoxGeometry(2.8, 1.3, 1.8), new T3.MeshStandardMaterial({ color: 0x1a2740, metalness: 0.6, roughness: 0.4 })); caixa.position.y = 0.65;
    const faixa = new T3.Mesh(new T3.BoxGeometry(2.84, 0.18, 1.84), emissivo(cor, 0.3)); faixa.position.y = 0.95;
    const tampa = new T3.Group(); tampa.position.set(0, 1.3, -0.9);
    const tm = new T3.Mesh(new T3.BoxGeometry(2.8, 0.2, 1.8), new T3.MeshStandardMaterial({ color: 0x223352, metalness: 0.6, roughness: 0.4 })); tm.position.z = 0.9; tampa.add(tm);
    const ficha = new T3.Mesh(new T3.PlaneGeometry(1.6, 1), new T3.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0, side: T3.DoubleSide })); ficha.position.set(0, 2.2, 0);
    bg.add(caixa, faixa, tampa, ficha); it.mats.push(faixa.material); it.extra = tampa; it.ficha = ficha;
  } else if (b.tipo === 'editar') {
    const corpo = new T3.Mesh(new T3.BoxGeometry(2.6, 2.4, 2.2), new T3.MeshStandardMaterial({ color: 0x141f33, metalness: 0.5, roughness: 0.5 })); corpo.position.y = 1.2;
    const tela = new T3.Mesh(new T3.PlaneGeometry(1.8, 0.9), emissivo(cor, 0.3)); tela.position.set(0, 1.5, 1.11);
    const pistao = new T3.Mesh(new T3.CylinderGeometry(0.35, 0.35, 1.4, 12), emissivo(cor, 0.2, 0x2a3a55)); pistao.position.y = 3;
    const bandeja = new T3.Mesh(new T3.BoxGeometry(1.8, 0.2, 1), new T3.MeshStandardMaterial({ color: 0x1a2740 })); bandeja.position.set(0, 0.3, 1.7);
    bg.add(corpo, tela, pistao, bandeja); it.mats.push(tela.material, pistao.material); it.extra = pistao;
  } else {
    const pilar = new T3.Mesh(new T3.CylinderGeometry(0.7, 0.9, 2.6, 16), new T3.MeshStandardMaterial({ color: 0x141f33, metalness: 0.5 })); pilar.position.y = 1.3;
    const anel = new T3.Mesh(new T3.TorusGeometry(1.1, 0.12, 8, 32), emissivo(cor, 0.3)); anel.rotation.x = Math.PI / 2; anel.position.y = 2.7;
    bg.add(pilar, anel); it.mats.push(anel.material); it.extra = anel;
  }
  extras.add(bg); marcar(bg, { tipo: 'item', nave: n.id, chave: b.chave });
  obj.bancadas.set(`${n.id}|${b.chave}`, it);
}

function montarProjeto(n) {
  const antigo = obj.projetos.get(n.id);
  if (antigo) { desmarcar(antigo.g); desmarcar(antigo.vaga.vg); cena.remove(antigo.g, antigo.vaga.vg); descartar(antigo.g); descartar(antigo.vaga.vg); }
  for (const k of [...obj.bancadas.keys()]) if (k.startsWith(`${n.id}|`)) obj.bancadas.delete(k);
  const g = new T3.Group();
  const naveG = new T3.Group(); naveG.position.y = 0.9; g.add(naveG);
  const extras = new T3.Group(); g.add(extras);
  const partes = [];
  const mxm = new T3.Matrix4();
  n.pecas.forEach((pc, i) => {
    const F = pc.F;
    const N = F.cells.length;
    const solida = new T3.InstancedMesh(geoCel, new T3.MeshStandardMaterial({ color: 0x0d1626, emissive: n.cor, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.35 }), N);
    const fantasma = new T3.InstancedMesh(geoCel, new T3.MeshBasicMaterial({ color: n.cor, wireframe: true, transparent: true, opacity: 0.2 }), N);
    F.cells.forEach((k, j) => {
      mxm.makeScale(1, F.h, 1); mxm.setPosition(k.x + 0.5, F.y0 + F.h / 2, k.y + 0.5); solida.setMatrixAt(j, mxm);
      const q = F.cells[N - 1 - j]; mxm.makeScale(1, F.h, 1); mxm.setPosition(q.x + 0.5, F.y0 + F.h / 2, q.y + 0.5); fantasma.setMatrixAt(j, mxm);
    });
    naveG.add(solida, fantasma); partes.push({ pc, solida, fantasma, N });
    marcar(solida, { tipo: 'peca', nave: n.id, i }); marcar(fantasma, { tipo: 'peca', nave: n.id, i });
  });
  if (!n.pecas.length) {
    // Sem backlog no Plane: só o contorno do casco, para a vaga não ficar vazia.
    const F = formaDe(0);
    const fantasma = new T3.InstancedMesh(geoCel, new T3.MeshBasicMaterial({ color: n.cor, wireframe: true, transparent: true, opacity: 0.15 }), F.cells.length);
    F.cells.forEach((k, j) => { mxm.makeScale(1, F.h, 1); mxm.setPosition(k.x + 0.5, F.h / 2, k.y + 0.5); fantasma.setMatrixAt(j, mxm); });
    naveG.add(fantasma); marcar(fantasma, { tipo: 'vaga', nave: n.id });
  }
  const chama = new T3.Mesh(new T3.ConeGeometry(1.1, 3.4, 14), new T3.MeshBasicMaterial({ color: n.cor, transparent: true, opacity: 0.8 }));
  chama.rotation.z = Math.PI / 2; chama.position.set(-11.7, 1, 0); naveG.add(chama);

  for (const b of n.bancada) montarItem(n, b, extras);
  const eg = new T3.Group(); eg.position.set(n.estacao.lx, 0, n.estacao.lz);
  const ebase = new T3.Mesh(new T3.CylinderGeometry(1.4, 1.8, 1.2, 20), new T3.MeshStandardMaterial({ color: 0x141f33, metalness: 0.5 })); ebase.position.y = 0.6;
  const etampo = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.2, 0.14, 32), emissivo(0xe8b54a, 0.22)); etampo.position.y = 1.27;
  const econe = new T3.Mesh(new T3.ConeGeometry(1.6, 2.4, 24, 1, true), new T3.MeshBasicMaterial({ color: 0xe8b54a, transparent: true, opacity: 0.1, side: T3.DoubleSide, depthWrite: false }));
  econe.rotation.x = Math.PI; econe.position.y = 2.5;
  const eholo = new T3.Mesh(new T3.IcosahedronGeometry(1.1, 0), new T3.MeshBasicMaterial({ color: 0xe8b54a, wireframe: true, transparent: true, opacity: 0.9 })); eholo.position.y = 3.3;
  eg.add(ebase, etampo, econe, eholo);
  extras.add(eg); marcar(eg, { tipo: 'estacao', nave: n.id });
  const chao = [];
  for (const x of n.chao) {
    const dg = new T3.Group(); dg.position.set(x.lx, 0, x.lz);
    const r = aleatorio(x.peca * 31 + 100);
    const mat = new T3.MeshStandardMaterial({ color: 0x1c1606, emissive: 0xfbbf24, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.5 });
    [new T3.BoxGeometry(2.2, 0.5, 1.4), new T3.ConeGeometry(0.9, 1.6, 4), new T3.BoxGeometry(1, 0.9, 1)].forEach((geo, i) => {
      const m = new T3.Mesh(geo, mat); m.position.set((r() - 0.5) * 2.4, 0.4 + i * 0.1, (r() - 0.5) * 1.8); m.rotation.set(r() * 0.5, r() * 3, r() * 0.6);
      const aresta = new T3.LineSegments(new T3.EdgesGeometry(geo), new T3.LineBasicMaterial({ color: 0xfbbf24 }));
      aresta.position.copy(m.position); aresta.rotation.copy(m.rotation);
      dg.add(m, aresta);
    });
    const haste = new T3.Mesh(new T3.CylinderGeometry(0.07, 0.07, 3, 6), new T3.MeshStandardMaterial({ color: 0x3a3320 })); haste.position.set(1.6, 1.5, -0.6);
    const farol = new T3.Mesh(new T3.SphereGeometry(0.32, 12, 8), new T3.MeshBasicMaterial({ color: 0xfbbf24 })); farol.position.set(1.6, 3.1, -0.6);
    dg.add(haste, farol);
    extras.add(dg); marcar(dg, { tipo: 'decisao', nave: n.id, id: x.id }); chao.push({ mat, farol });
  }
  cena.add(g);
  obj.projetos.set(n.id, { n, g, extras, partes, chama, chao, holo: eholo, tampo: etampo, vaga: montarVaga(n) });
}

function montarDroid(d) {
  const f = fabrica(d.ia); const g = new T3.Group();
  const corpo = new T3.Mesh(new T3.CylinderGeometry(0.6, 0.6, 1, 18), new T3.MeshStandardMaterial({ color: 0xdfe7f2, metalness: 0.6, roughness: 0.3 }));
  const domo = new T3.Mesh(new T3.SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), emissivo(f.cor, 0.9, 0x222222)); domo.position.y = 0.5;
  const olho = new T3.Mesh(new T3.SphereGeometry(0.17, 8, 6), new T3.MeshBasicMaterial({ color: 0x4ade80 })); olho.position.set(0.5, 0.62, 0);
  const carga = new T3.Mesh(new T3.BoxGeometry(0.8, 0.8, 0.8), emissivo(0xffb347, 1.1, 0x2a1a05)); carga.position.y = -1;
  const feixe = new T3.Mesh(new T3.ConeGeometry(3.2, 7, 24, 1, true), new T3.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.16, side: T3.DoubleSide, depthWrite: false }));
  feixe.position.y = -3.8;
  g.add(corpo, domo, olho, carga, feixe); cena.add(g);
  marcar(corpo, { tipo: 'droid', id: d.id }); marcar(domo, { tipo: 'droid', id: d.id });
  obj.droids.set(d.id, { d, g, olho, carga, feixe });
}

function removerDroid(d) {
  const o = obj.droids.get(d.id);
  if (!o) return;
  desmarcar(o.g); cena.remove(o.g); descartar(o.g); obj.droids.delete(d.id);
}

function removerItem(n, b) {
  const chave = `${n.id}|${b.chave}`; const it = obj.bancadas.get(chave);
  if (!it) return;
  desmarcar(it.g); it.g.parent?.remove(it.g); descartar(it.g); obj.bancadas.delete(chave);
}

// ---------- Montagem e laço ----------

export async function montarCena(camada, aviso, aoClicar, aoFundo) {
  try { await script(`${VENDOR}${LIBS[0]}`); } catch { aviso.textContent = 'O Three.js vendorizado não carregou (publico/vendor/three/).'; return false; }
  for (const src of LIBS.slice(1)) { try { await script(`${VENDOR}${src}`); } catch { /* sem bloom ou sem controles a cena ainda anda */ } }
  T3 = window.THREE; v3 = new T3.Vector3(); geoCel = new T3.BoxGeometry(0.94, 1, 0.94);
  try {
    R = new T3.WebGLRenderer({ antialias: true });
  } catch {
    // Sem WebGL (navegador headless, GPU bloqueada): os painéis laterais e o C-3PO seguem funcionando.
    aviso.textContent = 'Este navegador não abriu o WebGL; a cena 3D fica desligada. Droids, projetos e o C-3PO continuam nos painéis.';
    return false;
  }
  aviso.remove();
  R.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  camada.appendChild(R.domElement);
  cena = new T3.Scene(); cena.background = new T3.Color(0x03060c); cena.fog = new T3.Fog(0x03060c, 260, 520);
  const cam = new T3.PerspectiveCamera(48, 16 / 9, 0.1, 900); C.cam = cam;
  cam.position.set(GERAL.posicao.x, GERAL.posicao.y, GERAL.posicao.z);
  cena.add(new T3.AmbientLight(0x7d93b8, 0.45));
  const sol = new T3.DirectionalLight(0xbfd6ff, 0.7); sol.position.set(-40, 80, 50); cena.add(sol);
  const chao = new T3.Mesh(new T3.PlaneGeometry(420, 320), new T3.MeshStandardMaterial({ color: 0x060b15, roughness: 1 }));
  chao.rotation.x = -Math.PI / 2; chao.position.y = -0.02; cena.add(chao);
  cena.add(new T3.GridHelper(420, 105, 0x123050, 0x0a1a2c));
  const est = new Float32Array(900 * 3); const ra = aleatorio(5);
  for (let i = 0; i < 900; i++) { const a = ra() * Math.PI * 2; const e = ra() * 0.9 + 0.08; const dd = 330; est[i * 3] = Math.cos(a) * Math.cos(e) * dd; est[i * 3 + 1] = Math.sin(e) * dd; est[i * 3 + 2] = Math.sin(a) * Math.cos(e) * dd; }
  const ge = new T3.BufferGeometry(); ge.setAttribute('position', new T3.BufferAttribute(est, 3));
  cena.add(new T3.Points(ge, new T3.PointsMaterial({ color: 0x9fc3ff, size: 0.8, fog: false })));

  montarFabricas(); montarDocas(); montarPatio(); montarOficina();
  for (const n of H.naves) montarProjeto(n);
  for (const d of H.droids) montarDroid(d);
  ouvir('naveMontada', (n) => montarProjeto(n));
  ouvir('droidNovo', montarDroid);
  ouvir('droidSaiu', removerDroid);
  ouvir('itemNovo', (n, b) => { const o = obj.projetos.get(n.id); if (o) montarItem(n, b, o.extras); });
  ouvir('itemSaiu', removerItem);

  const pf = new Float32Array(500 * 3); const gf = new T3.BufferGeometry();
  gf.setAttribute('position', new T3.BufferAttribute(pf, 3));
  obj.faiscas = new T3.Points(gf, new T3.PointsMaterial({ color: 0xfff3b0, size: 0.45 }));
  cena.add(obj.faiscas);

  if (T3.EffectComposer && T3.UnrealBloomPass) {
    composer = new T3.EffectComposer(R);
    composer.addPass(new T3.RenderPass(cena, cam));
    composer.addPass(new T3.UnrealBloomPass(new T3.Vector2(800, 450), 0.95, 0.45, 0.16));
  }
  if (T3.OrbitControls) {
    const ct = new T3.OrbitControls(cam, R.domElement); C.controles = ct;
    ct.mouseButtons = { LEFT: T3.MOUSE.PAN, MIDDLE: T3.MOUSE.DOLLY, RIGHT: T3.MOUSE.ROTATE };
    ct.touches = { ONE: T3.TOUCH.PAN, TWO: T3.TOUCH.DOLLY_ROTATE };
    ct.screenSpacePanning = false; ct.enableDamping = true; ct.dampingFactor = 0.08;
    ct.maxPolarAngle = 1.32; ct.minDistance = 18; ct.maxDistance = 300;
    ct.target.set(GERAL.alvo.x, GERAL.alvo.y, GERAL.alvo.z);
    ct.addEventListener('start', () => { C.ociosoDesde = H.T; C.viagem = null; });
  } else cam.lookAt(GERAL.alvo.x, GERAL.alvo.y, GERAL.alvo.z);

  const raio = new T3.Raycaster(); const ndc = new T3.Vector2();
  let apertou = null;
  R.domElement.addEventListener('pointerdown', (e) => { apertou = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
  R.domElement.addEventListener('pointerup', (e) => {
    if (!apertou || e.button !== 0 || Math.hypot(e.clientX - apertou.x, e.clientY - apertou.y) > 6) return;
    const r = R.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raio.setFromCamera(ndc, cam);
    const hit = raio.intersectObjects(clicaveis, true).find((h) => h.object.userData.alvo && visivelNaArvore(h.object));
    if (hit) aoClicar(hit.object.userData.alvo); else aoFundo();
  });
  R.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  C.pronto = true;
  new ResizeObserver(() => redimensionar(camada)).observe(camada);
  redimensionar(camada);
  return true;
}

function visivelNaArvore(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

function redimensionar(camada) {
  C.W = camada.clientWidth; C.H = camada.clientHeight;
  if (!C.pronto || !C.W || !C.H) return;
  R.setSize(C.W, C.H, false); C.cam.aspect = C.W / C.H; C.cam.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio?.(Math.min(2, devicePixelRatio || 1)); composer.setSize(C.W, C.H); }
}

export function moverCamera(id) {
  let alvo = GERAL.alvo; let posicao = GERAL.posicao;
  const n = id && nave(id);
  if (n) { alvo = { x: n.cx + 1, y: 0, z: n.cz }; posicao = { x: n.cx + 5, y: 25, z: n.cz + 29 }; }
  if (id === 'OFICINA') { alvo = { x: ARQ.x - 13, y: 0, z: ARQ.z - 1 }; posicao = { x: ARQ.x - 13, y: 36, z: ARQ.z + 32 }; }
  if (id === 'PATIO') { alvo = { x: PATIO.x + 24, y: 0, z: PATIO.z }; posicao = { x: PATIO.x + 24, y: 92, z: PATIO.z + 74 }; }
  if (id === 'NORTE') { alvo = { x: 0, y: 0, z: -52 }; posicao = { x: 0, y: 40, z: -16 }; }
  if (C.pronto) C.viagem = { t: 0, deP: C.cam.position.clone(), deA: C.controles ? C.controles.target.clone() : new T3.Vector3(), alvo, posicao };
  C.ociosoDesde = H.T;
}

export function projetar(x, y, z) {
  v3.set(x, y, z).project(C.cam);
  return { x: (v3.x + 1) / 2 * C.W, y: (1 - v3.y) / 2 * C.H, ok: v3.z < 1 && v3.x > -1.1 && v3.x < 1.1 && v3.y > -1.1 && v3.y < 1.1 };
}

const COR_LIVRE = 0x2a3b55;
const CINZA = 0x3b4157;
export function desenhar(dt) {
  if (!C.pronto) return;
  const T = H.T; const cam = C.cam; const ct = C.controles;
  if (C.viagem) {
    C.viagem.t += dt; const u = calmo ? 1 : suave(Math.min(1, C.viagem.t / 1.3));
    const { deP, deA, alvo, posicao } = C.viagem;
    cam.position.set(deP.x + (posicao.x - deP.x) * u, deP.y + (posicao.y - deP.y) * u, deP.z + (posicao.z - deP.z) * u);
    const ax = deA.x + (alvo.x - deA.x) * u; const ay = deA.y + (alvo.y - deA.y) * u; const az = deA.z + (alvo.z - deA.z) * u;
    if (ct) ct.target.set(ax, ay, az); else cam.lookAt(ax, ay, az);
    if (u >= 1) C.viagem = null;
  }
  if (ct) {
    ct.autoRotate = !calmo && !H.foco && !H.popup && !C.viagem && T - C.ociosoDesde > 20; ct.autoRotateSpeed = 0.2;
    ct.target.x = Math.max(-95, Math.min(85, ct.target.x));
    ct.target.z = Math.max(-75, Math.min(55, ct.target.z));
    ct.update();
  }
  for (const o of obj.fabricas) {
    const viva = o.f.ativa; const cor = viva ? o.f.cor : CINZA;
    o.ar.material.color.set(cor); o.anelCh.material.emissive.set(cor); o.anelCh.material.emissiveIntensity = viva ? 1.4 : 0.2;
    o.lanca.material.emissive.set(cor); o.porta.material.color.set(viva ? o.f.cor : 0x2a2418); o.porta.material.opacity = viva ? 0.55 : 1;
    o.barreira.visible = !viva; o.luz.visible = viva; o.anel.material.color.set(cor);
    const ocupada = H.droids.some((d) => d.ia === o.f.id && (d.fase === 'montagem' || d.fase === 'desmonte'));
    o.braco.rotation.y = calmo || !viva ? 0 : Math.sin(T * (ocupada ? 4 : 0.6)) * (ocupada ? 0.9 : 0.35);
    o.listras.forEach((l, i) => { l.material.emissive.set(cor); l.position.x = 6 + ((i * 1.5 + (calmo || !viva ? 0 : T * 2)) % 6); });
    o.anel.material.opacity = !viva ? 0.25 : ocupada ? 0.6 + 0.4 * Math.sin(T * 12) : 0.9;
  }
  for (const o of obj.baias) {
    const n = o.b.ocupante; const ativa = n && n.estado === 'docada';
    o.linhas.forEach((m) => m.color.set(n ? n.cor : COR_LIVRE));
    o.alarme.visible = !!(ativa && n.sonda === 'falha'); o.alarme.material.opacity = 0.5 + 0.45 * Math.sin(T * 5);
    const pisca = ativa && n.producao && Math.sin(T * 4) > 0;
    o.postes.forEach((p) => { p.visible = !!pisca; });
  }
  if (obj.farolPatio) obj.farolPatio.material.color.setHSL(0.63, 0.9, 0.6 + 0.15 * Math.sin(T * 2));
  if (obj.berco) {
    const v = vagaPos(H.naves.length); const B = obj.berco;
    B.g.position.set(v.x, 0, v.z);
    B.cruz.rotation.y = calmo ? 0 : T * 0.8; B.cruz.position.y = 1.4 + (calmo ? 0 : Math.sin(T * 2) * 0.3);
    B.anel.material.opacity = 0.4 + 0.3 * Math.sin(T * 3);
  }
  for (const o of obj.projetos.values()) {
    const n = o.n; const p = pose(n);
    o.g.position.set(p.x, p.y, p.z); o.g.scale.setScalar(p.s);
    o.extras.visible = n.estado === 'docada';
    for (const q of o.partes) {
      const feitas = Math.round(q.pc.p * q.N); const trava = travada(n, q.pc);
      const escolhida = H.popup && H.popup.alvo.tipo === 'peca' && H.popup.alvo.nave === n.id && n.pecas[H.popup.alvo.i] === q.pc;
      q.solida.count = feitas; q.fantasma.count = q.N - feitas;
      q.solida.material.emissiveIntensity = n.congelado ? 0.12 : escolhida ? 0.75 + 0.2 * Math.sin(T * 6) : T - q.pc.tocada < 0.2 ? 0.7 + 0.3 * Math.sin(T * 30) : (q.pc.p >= 1 ? 0.55 : 0.3);
      q.fantasma.material.color.set(trava && naDoca(n) ? 0xfbbf24 : n.cor);
      q.fantasma.material.opacity = n.estado === 'estacionada' ? 0.1 : escolhida ? 0.55 : trava ? 0.3 + 0.2 * Math.sin(T * 3) : 0.2;
    }
    const motor = n.pecas[1];
    o.chama.visible = !!motor && motor.p >= 1 && (n.estado !== 'estacionada' || !!n.mov);
    o.chama.scale.y = (n.mov ? 1.8 : 1) + (calmo ? 0 : Math.sin(T * 23) * 0.2);
    const pend = n.produto.length;
    o.holo.rotation.y = calmo ? 0 : T * 0.8; o.holo.rotation.x = calmo ? 0 : T * 0.3;
    o.holo.material.opacity = pend ? 0.45 + 0.25 * Math.sin(T * 4) : 0.2;
    o.tampo.material.emissiveIntensity = pend ? 0.22 : 0.08;
    for (const c of o.chao) { c.mat.emissiveIntensity = 0.2 + 0.15 * Math.sin(T * 3); c.farol.visible = Math.sin(T * 5) > -0.3; }
    for (const { k, pilha } of o.vaga.pilhas) {
      const h = Math.max(0.15, Math.min(4.5, n.cartas[k] * 0.14));
      pilha.scale.y = h; pilha.position.y = h / 2;
    }
  }
  for (const it of obj.bancadas.values()) {
    const ativo = T - it.b.ativo < 0.25;
    it.mats.forEach((m) => { m.emissiveIntensity = ativo ? 1.6 : 0.3; });
    if (it.b.tipo === 'cartao') { it.extra.rotation.x = ativo ? -1.1 : 0; it.ficha.material.opacity = ativo ? 0.35 + 0.2 * Math.sin(T * 8) : 0; it.ficha.rotation.y = T; }
    else if (it.b.tipo === 'editar') it.extra.position.y = ativo && !calmo ? 2.7 + Math.abs(Math.sin(T * 9)) * 0.7 : 3;
    else it.extra.rotation.z = ativo && !calmo ? T * 4 : 0;
  }
  if (obj.oficina) {
    const A = obj.oficina; const gira = calmo ? 0 : T;
    A.nucleo.rotation.y = gira * 0.6; A.nucleoFio.rotation.y = -gira * 0.4; A.nucleoFio.rotation.x = gira * 0.2;
    A.aneis.forEach((m) => { m.rotation.z = gira * 0.2; });
    A.nucleo.material.emissiveIntensity = H.acervo.some((x) => T - x.ativo < 0.25) ? 0.9 + 0.5 * Math.sin(T * 10) : 0.7;
    for (const s of A.slots) {
      const ativo = T - s.x.ativo < 0.25; const recente = T - s.x.ativo < 3;
      s.painel.material.emissiveIntensity = ativo ? 1.8 : recente ? 0.8 : 0.3;
      s.fio.visible = ativo;
    }
  }
  for (const o of obj.droids.values()) {
    const d = o.d; const est = estadoDroid(d);
    o.g.position.set(d.pos.x, d.pos.y, d.pos.z);
    const s = Math.max(0.001, d.escala); o.g.scale.set(s, s, s);
    o.g.rotation.y = calmo ? 0 : T * 1.2 + d.idx;
    o.olho.material.color.set(d.s.estado === 'aguardando' && !d.passo && Math.sin(T * 6) < 0 ? 0x332200 : est.hex);
    o.carga.visible = d.carga;
    o.feixe.visible = d.feixe && d.passo === 'testar';
    if (o.feixe.visible) o.feixe.material.opacity = 0.12 + 0.08 * Math.sin(T * 14);
  }
  const pos = obj.faiscas.geometry.attributes.position; const k = Math.min(500, faiscas.length);
  for (let i = 0; i < k; i++) { const f = faiscas[i]; pos.setXYZ(i, f.x, f.y + 0.9, f.z); }
  pos.needsUpdate = true; obj.faiscas.geometry.setDrawRange(0, k);
  if (composer) composer.render(); else R.render(cena, cam);
}

export function rumoDaRosa() {
  if (!C.cam) return 0;
  const t = C.controles ? C.controles.target : { x: 0, z: 0 };
  return Math.atan2(C.cam.position.x - t.x, C.cam.position.z - t.z) * 180 / Math.PI;
}
