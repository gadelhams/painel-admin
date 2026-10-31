// Uma sessão do Codex a partir da cauda do rollout: última atividade, cwd, fim de turno e ações. Não lê prompt nem resposta.

import { cartaDoComando, programaDoComando, SIGLAS } from './acoes-sessao.js';

// O Codex Desktop trabalha em ~/Documents/Codex/<tarefa> e chega aos projetos
// por caminho absoluto dentro do `exec` (JavaScript). Da chamada só se extrai:
// o arquivo de um apply_patch, caminhos sob a raiz (para achar o projeto), o
// primeiro programa do `cmd` e a carta citada nos `cmd` (ponte, URL ou
// SIGLA-N; nunca no corpo do patch). O resto do texto é descartado aqui.
const RE_PATCH = /\*\*\* (?:Update|Add|Delete) File: ([^\s\\"'`]+)/g;
const RE_CMD = /\bcmd\s*:\s*"((?:[^"\\]|\\.){0,400})"/;
const RE_CMDS = /\bcmd\s*:\s*(?:"((?:[^"\\]|\\.){0,2000})"|`((?:[^`\\]|\\.){0,2000})`)/g;
const CHAMADAS = new Set(['custom_tool_call', 'function_call']);

function caminhosSobRaiz(texto, raiz) {
  const achados = [];
  let de = 0;
  while (achados.length < 8) {
    const i = texto.indexOf(`${raiz}/`, de);
    if (i < 0) break;
    const fim = texto.slice(i).search(/[\s\\"'`),;\]]/);
    achados.push(fim < 0 ? texto.slice(i) : texto.slice(i, i + fim));
    de = i + 1;
  }
  return achados;
}

function cartaDosCmds(texto, siglas) {
  // O `cmd` é literal de JavaScript: `\n` escapado volta a ser quebra (o heredoc depende dela).
  const cmds = [...texto.matchAll(RE_CMDS)].map((m) => (m[1] ?? m[2]).replace(/\\n/g, '\n').replace(/\\(["`])/g, '$1'));
  return cmds.length ? cartaDoComando(cmds.join('\n'), siglas) : null;
}

function acoesDaChamada(texto, em, raiz, siglas) {
  const editados = [...texto.matchAll(RE_PATCH)].map((m) => m[1]).filter((c) => c.startsWith('/'));
  if (editados.length) return editados.slice(0, 4).map((caminho) => ({ em, tipo: 'editar', ferramenta: 'apply_patch', caminho }));
  const cmd = texto.match(RE_CMD)?.[1];
  const programa = cmd ? programaDoComando(cmd.replace(/\\"/g, '"')) : null;
  const [caminho = null] = caminhosSobRaiz(texto, raiz).reverse();
  const carta = cartaDosCmds(texto, siglas);
  if (!programa && !caminho && !carta) return [];
  // Falar com o Plane (ponte ou URL) é mexer na carta; citar SIGLA-N num commit não muda o tipo.
  return [{ em, tipo: carta && !carta.carta ? 'cartao' : 'comando', ferramenta: 'exec', programa, caminho, ...carta }];
}

export function sessaoCodex(objetos, { raiz, siglas = SIGLAS }) {
  let ultimoEm = null;
  let cwd = null;
  let fimDeTurno = false;
  let subagente = false;
  const acoes = [];
  for (const o of objetos) {
    const p = o?.payload ?? {};
    if (o?.type === 'session_meta') {
      subagente = Boolean(p.source?.subagent);
      if (typeof p.cwd === 'string') cwd = p.cwd;
      continue;
    }
    if (typeof o?.timestamp !== 'string') continue;
    ultimoEm = o.timestamp;
    if (o.type === 'turn_context' && typeof p.cwd === 'string') cwd = p.cwd;
    if (o.type === 'event_msg' && p.type === 'task_complete') fimDeTurno = true;
    if (o.type === 'event_msg' && p.type === 'task_started') fimDeTurno = false;
    if (o.type === 'response_item' && CHAMADAS.has(p.type)) {
      const texto = String(p.input ?? p.arguments ?? '');
      acoes.push(...acoesDaChamada(texto, o.timestamp, raiz, siglas));
    }
  }
  return { ultimoEm, cwd, fimDeTurno, subagente, acoes };
}
