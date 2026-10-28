// Movimento do Hangar: sessões reais viram droids, cada ação nova vira uma ida (bancada, nave ou Oficina), naves vão e voltam das docas. Não busca nem desenha.

import {
  H, BAIAS, FABRICAS, PATIO, ARQ, RETORNO_S, MAX_BANCADA,
  fabrica, plataforma, nave, naDoca, pecaAlvo, portao, centroPeca, poseVaga, ancorar, vagaPos, acervoItem, emitir,
} from './estado.js';
import { aleatorio, bez, calmo, nomeCurto, suave, plural } from './util.js';
import { falar } from './narrador.js';

const LETRA = { claude: 'C', codex: 'X', grok: 'G' };
const FORA = ['volta', 'desmonte'];
const sorte = aleatorio(7);
export const faiscas = [];
let testes = 0;
let consultas = 0;
let lembrete = 60;

// ---------- Sessões → droids ----------

function rotuloLivre(ia) {
  const usados = new Set(H.droids.filter((d) => d.ia === ia).map((d) => d.n));
  let k = 1;
  while (usados.has(k)) k += 1;
  return k;
}

function destino(d) {
  const p = d.s.projeto;
  if (p && p !== 'central') return nave(p) ?? null;
  return null;
}

function criarDroid(s, chegando) {
  const k = rotuloLivre(s.ia);
  const d = {
    id: s.id, ia: s.ia, n: k, rotulo: `${LETRA[s.ia] ?? '?'}${k}`, s, fila: [], ultimaEm: s.acoes.at(-1)?.em ?? '',
    idx: H.droids.length, fase: 'montagem', passo: null, acao: null, t: 0, dur: calmo ? 0.01 : 2.2,
    voando: false, pos: plataforma(fabrica(s.ia)), de: null, para: null, ctrl: null, escala: 0, carga: false, feixe: false, ancora: null, encerrar: false,
  };
  d.nave = destino(d);
  // Na primeira carga o droid já está em serviço: nada de desfile de montagem a cada F5.
  if (!chegando) { d.fase = 'tarefa'; d.escala = 1; d.pos = lugar(d); }
  else falar(`A fábrica do ${fabrica(s.ia).nome} montou o droid ${d.rotulo}${d.nave ? ` para a ${d.nave.nome}` : s.projeto === 'central' ? ' para um trabalho transversal' : ''}.`);
  if (s.acoes.length) d.fila.push(s.acoes.at(-1));
  H.droids.push(d);
  emitir('droidNovo', d);
  return d;
}

export function reconciliar(sessoes, chegando) {
  const vistos = new Set();
  for (const s of sessoes) {
    vistos.add(s.id);
    const d = H.droids.find((x) => x.id === s.id);
    if (!d) { criarDroid(s, chegando); continue; }
    if (d.encerrar) continue;
    if (s.estado === 'aguardando' && d.s.estado !== 'aguardando') falar(`Oh, céus! O ${d.rotulo} do ${fabrica(d.ia).nome} parou${d.nave ? ` na ${d.nave.nome}` : ''} esperando por você.`);
    const novas = s.acoes.filter((a) => a.em > d.ultimaEm);
    d.s = s;
    if (novas.length) {
      d.fila = [...d.fila, ...novas].slice(-4);
      d.ultimaEm = novas.at(-1).em;
    }
  }
  for (const d of H.droids) {
    if (!vistos.has(d.id) && !d.encerrar) {
      d.encerrar = true;
      falar(`O ${d.rotulo} encerrou a sessão e volta à fábrica do ${fabrica(d.ia).nome} para ser desmontado.`);
    }
  }
}

// ---------- Onde o droid fica e para onde voa ----------

const portaoPatio = (n) => ({ x: PATIO.x + PATIO.w / 2 + 3, y: 3.2, z: vagaPos(n.vaga).z });

export function lugar(d) {
  if (d.nave) return naDoca(d.nave) ? portao(d.nave) : portaoPatio(d.nave);
  if (d.s.projeto === 'central') return { x: ARQ.x - ARQ.r - 5, y: 3.4, z: ARQ.z + ((d.idx % 3) - 1) * 3 };
  const p = plataforma(fabrica(d.ia));
  return { x: p.x + 3, y: 4, z: p.z + 4 };
}

function voar(d, alvo, dur, alto = 5) {
  d.de = { ...d.pos };
  d.para = alvo;
  d.ctrl = { x: (d.pos.x + alvo.x) / 2, y: Math.max(d.pos.y, alvo.y) + alto, z: (d.pos.z + alvo.z) / 2 };
  d.t = 0;
  d.dur = calmo ? 0.01 : dur;
  d.voando = true;
}

const longe = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) > 2;

export function pecaDoDroid(d) {
  const n = d.nave;
  if (!n) return null;
  const doCartao = d.s.cartao && n.cartoes[d.s.cartao];
  return (doCartao && n.pecas[doCartao[0]]) || pecaAlvo(n) || n.pecas[0] || null;
}

// Bancada da doca: um item por cartão, arquivo editado ou programa de teste; os mais antigos saem.
function itemBancada(n, a, d) {
  const chave = a.tipo === 'cartao' ? `carta:${a.itemPlane}` : a.tipo === 'editar' ? `editar:${a.arquivo ?? '?'}` : `testar:${a.programa ?? '?'}`;
  let b = n.bancada.find((x) => x.chave === chave);
  if (b) return b;
  if (n.bancada.length >= MAX_BANCADA) {
    const velho = [...n.bancada].sort((x, y) => x.ativo - y.ativo)[0];
    n.bancada.splice(n.bancada.indexOf(velho), 1);
    emitir('itemSaiu', n, velho);
  }
  const usados = new Set(n.bancada.map((x) => x.slot));
  let slot = 0;
  while (usados.has(slot)) slot += 1;
  const carta = a.tipo === 'cartao' ? a.itemPlane : d.s.cartao;
  b = {
    chave, tipo: a.tipo, slot, carta, arquivo: a.arquivo ?? null, programa: a.programa ?? null, ativo: -9,
    rotulo: a.tipo === 'cartao' ? (n.cartoes[a.itemPlane]?.[1] ?? 'cartão') : a.tipo === 'editar' ? nomeCurto(a.arquivo ?? 'arquivo') : (a.programa ?? 'comando'),
    lx: -16 + slot * 4.6, lz: -14, alto: slot % 2 ? 2 : 0,
  };
  n.bancada.push(b);
  ancorar(n, n.cx, n.cz);
  emitir('itemNovo', n, b);
  return b;
}

function iniciarAcao(d, a) {
  d.acao = a;
  d.feixe = false;
  const n = d.nave && naDoca(d.nave) ? d.nave : null;
  if (a.tipo === 'consultar') {
    const x = acervoItem(`${a.setor}:${a.item}`) ?? H.acervo.find((y) => y.setor === a.setor);
    if (x) { d.alvoAcervo = x; d.passo = 'consultar_ir'; voar(d, x.consulta, 2.6, 6); return; }
  }
  const naBancada = n && (a.tipo === 'editar' || a.tipo === 'testar' || (a.tipo === 'cartao' && a.itemPlane));
  if (naBancada) {
    d.bancada = itemBancada(n, a, d);
    d.passo = 'ir';
    voar(d, { x: d.bancada.x, y: 3.6, z: d.bancada.z + 1.4 }, 1.5);
    return;
  }
  d.passo = 'inspecionar';
  const sobre = n ? { x: n.cx + ((d.idx % 3) - 1) * 4, y: 8, z: n.cz } : { ...lugar(d), y: lugar(d).y + 2 };
  voar(d, sobre, 1.2, 2);
}

function chegou(d) {
  switch (d.fase) {
    case 'ida': d.fase = 'tarefa'; return;
    case 'volta': d.fase = 'desmonte'; d.t = 0; d.dur = 1.3; return;
    default: break;
  }
  const n = d.nave;
  switch (d.passo) {
    case 'ir': d.passo = 'usar'; d.t = 0; d.dur = 1.3; return;
    case 'levar': d.passo = 'instalar'; d.t = 0; d.dur = 2.6; d.ancora = { ...d.pos }; return;
    case 'testar_ir':
      d.passo = 'testar'; d.t = 0; d.dur = 2.8; d.ancora = { ...d.pos }; d.feixe = true;
      if (testes++ % 2 === 0) falar(`O ${d.rotulo} está rodando ${d.acao.programa ?? 'os testes'} na ${n?.nome ?? 'nave'}. Torço por nós.`);
      return;
    case 'consultar_ir': {
      d.passo = 'consultar'; d.t = 0; d.dur = 1.8;
      const x = d.alvoAcervo;
      x.consultas.unshift({ droid: d.rotulo, ia: d.ia, nave: d.nave?.id ?? null, T: H.T });
      if (x.consultas.length > 6) x.consultas.pop();
      if (consultas++ % 2 === 0) falar(`O ${d.rotulo} foi à Oficina central consultar ${x.nome}${d.nave ? `, a pedido da ${d.nave.nome}` : ''}.`);
      return;
    }
    case 'inspecionar': d.passo = 'olhar'; d.t = 0; d.dur = 1.2; d.ancora = { ...d.pos }; return;
    default: d.passo = null;
  }
}

function fimDoPasso(d) {
  const n = d.nave;
  switch (d.passo) {
    case 'usar':
      if (d.acao.tipo === 'editar' && n) {
        d.carga = true; d.passo = 'levar';
        const pc = pecaDoDroid(d);
        voar(d, pc ? centroPeca(n, pc) : { x: n.cx, y: 5, z: n.cz }, 1.8);
        return;
      }
      if (d.acao.tipo === 'testar' && n) { d.passo = 'testar_ir'; voar(d, { x: n.cx + 1, y: 8, z: n.cz }, 1.4); return; }
      d.passo = null;
      return;
    case 'instalar': d.carga = false; d.passo = null; return;
    default: d.passo = null; d.feixe = false;
  }
}

function soltarFaisca(n, pc) {
  const F = pc.F;
  const c = F.cells[Math.max(0, Math.round(pc.p * F.cells.length) - 1)] ?? F.cells[0];
  const a = sorte() * Math.PI * 2;
  const v = 1 + sorte() * 3;
  faiscas.push({ x: n.cx + c.x + 0.5, y: F.y0 + F.h, z: n.cz + c.y + 0.5, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + sorte() * 4, vida: 0.35 + sorte() * 0.35 });
}

// ---------- Docas: a nave sai do pátio quando um droid trabalha nela e volta depois de um tempo sem ninguém ----------

const demanda = (n) => H.droids.some((d) => d.nave === n && !d.encerrar && !FORA.includes(d.fase));

function rebocar(n, b, instantaneo) {
  b.ocupante = n; n.baia = b; n.estado = instantaneo ? 'docada' : 'indo';
  n.mov = instantaneo ? null : { t: 0, dur: calmo ? 0.01 : 3.2, de: poseVaga(n), para: { x: b.x, y: 0, z: b.z, s: 1 } };
  ancorar(n, b.x, b.z);
  if (!instantaneo) falar(`Um droid pegou trabalho da ${n.nome}. Rebocando a nave do pátio do Plane para a doca ${b.i + 1}.`);
  emitir('docas');
}

function devolver(n) {
  n.estado = 'voltando';
  n.mov = { t: 0, dur: calmo ? 0.01 : 3.2, de: { x: n.cx, y: 0, z: n.cz, s: 1 }, para: poseVaga(n) };
  falar(`Ninguém trabalha na ${n.nome} há um tempo. Devolvendo a nave ao pátio do Plane.`);
}

export function gerirDocas(dt, instantaneo = false) {
  for (const n of H.naves) {
    const quer = demanda(n);
    if (quer) n.ultimaDemanda = H.T;
    if (n.estado === 'estacionada' && quer) {
      const b = BAIAS.find((x) => !x.ocupante);
      if (b) rebocar(n, b, instantaneo);
    } else if (n.estado === 'docada' && H.T - n.ultimaDemanda > RETORNO_S) devolver(n);
    if (n.mov) {
      n.mov.t += dt;
      if (n.mov.t >= n.mov.dur) {
        n.mov = null;
        if (n.estado === 'indo') n.estado = 'docada';
        else {
          n.estado = 'estacionada'; n.baia.ocupante = null; n.baia = null;
          const v = vagaPos(n.vaga); ancorar(n, v.x, v.z);
        }
        emitir('docas');
      }
    }
  }
}

// ---------- Passo da simulação ----------

export function passo(dt) {
  H.T += dt;
  gerirDocas(dt);
  for (const d of [...H.droids]) {
    if (d.voando) {
      d.t += dt;
      const u = Math.min(1, d.t / d.dur);
      d.pos = bez(d.de, d.para, d.ctrl, suave(u));
      if (u >= 1) { d.voando = false; chegou(d); }
      continue;
    }
    d.t += dt;
    const bob = calmo ? 0 : Math.sin(H.T * 3 + d.idx) * 0.25;
    if (d.fase === 'montagem') {
      d.escala = Math.min(1, d.t / d.dur); d.pos = plataforma(fabrica(d.ia));
      if (d.t >= d.dur) { d.fase = 'ida'; voar(d, lugar(d), 4, 12); }
      continue;
    }
    if (d.fase === 'desmonte') {
      d.escala = Math.max(0, 1 - d.t / d.dur);
      if (d.t >= d.dur) { H.droids.splice(H.droids.indexOf(d), 1); emitir('droidSaiu', d); }
      continue;
    }
    if (d.fase !== 'tarefa') continue;
    const n = d.nave;
    if (d.passo === 'usar') {
      d.bancada.ativo = H.T; d.pos = { x: d.bancada.x, y: 3.6 + bob, z: d.bancada.z + 1.4 };
    } else if (d.passo === 'instalar') {
      const a = d.idx * 2.1 + (calmo ? 0 : H.T * 1.6);
      d.pos = { x: d.ancora.x + Math.cos(a) * 1.6, y: d.ancora.y + bob, z: d.ancora.z + Math.sin(a) * 1.2 };
      const pc = pecaDoDroid(d);
      if (pc && naDoca(n)) { pc.tocada = H.T; if (!calmo && sorte() < 16 * dt) soltarFaisca(n, pc); }
    } else if (d.passo === 'testar') {
      d.pos = { x: d.ancora.x + Math.sin(d.t * 2.2) * 8, y: d.ancora.y, z: d.ancora.z };
    } else if (d.passo === 'consultar') {
      d.alvoAcervo.ativo = H.T; d.pos = { ...d.alvoAcervo.consulta, y: d.alvoAcervo.consulta.y + bob };
    } else if (d.passo === 'olhar') {
      d.pos = { ...d.ancora, y: d.ancora.y + bob };
    } else if (!d.passo) {
      // Ocioso entre ações: decide o que fazer a seguir.
      if (d.encerrar) { d.fase = 'volta'; d.carga = false; voar(d, plataforma(fabrica(d.ia)), 3.6, 12); continue; }
      const alvo = destino(d);
      if (alvo !== d.nave) d.nave = alvo;
      if (d.fila.length) { iniciarAcao(d, d.fila.shift()); continue; }
      const aqui = lugar(d);
      if (longe(d.pos, aqui)) { d.fase = 'ida'; voar(d, aqui, 2.4, 6); continue; }
      const orbita = d.s.estado === 'trabalhando' || d.s.estado === 'pensando';
      if (orbita && n && naDoca(n) && !calmo) {
        const a = H.T * (d.s.estado === 'trabalhando' ? 0.9 : 0.4) + d.idx * 2;
        d.pos = { x: aqui.x + Math.cos(a) * 2.2, y: aqui.y + 1 + bob, z: aqui.z + Math.sin(a) * 1.4 };
      } else d.pos = { x: aqui.x, y: aqui.y + (d.s.estado === 'ocioso' ? -1.2 : 0) + bob, z: aqui.z };
      continue;
    }
    if (d.passo && d.t >= d.dur) fimDoPasso(d);
  }
  for (let i = faiscas.length - 1; i >= 0; i--) {
    const f = faiscas[i];
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vy -= 14 * dt; f.vida -= dt;
    if (f.y < 0) { f.y = 0; f.vy *= -0.3; }
    if (f.vida <= 0) faiscas.splice(i, 1);
  }
  lembrete -= dt;
  if (lembrete <= 0) {
    lembrete = 120;
    const n = H.naves.filter(naDoca).sort((a, b) => b.chao.length - a.chao.length)[0];
    if (n?.chao.length) {
      const k = n.chao.length + n.chaoExtra;
      falar(`Mestre, a doca da ${n.nome} tem ${k === 1 ? 'uma peça' : `${k} peças`} no chão esperando decisão sua. Sem ela, ${n.chao.slice(0, 2).map((x) => x.modulo).join(' e ')}${k > 2 ? ' e outros' : ''} não ${plural(k, 'entra', 'entram')} na nave.`);
    }
  }
}

export function estadoDroid(d) {
  if (d.fase === 'montagem') return { r: 'sendo montado', c: 'var(--hg-pensa)', hex: 0xc084fc };
  if (d.fase === 'volta' || d.encerrar) return { r: 'voltando à fábrica', c: 'var(--hg-realce)', hex: 0xffd89a };
  if (d.fase === 'desmonte') return { r: 'sendo desmontado', c: 'var(--hg-apagado)', hex: 0xac9b81 };
  if (d.fase === 'ida') return { r: 'a caminho', c: 'var(--hg-realce)', hex: 0xffd89a };
  const t = d.passo && d.acao?.tipo;
  if (t === 'consultar') return { r: d.passo === 'consultar' ? 'consultando a Oficina' : 'indo à Oficina', c: 'var(--hg-oficina)', hex: 0xc9a9e8 };
  if (d.passo) {
    const r = { ir: 'indo à bancada', usar: t === 'cartao' ? 'lendo o cartão' : t === 'editar' ? 'prensando peça' : 'preparando teste', levar: 'levando peça', instalar: 'instalando', testar_ir: 'indo testar', testar: 'testando', inspecionar: 'inspecionando', olhar: 'inspecionando' }[d.passo];
    return { r, c: 'var(--hg-ok)', hex: 0x7fd6be };
  }
  if (d.s.estado === 'aguardando') return { r: 'aguardando você', c: 'var(--hg-alerta)', hex: 0xffcc4d };
  if (d.s.estado === 'ocioso') return { r: 'ocioso', c: 'var(--hg-apagado)', hex: 0xac9b81 };
  if (d.nave && !naDoca(d.nave)) return { r: 'esperando doca livre', c: 'var(--hg-alerta)', hex: 0xffcc4d };
  return { r: d.s.estado === 'pensando' ? 'pensando' : 'trabalhando', c: d.s.estado === 'pensando' ? 'var(--hg-pensa)' : 'var(--hg-ok)', hex: d.s.estado === 'pensando' ? 0xc084fc : 0x7fd6be };
}

export const ativas = () => FABRICAS.filter((f) => f.ativa).length;
