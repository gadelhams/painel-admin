// Cenário do preparo do PRONTA (PAINEL-62): uma carta (por padrão em Backlog, a forma da CAD-32) e um job do zelador que a propõe PRONTA, montados sobre o cenário F4b. Plane, CLI e executor falsos.
import { randomUUID } from 'node:crypto';
import { montarF4b, PAINEL, CAD } from './frota-f4b.js';
import { codificarDecisao } from '../../decisao/protocolo-decisao.js';

export const H = 3 * 60 * 60_000;
export const MIN = 60_000;
export const ESCOPO = '<p>Escopo: exportar CSV. Aceite: suíte verde.</p>';
// 31/10/2026 15:00 UTC (montarF4b + 3 h) é 31/10 em São Paulo.
export const LINHA = 'Dependências: nenhuma (declarada pelo zelador do Hangar em 31/10/2026)';
export const EVIDENCIA = [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }];
export const COMENTARIO_CLI = 'Escopo e aceite escritos; dependências conferidas no retrato.';
export const pronta = carta => ({ carta: `PAINEL-${carta.sequence_id}`, veredito: 'PRONTA', comentario: COMENTARIO_CLI, evidencias: EVIDENCIA });
export const patches = plane => plane.escritas.filter(e => e.startsWith('patch:'));
// O Painel Admin falso: a decisão da mesa só destrava com este ator configurado (W3).
export const ADMIN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
// Um DECISAO/v1 no formato da mesa, de `autor` (o Painel Admin, por padrão).
export const decidir = (c, carta, { autor = ADMIN } = {}) => c.plane.comentar(carta.id, { autor, externalSource: 'painel-decisao-v1', externalId: randomUUID(),
  html: codificarDecisao({ identificador: `PAINEL-${carta.sequence_id}`, decisao: 'segue sem a trava', motivo: '', efeitos: [], quando: c.agora() }) });
export const vereditoDe = async (c, carta) => (await c.lerDiario()).filter(l => l.tipo === 'VEREDITO' && l.carta === `PAINEL-${carta.sequence_id}`).at(-1);

// `preparar` mexe no Plane antes do job; estado que o Plane falso não traz (ex.: "Em espera") nasce
// no grupo `grupo` (backlog por padrão), entre Backlog e Todo.
// `comCad`: o CAD entra no catálogo (com uma carta, para a sigla existir no juiz), e CAD-N vira código do catálogo.
// `autorDecisao`: o Painel Admin que a montagem injeta (W3); null = nada destrava.
export async function jobBacklog({ descricao = ESCOPO, nome = 'Pronta', estadoNome = 'Backlog', grupo = 'backlog', preparar = () => {}, responder = null, comCad = false,
  autorDecisao = null } = {}) {
  let alvo;
  const c = await montarF4b({ comCad, autorDecisao, responder: (entrada, ctx) => (responder ? responder(alvo, ctx) : { vereditos: [pronta(alvo)] }) });
  await c.play.alternar(PAINEL.plane, true, '1');
  if (!c.plane.estado(estadoNome)) c.plane.estados.push({ id: randomUUID(), name: estadoNome, group: grupo, sequence: 16000, default: false });
  if (comCad) c.planes.get(CAD.plane).novaCarta({ nome: 'Carta do CAD' });
  alvo = c.plane.novaCarta({ nome, estadoNome, descricao });
  await preparar(c, alvo);
  c.avancar(H);
  const job = await c.zelador.rodarUmaVez();
  return { c, alvo, job, v: await vereditoDe(c, alvo) };
}
