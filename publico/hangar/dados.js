// Busca naves (/api/hangar), droids (/api/hangar/sessoes), sondas (/api/producao) e a frota (/api/orquestracao/frota) e as aplica ao estado da cena sem perder a animação. Só GET.

import {
  H, FABRICAS, ARQ, LADOS, SETORES, MAX_CHAO, nave, corDoIndice, vagaPos, ancorar, emitir,
} from './estado.js';
import { formaDe } from './formas.js';
import { falar } from './narrador.js';

async function json(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function aplicarNave(api, i) {
  let n = nave(api.pasta);
  const nova = !n;
  if (!n) {
    n = { id: api.pasta, vaga: i, estado: 'estacionada', baia: null, mov: null, ultimaDemanda: -99, bancada: [], estacao: { lx: 16, lz: 12 } };
    H.naves.push(n);
  }
  const tocadas = new Map((n.pecas ?? []).map((pc) => [pc.modulo, pc.tocada]));
  Object.assign(n, {
    nome: api.pasta,
    titulo: api.titulo,
    sigla: api.sigla,
    cor: corDoIndice(i),
    congelado: api.congelado,
    producao: api.producao,
    url: api.url,
    estadoBacklog: api.estado,
    pct: api.pct / 100,
    cartas: { aberto: api.cartas.abertas, andamento: api.cartas.andamento, feito: api.cartas.feitas },
    cartoes: api.cartoes,
    produto: api.decisoesProduto,
  });
  n.pecas = api.pecas.map((p, k) => ({
    modulo: p.titulo,
    F: formaDe(k),
    p: p.pct / 100,
    total: p.total,
    feitas: p.feitas,
    andamento: p.andamento,
    abertas: p.abertas,
    proximas: p.proximas,
    decisoes: p.decisoes,
    tocada: tocadas.get(p.titulo) ?? -9,
  }));
  // Peça no chão = um monte por módulo travado; a doca comporta seis, o resto aparece no popup.
  const travados = n.pecas.map((pc, k) => ({ pc, k })).filter((o) => o.pc.decisoes.length);
  n.chao = travados.slice(0, MAX_CHAO).map((o, j) => ({
    id: `${n.id}:${o.k}`, peca: o.k, modulo: o.pc.modulo, decisoes: o.pc.decisoes, lx: -16 + j * 6.4, lz: 13, alto: j % 2 ? 5.2 : 3.6,
  }));
  n.chaoExtra = travados.length - n.chao.length;
  if (n.cx == null) { const v = vagaPos(n.vaga); n.cx = v.x; n.cz = v.z; }
  ancorar(n, n.cx, n.cz);
  const assinatura = `${n.pecas.map((pc) => pc.modulo).join('|')}#${n.chao.map((x) => x.peca).join(',')}`;
  if (nova || assinatura !== n.assinatura) {
    n.assinatura = assinatura;
    emitir('naveMontada', n, nova);
  }
}

function montarAcervo(setores) {
  H.acervo = [];
  for (const s of SETORES) {
    const itens = setores.find((x) => x.id === s.id)?.itens ?? [];
    const [lx, lz] = LADOS[s.id];
    const passo = Math.min(2.6, 17 / Math.max(1, itens.length));
    itens.forEach((nome, i) => {
      const off = (i - (itens.length - 1) / 2) * passo;
      const px = lx ? ARQ.x + lx * ARQ.r : ARQ.x + off;
      const pz = lz ? ARQ.z + lz * ARQ.r : ARQ.z + off;
      H.acervo.push({
        id: `${s.id}:${nome}`, setor: s.id, nome, largura: passo * 0.72, lado: [lx, lz], ativo: -9, consultas: [],
        slot: { x: px, y: 1.8, z: pz }, consulta: { x: px - lx * 3, y: 2.8, z: pz - lz * 3 },
      });
    });
  }
}

export async function carregarHangar() {
  try {
    const r = await json('/api/hangar');
    r.naves.forEach(aplicarNave);
    if (!H.acervo.length) montarAcervo(r.acervo);
    carregarFrota();
    if (H.erroHangar) falar('O Plane voltou a responder, mestre. As naves estão em dia.');
    H.erroHangar = null;
  } catch (e) {
    if (!H.erroHangar) falar('Oh, não! Não consegui ler o Plane. As naves ficam como estavam até ele voltar.');
    H.erroHangar = e.message;
  }
}

// A frota aparece em leitura no popup da fábrica; trocar é na sub-aba Frota (SSO + duas ações).
async function carregarFrota() {
  try { H.frota = await json('/api/orquestracao/frota'); }
  catch { H.frota = { estado: 'indisponivel' }; }
}

export async function carregarSessoes() {
  try {
    const r = await json('/api/hangar/sessoes');
    for (const f of FABRICAS) f.ativa = r.ias.find((i) => i.id === f.id)?.viva ?? false;
    H.sessoesEm = Date.now();
    emitir('sessoes', r.sessoes);
  } catch {
    // poll de 5 s: a próxima rodada tenta de novo; os droids ficam onde estão
  }
}

export async function carregarSondas(primeira = false) {
  try {
    const { sondas } = await json('/api/producao');
    for (const n of H.naves) {
      if (!n.producao) continue;
      const s = sondas.find((x) => x.url === n.producao);
      const agora = s ? (s.ok ? 'ok' : 'falha') : null;
      if (!primeira && agora && n.sonda && agora !== n.sonda) {
        falar(agora === 'falha' ? `Mestre, a sonda de produção da ${n.nome} parou de responder. Eu avisei que isso ia acontecer.` : `A sonda da ${n.nome} voltou a responder. Meus circuitos agradecem.`);
      }
      n.sonda = agora;
    }
  } catch {
    // sem sonda = sem alarme; não inventa falha
  }
}
