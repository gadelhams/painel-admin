// Cenário do preparo do PRONTA (PAINEL-62): uma carta (por padrão em Backlog, a forma da CAD-32) e um job do zelador que a propõe PRONTA, montados sobre o cenário F4b. Plane, CLI e executor falsos.
import { randomUUID } from 'node:crypto';
import { montarF4b, PAINEL } from './frota-f4b.js';

export const H = 3 * 60 * 60_000;
export const MIN = 60_000;
export const ESCOPO = '<p>Escopo: exportar CSV. Aceite: suíte verde.</p>';
// 31/10/2026 15:00 UTC (montarF4b + 3 h) é 31/10 em São Paulo.
export const LINHA = 'Dependências: nenhuma (declarada pelo zelador do Hangar em 31/10/2026)';
export const EVIDENCIA = [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }];
export const COMENTARIO_CLI = 'Escopo e aceite escritos; dependências conferidas no retrato.';
export const pronta = carta => ({ carta: `PAINEL-${carta.sequence_id}`, veredito: 'PRONTA', comentario: COMENTARIO_CLI, evidencias: EVIDENCIA });
export const patches = plane => plane.escritas.filter(e => e.startsWith('patch:'));
export const vereditoDe = async (c, carta) => (await c.lerDiario()).filter(l => l.tipo === 'VEREDITO' && l.carta === `PAINEL-${carta.sequence_id}`).at(-1);

// `preparar` mexe no Plane antes do job; estado que o Plane falso não traz (ex.: "Em espera") nasce
// no grupo `grupo` (backlog por padrão), entre Backlog e Todo.
export async function jobBacklog({ descricao = ESCOPO, estadoNome = 'Backlog', grupo = 'backlog', preparar = () => {}, responder = null } = {}) {
  let alvo;
  const c = await montarF4b({ comCad: false, responder: (entrada, ctx) => (responder ? responder(alvo, ctx) : { vereditos: [pronta(alvo)] }) });
  await c.play.alternar(PAINEL.plane, true, '1');
  if (!c.plane.estado(estadoNome)) c.plane.estados.push({ id: randomUUID(), name: estadoNome, group: grupo, sequence: 16000, default: false });
  alvo = c.plane.novaCarta({ nome: 'Pronta', estadoNome, descricao });
  await preparar(c, alvo);
  c.avancar(H);
  const job = await c.zelador.rodarUmaVez();
  return { c, alvo, job, v: await vereditoDe(c, alvo) };
}
