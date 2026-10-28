// Gramática estática do scripts.test e dos scripts do contrato. Não prova que o conteúdo é seguro.

import fs from 'node:fs/promises';
import path from 'node:path';

const PROIBIDO_EM_SCRIPT = /\b(ssh|scp|rsync|docker|sudo|steam|proton|deploy|curl|wget)\b|\bgit\s+push\b|\brm\s+-rf\b/i;
const INICIOS_DE_SEGMENTO = new Set(['node', 'npm', 'npx', 'vitest', 'tsc', 'oxlint', 'eslint', 'python', 'python3', 'pytest']);
const METACARACTERES = /[|;<>`$()]|(?<!&)&(?!&)/;

export function validarScriptNpm(scripts, nome = 'test', profundidade = 0) {
  const linha = scripts?.[nome];
  if (typeof linha !== 'string' || !linha.trim()) throw new Error(`package.json sem scripts.${nome}`);
  if (profundidade > 3) throw new Error('scripts npm aninhados além de três níveis');
  if (METACARACTERES.test(linha)) throw new Error(`scripts.${nome} usa metacaractere de shell`);
  const proibido = PROIBIDO_EM_SCRIPT.exec(linha);
  if (proibido) throw new Error(`scripts.${nome} contém token proibido: ${proibido[0]}`);
  for (const segmento of linha.split('&&').map(s => s.trim()).filter(Boolean)) {
    const [primeiro, segundo, terceiro] = segmento.split(/\s+/);
    if (!INICIOS_DE_SEGMENTO.has(primeiro)) throw new Error(`scripts.${nome}: executável não permitido: ${primeiro}`);
    if (primeiro === 'npm') {
      if (segundo === 'test') { if (nome !== 'test') validarScriptNpm(scripts, 'test', profundidade + 1); continue; }
      if (segundo !== 'run' || !terceiro) throw new Error(`scripts.${nome}: só 'npm test' ou 'npm run <script>' são aceitos`);
      validarScriptNpm(scripts, terceiro, profundidade + 1);
    }
  }
  return linha;
}

export async function inspecionarComando(pasta, comando) {
  if (comando.executavel === 'npm') {
    let pacote;
    try { pacote = JSON.parse(await fs.readFile(path.join(pasta, 'package.json'), 'utf8')); }
    catch { throw new Error('package.json ausente ou ilegível para npm test'); }
    return `npm test → ${validarScriptNpm(pacote.scripts)}`;
  }
  const arquivo = comando.argumentos.at(-1);
  let conteudo;
  try { conteudo = await fs.readFile(path.join(pasta, arquivo), 'utf8'); }
  catch { throw new Error(`script do contrato ausente: ${arquivo}`); }
  const proibido = PROIBIDO_EM_SCRIPT.exec(conteudo);
  if (proibido) throw new Error(`script ${arquivo} contém token proibido: ${proibido[0].trim()}`);
  return `${comando.executavel} ${comando.argumentos.join(' ')} (${conteudo.length} bytes inspecionados)`;
}
