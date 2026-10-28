// Naves do Hangar: por projeto, peças (módulos) com a contagem de cartas, próximas fases e decisões. Só leitura sobre o backlog.

import { PROJETOS } from '../projetos.js';
import { lerBacklog } from './backlog.js';
import { inventarioAcervo } from './acervo.js';

const PROXIMAS = 4;
const GRUPOS = { completed: 'feitas', started: 'andamento' };

function achatar(nodos, saida = []) {
  for (const n of nodos ?? []) {
    saida.push(n);
    achatar(n.filhos, saida);
  }
  return saida;
}

// A forma da nave deriva do nome da pasta (FNV-1a) para não mudar a cada carga.
export function sementeDe(texto) {
  let h = 0x811c9dc5;
  for (const ch of String(texto)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function grupoDe(nodo) {
  if (nodo.grupoEstado) return GRUPOS[nodo.grupoEstado] ?? 'abertas';
  return nodo.estado === 'pronto' ? 'feitas' : 'abertas';
}

function resumoItem(n) {
  return { id: n.identificador ?? null, titulo: n.texto, url: n.url ?? null };
}

// Decisão = carta aberta que espera o dono (decidido por ele em 28/10/2026):
// label PRODUTO vai para a estação de planejamento; ASTARGNE (ou `(DONO)` em
// texto antigo) trava o módulo e vira peça no chão. BLOQUEADA esperando outra
// carta, EMPÍRICA e SEM ESCOPO não são decisão e ficam fora do chão.
function decisao(n, modulo) {
  return { ...resumoItem(n), modulo, tags: n.tags.map((t) => t.tag), detalhe: n.tags.find((t) => t.detalhe)?.detalhe ?? null };
}

export function montarNave(projeto, backlog) {
  const nave = {
    pasta: projeto.pasta,
    titulo: projeto.titulo,
    sigla: null,
    semente: sementeDe(projeto.pasta),
    congelado: Boolean(projeto.congelado),
    producao: projeto.producao ?? null,
    planePrj: projeto.plane ?? null,
    fonte: backlog?.fonte ?? null,
    estado: backlog?.estado ?? 'sem_backlog',
    url: backlog?.url ?? null,
    pecas: [],
    cartas: { abertas: 0, andamento: 0, feitas: 0 },
    pct: 0,
    decisoesProduto: [],
    // UUID da carta no Plane → [índice da peça, identificador, título]: o droid
    // que toca a carta pelo MCP (que só traz o UUID) mostra a carta e leva a peça certa.
    cartoes: {},
  };
  if (backlog?.estado !== 'ok') return nave;

  backlog.features.forEach((f, indice) => {
    const itens = achatar(f.itens);
    const cont = { abertas: 0, andamento: 0, feitas: 0 };
    const decisoes = [];
    for (const n of itens) {
      cont[grupoDe(n)] += 1;
      if (n.identificador && !nave.sigla) nave.sigla = n.identificador.replace(/-\d+$/, '');
      if (n.idRastreador) nave.cartoes[n.idRastreador] = [indice, n.identificador ?? null, n.texto];
      if (n.estado === 'pronto') continue;
      if (n.produto) nave.decisoesProduto.push(decisao(n, f.titulo));
      else if (n.tags?.some((t) => t.tag === 'ASTARGNE')) decisoes.push(decisao(n, f.titulo));
    }
    const total = cont.abertas + cont.andamento + cont.feitas;
    nave.pecas.push({
      titulo: f.titulo,
      total,
      ...cont,
      pct: total ? Math.round((cont.feitas / total) * 100) : 0,
      proximas: itens.filter((n) => n.estado !== 'pronto').slice(0, PROXIMAS).map(resumoItem),
      decisoes,
    });
    for (const k of Object.keys(cont)) nave.cartas[k] += cont[k];
  });
  const total = nave.cartas.abertas + nave.cartas.andamento + nave.cartas.feitas;
  nave.pct = total ? Math.round((nave.cartas.feitas / total) * 100) : 0;
  return nave;
}

export async function lerHangar({ projetos = PROJETOS, backlog = lerBacklog, acervo = inventarioAcervo } = {}) {
  const [{ projetos: backlogs }, setores] = await Promise.all([backlog(projetos), acervo()]);
  const porPasta = new Map(backlogs.map((b) => [b.pasta, b]));
  return {
    naves: projetos.map((p) => montarNave(p, porPasta.get(p.pasta))),
    acervo: setores,
  };
}
