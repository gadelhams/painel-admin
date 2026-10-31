// Uma chamada de ferramenta de sessão de IA → ação segura para o Hangar. Nunca devolve texto livre da chamada.

import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { UUID } from '../orquestrador/uuid.js';

// O painel também abre pelo tailnet e o transcript pode ter segredo colado
// (regra 5): daqui só sai nome de ferramenta, caminho absoluto (que o coletor
// ainda reduz a relativo), nome de programa e a carta (UUID ou `SIGLA-N`) —
// nunca argumento, prompt ou conteúdo.
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

// A carta de um comando de shell, em três fontes (PAINEL-57), da mais forte à
// mais fraca: a ponte REST do projeto (`plane-testcase.mjs read 94` recebe só o
// número; a sigla vem do dono do caminho, resolvida em sessoes.js), a URL
// `/issues/<uuid>/` do Plane e `SIGLA-N` no texto do comando (commit, grep).
// Só o comando: prompt, resposta, corpo de patch e de heredoc não contam.
export const SIGLAS = new Set(PROJETOS.map((p) => p.sigla).filter(Boolean));
const RE_PONTE = /(\S*?)plane-testcase\.mjs["'`]?\s+(?:read|append|compact|restore)\s+(\d{1,6})(?![\w$])/;
const RE_URL_CARTA = /\/issues\/([0-9a-f-]{36})\//i;
const RE_URL_PROJETO = /\/projects\/([0-9a-f-]{36})\//i;
const RE_SIGLA_N = /(?<![\w-])([A-Z][A-Z0-9]{1,7})-(\d{1,6})(?![\w-])/g;
const RE_HEREDOC = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n([^\n]*)[\s\S]*?(?:\n\s*\2(?=\s|$)|$)/g;

// Corpo de heredoc é conteúdo (o doc editado, o script), não comando: visto em
// 31/10/2026, um `python3 - <<'EOF'` que editava um plano citando PAINEL-40
// virou a carta da sessão. Fica só a 1ª linha, que no commit é `SIGLA-N: porquê`.
const semCorpoDeHeredoc = (c) => c.replace(RE_HEREDOC, (_, _aspa, _fim, resto, primeira) => `${resto}\n${primeira}\n`);

export function cartaDoComando(bruto, siglas = SIGLAS) {
  if (typeof bruto !== 'string') return null;
  const comando = semCorpoDeHeredoc(bruto);
  // Janela em volta do nome do script: `\S*?` sobre um heredoc sem espaço seria quadrático.
  const i = comando.indexOf('plane-testcase.mjs');
  const ponte = i < 0 ? null : comando.slice(Math.max(0, i - 400), i + 80).match(RE_PONTE);
  if (ponte) {
    const prefixo = ponte[1].replace(/^["'`]+/, '');
    return { ponte: { numero: Number(ponte[2]), script: prefixo.startsWith('/') ? path.normalize(`${prefixo}plane-testcase.mjs`) : null } };
  }
  const uuid = comando.match(RE_URL_CARTA)?.[1];
  if (uuid && UUID.test(uuid)) {
    const projeto = comando.match(RE_URL_PROJETO)?.[1];
    return { itemPlane: uuid, projetoPlane: projeto && UUID.test(projeto) ? projeto : null };
  }
  // Lista branca: `UTF-8`, `ISO-8601`, `SHA-256` e `AES-128` têm a forma de carta.
  const citadas = [...comando.matchAll(RE_SIGLA_N)].filter((m) => siglas.has(m[1]));
  return citadas.length ? { carta: `${citadas.at(-1)[1]}-${Number(citadas.at(-1)[2])}` } : null;
}

function caminhoDe(entrada) {
  const c = entrada?.file_path ?? entrada?.notebook_path ?? entrada?.path;
  return typeof c === 'string' && path.isAbsolute(c) ? path.normalize(c) : null;
}

export function acaoDaFerramenta(nome, entrada, em, siglas = SIGLAS) {
  if (typeof nome !== 'string') return null;
  if (LEITURA.has(nome)) return { em, tipo: 'ler', ferramenta: nome, caminho: caminhoDe(entrada) };
  if (EDICAO.has(nome)) return { em, tipo: 'editar', ferramenta: nome, caminho: caminhoDe(entrada) };
  if (nome === 'Bash') {
    const programa = programaDoComando(entrada?.command);
    const carta = cartaDoComando(entrada?.command, siglas);
    // Falar com o Plane (ponte ou URL) é mexer na carta; citar SIGLA-N num commit não muda o tipo.
    const tipo = carta && !carta.carta ? 'cartao' : PROVA.has(programa) ? 'testar' : 'comando';
    return { em, tipo, ferramenta: nome, programa, ...carta };
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
