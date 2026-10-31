// Leitura do diário do zelador para o C-3PO: os três últimos dias, só campos estruturados, filtráveis por projeto. Porta só-leitura: não alcança escritor nem CLI.
import os from 'node:os';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { DiarioZelador, projecaoDaLinha } from './zelador-diario.js';

const PADRAO = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'orquestracao');

export async function consultarDiarioZelador({ diretorio = PADRAO, agora = Date.now, projeto = null } = {}) {
  const alvo = projeto ? PROJETOS.find(p => p.pasta === projeto || p.sigla === projeto) : null;
  if (projeto && !alvo?.plane) return { erro: `projeto ${projeto} fora do catálogo com Plane` };
  let linhas;
  let avisos;
  try { ({ linhas, avisos } = await new DiarioZelador({ diretorio, agora }).linhas({ janelaMs: 3 * 24 * 60 * 60_000 })); }
  catch (e) { return { erro: `diário do zelador ilegível: ${e.message}` }; }
  const sigla = new Map(PROJETOS.filter(p => p.plane).map(p => [p.plane, p.sigla]));
  const filtradas = alvo ? linhas.filter(l => l.projetoId === alvo.plane) : linhas;
  return { avisos, total: filtradas.length,
    eventos: filtradas.slice(-80).reverse().map(l => ({ ...projecaoDaLinha(l), projeto: sigla.get(l.projetoId) ?? null })),
    observacao: 'Diário do droid zelador: cada job (início, fim, pulos), os vereditos por carta e o que foi aplicado ou recusado, com o motivo. Só leitura.' };
}
