// Uma chamada de ferramenta de sessão de IA → ação segura para o Hangar. Nunca devolve texto livre da chamada.

import path from 'node:path';
import { UUID } from '../orquestrador/uuid.js';

// O painel também abre pelo tailnet e o transcript pode ter segredo colado
// (regra 5): daqui só sai nome de ferramenta, caminho absoluto (que o coletor
// ainda reduz a relativo), nome de programa e UUID de carta — nunca argumento,
// prompt ou conteúdo.
const LEITURA = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'LS']);
const EDICAO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PROVA = new Set(['npm', 'pnpm', 'yarn', 'npx', 'pytest', 'playwright', 'dotnet', 'cargo', 'make', 'go', 'vitest', 'jest']);
const NAO_PROGRAMA = new Set(['export', 'set', 'env', 'sudo', 'time', 'then', 'do', 'if', 'for', 'while', '{', '(']);
const FORMA_PROGRAMA = /^[a-z0-9][\w.+-]{0,23}$/i;

// Primeiro programa de verdade de uma linha de shell: pula `cd x &&`, VAR=valor e prefixos.
export function programaDoComando(comando) {
  if (typeof comando !== 'string') return null;
  for (const trecho of comando.split(/&&|\|\||;|\||\n/)) {
    for (const palavra of trecho.trim().split(/\s+/)) {
      if (!palavra || NAO_PROGRAMA.has(palavra) || /^\w+=/.test(palavra)) continue;
      if (palavra === 'cd') break;
      const nome = path.basename(palavra.replace(/^["']|["']$/g, ''));
      if (FORMA_PROGRAMA.test(nome)) return nome;
      break;
    }
  }
  return null;
}

function caminhoDe(entrada) {
  const c = entrada?.file_path ?? entrada?.notebook_path ?? entrada?.path;
  return typeof c === 'string' && path.isAbsolute(c) ? path.normalize(c) : null;
}

export function acaoDaFerramenta(nome, entrada, em) {
  if (typeof nome !== 'string') return null;
  if (LEITURA.has(nome)) return { em, tipo: 'ler', ferramenta: nome, caminho: caminhoDe(entrada) };
  if (EDICAO.has(nome)) return { em, tipo: 'editar', ferramenta: nome, caminho: caminhoDe(entrada) };
  if (nome === 'Bash') {
    const programa = programaDoComando(entrada?.command);
    return { em, tipo: PROVA.has(programa) ? 'testar' : 'comando', ferramenta: nome, programa };
  }
  if (nome === 'Skill') {
    const skill = String(entrada?.skill ?? '').split(':').pop();
    return /^[\w-]{1,48}$/.test(skill) ? { em, tipo: 'consultar', ferramenta: nome, setor: 'skills', item: skill } : null;
  }
  if (nome.startsWith('mcp__plane__')) {
    const projeto = UUID.test(entrada?.project_id ?? '') ? entrada.project_id : null;
    const item = UUID.test(entrada?.issue_id ?? '') ? entrada.issue_id : null;
    return { em, tipo: 'cartao', ferramenta: 'plane', projetoPlane: projeto, itemPlane: item };
  }
  return null;
}
