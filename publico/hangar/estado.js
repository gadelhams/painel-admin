// Mapa do estaleiro (posições fixas) e o estado vivo compartilhado entre os módulos do Hangar. Não busca dados nem desenha.

import { suave } from './util.js';

// Centro: docas; norte: fábricas de droids; leste: Oficina central; oeste: pátio do Plane.
export const BAIAS = [{ x: -22, z: -19 }, { x: 22, z: -19 }, { x: -22, z: 19 }, { x: 22, z: 19 }].map((b, i) => ({ ...b, i, ocupante: null }));
export const FABRICAS = [
  { id: 'claude', nome: 'Claude', x: -32, z: -60, cor: '#ff8a5c', ativa: false },
  { id: 'codex', nome: 'Codex', x: 0, z: -60, cor: '#7cc8dc', ativa: false },
  { id: 'grok', nome: 'Grok', x: 32, z: -60, cor: '#b28cff', ativa: false },
];
export const fabrica = (id) => FABRICAS.find((f) => f.id === id);
// Cor por papel da frota (F2, 29/10/2026), nos tons dos tokens --hg-* de hangar.css:
// realce, editar, testar e pátio. Só os droids da frota (F3/F4) a usam; sessão humana não
// tem papel e continua com a cor da fábrica.
export const COR_PAPEL = Object.freeze({ orquestracao: '#ffd89a', codificacao_testes: '#ff9b54', validacao: '#7fd6be', zelador: '#e3a86b' });
export const NOME_PAPEL = Object.freeze({ orquestracao: 'orquestração', codificacao_testes: 'codificação', validacao: 'validação', zelador: 'zelador' });
export const plataforma = (f) => ({ x: f.x, y: 1.2, z: f.z + 11 });

export const PATIO = { x: -70, z: 0, w: 36, d: 96 };
export const ESCALA_VAGA = 0.35;
export const vagaPos = (i) => ({ x: PATIO.x - 8 + (i % 2) * 16, z: -40 + Math.floor(i / 2) * 10.5 });

export const ARQ = { x: 66, y: 5, z: 0, r: 9 };
export const LADOS = { padroes: [0, -1], orientacoes: [1, 0], skills: [0, 1], licoes: [-1, 0] };
export const SETORES = [
  { id: 'padroes', nome: 'Padrões', cor: '#a78bfa' },
  { id: 'orientacoes', nome: 'Orientações', cor: '#f2c58a' },
  { id: 'skills', nome: 'Skills', cor: '#e879f9' },
  { id: 'licoes', nome: 'Lições vivas', cor: '#5eead4' },
];
export const setor = (id) => SETORES.find((s) => s.id === id);

export const COR_TIPO = { cartao: '#e9d8b4', editar: '#ff9b54', testar: '#7fd6be', consultar: '#c9a9e8', ler: '#ac9b81', comando: '#ac9b81' };
export const NOME_TIPO = { cartao: 'caixa de ferramentas', editar: 'fábrica de peças', testar: 'banco de provas', consultar: 'Oficina central' };
const CORES = ['#7fd6be', '#ffc857', '#ff6f91', '#a3e635', '#f0abfc', '#fb923c', '#6fb3d9', '#f87171', '#86efac', '#b39ddb', '#4fc3a1', '#facc15', '#c8b49a', '#fda4af', '#bef264', '#d8b4fe'];
export const corDoIndice = (i) => CORES[i % CORES.length];

// Quanto tempo uma nave fica na doca depois do último droid sair.
export const RETORNO_S = 45;
export const MAX_BANCADA = 8;
export const MAX_CHAO = 6;

export const H = {
  T: 0,
  naves: [],
  droids: [],
  acervo: [],
  foco: null,
  selecionada: null,
  popup: null,
  carregado: false,
  erroHangar: null,
  sessoesEm: null,
  frota: null,
};
export const nave = (id) => H.naves.find((n) => n.id === id);
export const droid = (id) => H.droids.find((d) => d.id === id);
export const acervoItem = (id) => H.acervo.find((x) => x.id === id);

export const naDoca = (n) => n?.estado === 'docada';
export const pctNave = (n) => n.pct;
export const travada = (n, pc) => pc.decisoes.length > 0;
export const pecaAlvo = (n) => n.pecas.find((pc) => pc.p < 1 && !travada(n, pc)) ?? null;
export const portao = (n) => ({ x: n.cx, y: 3.2, z: n.cz + 19 });

export function centroPeca(n, pc) {
  const F = pc.F;
  return { x: n.cx + F.centro.x, y: F.y0 + F.h + 2.4, z: n.cz + F.centro.y };
}

export function poseVaga(n) {
  const v = vagaPos(n.vaga);
  const k = n.nasceu != null ? Math.min(1, (H.T - n.nasceu) / 1.6) : 1;
  return { x: v.x, y: 0, z: v.z, s: ESCALA_VAGA * Math.max(0.001, suave(k)) };
}

export function pose(n) {
  if (n.mov) {
    const u = suave(Math.min(1, n.mov.t / n.mov.dur));
    const a = n.mov.de;
    const b = n.mov.para;
    return { x: a.x + (b.x - a.x) * u, y: Math.sin(u * Math.PI) * 12, z: a.z + (b.z - a.z) * u, s: a.s + (b.s - a.s) * u };
  }
  return n.baia ? { x: n.baia.x, y: 0, z: n.baia.z, s: 1 } : poseVaga(n);
}

// Coordenadas absolutas dos itens da doca a partir dos offsets locais.
export function ancorar(n, cx, cz) {
  n.cx = cx;
  n.cz = cz;
  for (const b of n.bancada) { b.x = cx + b.lx; b.z = cz + b.lz; }
  for (const x of n.chao) { x.x = cx + x.lx; x.z = cz + x.lz; }
  n.estacao.x = cx + n.estacao.lx;
  n.estacao.z = cz + n.estacao.lz;
}

export const situacao = (n) => (n.estado === 'docada' ? `na doca ${n.baia.i + 1}`
  : n.estado === 'indo' ? 'sendo rebocada para a doca'
    : n.estado === 'voltando' ? 'voltando ao pátio'
      : n.congelado ? 'congelada no pátio' : 'estacionada no pátio');

// Barramento mínimo: dados e simulação avisam; cena, rótulos e painéis montam ou desmontam.
const ouvintes = {};
export const ouvir = (nome, f) => { (ouvintes[nome] ??= []).push(f); };
export const emitir = (nome, ...args) => { for (const f of ouvintes[nome] ?? []) f(...args); };
