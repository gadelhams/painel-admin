// Leitor ESTRITO de sessões para o zelador: diz se alguma sessão de IA tocou um projeto nas últimas 2 h; erro de leitura = ocupado. Nunca devolve prompt, resposta nem argumento.
//
// O coletor do Hangar (sessoes.js) falha aberto de propósito: um transcript ilegível vira
// "sem sessão" para a tela não cair. Para o zelador isso seria escrever por cima de quem
// trabalha (J16–J19 do plano da frota). Aqui é o contrário: pasta que não se lê, arquivo
// recente que não se lê ou que não tem uma linha legível contam como ocupado. Sem portão por
// /proc (o processo pode ter caído e a sessão voltar): basta o transcript ter evento na janela.
// Os subagentes do Claude moram em `<projeto>/<sessão>/subagents/agent-*.jsonl` (profundidade 4,
// B8) e contam; transcript recente sem instante legível conta como ocupado.
// A CLI do próprio zelador roda sem persistência de sessão e não aparece aqui; a do executor
// também não — por isso a guarda real é a janela de atividade do Plane (J67, zelador-ocupacao.js).

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RAIZ } from './caminhos.js';
import { lerCabeca, lerCauda } from './transcript-cauda.js';
import { sessaoClaude } from './transcript-claude.js';
import { sessaoCodex } from './transcript-codex.js';
import { SIGLAS } from './acoes-sessao.js';

const JANELA_ESTRITA_MS = 2 * 60 * 60_000;

async function arquivosRecentes(dir, desde, profundidade) {
  let entradas;
  try { entradas = await fs.readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(`pasta de sessões ilegível (${e.code ?? 'erro'})`); }
  const achados = [];
  for (const e of entradas) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory() && profundidade > 1) achados.push(...await arquivosRecentes(abs, desde, profundidade - 1));
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
      const st = await fs.stat(abs).catch(() => { throw new Error('transcript ilegível'); });
      if (st.mtimeMs >= desde) achados.push(abs);
    }
  }
  return achados;
}

const dentro = (c, d) => typeof c === 'string' && (path.normalize(c) === d || path.normalize(c).startsWith(d + path.sep));

// O que liga uma sessão ao projeto: caminho tocado, cwd, carta do projeto (UUID, SIGLA-N ou ponte).
function tocaProjeto(bruta, { dir, projeto, cartas, desde }) {
  if (Date.parse(bruta.ultimoEm) < desde) return false;
  if (dentro(bruta.cwd, dir)) return true;
  return bruta.acoes.some(a => Date.parse(a.em) >= desde && (dentro(a.caminho, dir)
    || (a.itemPlane && (cartas.has(a.itemPlane) || a.projetoPlane === projeto.plane))
    || (a.carta && projeto.sigla && a.carta.startsWith(`${projeto.sigla}-`))
    || (a.ponte && dentro(a.ponte.script, dir))));
}

/**
 * Devolve { ocupado, motivo }. `cartas` = ids das cartas do projeto (para o MCP `plane`, que cita
 * só o UUID). Qualquer falha de leitura é ocupado, com o motivo.
 */
export async function ocupacaoPorSessoes({ projeto, cartas = new Set(), raiz = RAIZ, agora = Date.now(),
  raizClaude = path.join(os.homedir(), '.claude', 'projects'), raizCodex = path.join(os.homedir(), '.codex', 'sessions'),
  janelaMs = JANELA_ESTRITA_MS, siglas = SIGLAS } = {}) {
  if (!projeto?.pasta || !projeto?.area) return { ocupado: true, motivo: 'projeto sem pasta no catálogo' };
  const dir = path.join(raiz, projeto.area, projeto.pasta);
  const exitlag = path.join(raiz, 'Exitlag');
  const desde = agora - janelaMs;
  const contexto = { dir, projeto, cartas, desde };
  try {
    for (const [ia, raizIa, profundidade] of [['claude', raizClaude, 4], ['codex', raizCodex, 4]]) {
      for (const arquivo of await arquivosRecentes(raizIa, desde, profundidade)) {
        const objetos = await lerCauda(arquivo);
        if (!objetos.length) return { ocupado: true, motivo: `transcript recente sem linha legível (${ia})` };
        const meta = ia === 'codex' ? await lerCabeca(arquivo) : null;
        const bruta = ia === 'claude' ? sessaoClaude(objetos, { siglas }) : sessaoCodex([meta, ...objetos].filter(Boolean), { raiz, siglas });
        if (dentro(bruta.cwd, exitlag)) continue;
        if (!Number.isFinite(Date.parse(bruta.ultimoEm))) return { ocupado: true, motivo: `transcript recente sem instante legível (${ia})` };
        if (tocaProjeto(bruta, contexto)) return { ocupado: true, motivo: `sessão ${ia} tocou o projeto nas últimas ${Math.round(janelaMs / 60_000)} min` };
      }
    }
  } catch (erro) {
    return { ocupado: true, motivo: `sessões ilegíveis: ${erro.message}` };
  }
  return { ocupado: false, motivo: null };
}
