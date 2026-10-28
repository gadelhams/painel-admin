// Gera docs/mapa.md a partir do cabeçalho de cada módulo. Não edita módulo nenhum.
//
// Convenção (desde 28/10/2026): todo módulo .js/.mjs fora de test/ e e2e/ abre
// com uma linha de comentário que diz o que faz e o que NÃO faz. O mapa é
// derivado dessa linha — nunca editado à mão — para que uma mudança simples
// comece por um arquivo curto e termine num módulo só. `--check` (no `npm test`)
// falha se o mapa commitado divergir do gerado ou se faltar cabeçalho.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SAIDA = join(RAIZ, 'docs', 'mapa.md');
const IGNORAR = new Set(['node_modules', 'vendor', 'docs', 'test-results', 'playwright-report', '.git']);
const SEM_EXIGENCIA = ['test/', 'e2e/']; // testes e provas: listados, cabeçalho opcional

function listar(dir) {
  const saida = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(ent.name)) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) saida.push(...listar(abs));
    else if (/\.(js|mjs)$/.test(ent.name)) saida.push(relative(RAIZ, abs).split(sep).join('/'));
  }
  return saida.sort();
}

function cabecalho(caminho) {
  const linhas = readFileSync(join(RAIZ, caminho), 'utf8').split('\n');
  const inicio = linhas.findIndex(l => l.trim() !== '' && !l.startsWith('#!'));
  if (inicio < 0) return null;
  const primeira = linhas[inicio];
  let bloco;
  if (primeira.startsWith('//')) {
    bloco = [];
    for (let i = inicio; i < linhas.length && linhas[i].startsWith('//'); i++) bloco.push(linhas[i].replace(/^\/\/\s?/, ''));
  } else if (primeira.startsWith('/*')) {
    bloco = [];
    for (let i = inicio; i < linhas.length; i++) {
      bloco.push(linhas[i].replace(/^\s*\/?\*+\s?/, '').replace(/\*\/\s*$/, ''));
      if (linhas[i].includes('*/')) break;
    }
  } else return null;
  // Só a primeira frase: o cabeçalho é um resumo, o resto do comentário é do módulo.
  const texto = bloco.join(' ').replace(/\s+/g, ' ').trim();
  const fim = texto.search(/[.!?](\s|$)/);
  return fim >= 0 ? texto.slice(0, fim + 1) : texto;
}

export function gerar() {
  const grupos = new Map();
  const semCabecalho = [];
  for (const caminho of listar(RAIZ)) {
    const dir = caminho.includes('/') ? dirname(caminho) + '/' : 'raiz';
    const texto = cabecalho(caminho);
    if (!texto && !SEM_EXIGENCIA.some(p => caminho.startsWith(p))) semCabecalho.push(caminho);
    if (!grupos.has(dir)) grupos.set(dir, []);
    grupos.get(dir).push({ nome: basename(caminho), texto });
  }
  const ordem = [...grupos.keys()].sort((a, b) => (a === 'raiz' ? -1 : b === 'raiz' ? 1 : a.localeCompare(b)));
  const linhas = [
    '# painel-admin — mapa de módulos (gerado)',
    '',
    'Gerado por `node scripts/mapa-modulos.mjs`; o `npm test` falha se este arquivo',
    'estiver desatualizado. Cada linha é o cabeçalho do próprio módulo: o que faz e',
    'o que **não** faz. Mudança simples: ache a responsabilidade aqui, abra só esse',
    'módulo e o `test/<área>.test.js` correspondente, rode `npm test`. O porquê de',
    'cada mecanismo está em [`arquitetura.md`](arquitetura.md); o estado, em',
    '[`current.md`](current.md).',
    '',
  ];
  for (const dir of ordem) {
    linhas.push(`## ${dir}`, '');
    for (const { nome, texto } of grupos.get(dir)) linhas.push(`- \`${nome}\`${texto ? ` — ${texto}` : ''}`);
    linhas.push('');
  }
  return { conteudo: linhas.join('\n'), semCabecalho };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { conteudo, semCabecalho } = gerar();
  if (semCabecalho.length) {
    console.error('módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz):');
    for (const c of semCabecalho) console.error(`  ${c}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    const atual = existsSync(SAIDA) ? readFileSync(SAIDA, 'utf8') : '';
    if (atual !== conteudo) {
      console.error('docs/mapa.md desatualizado: rode `node scripts/mapa-modulos.mjs`');
      process.exit(1);
    }
    console.log('mapa de módulos: em dia');
  } else {
    writeFileSync(SAIDA, conteudo);
    console.log(`docs/mapa.md gerado (${conteudo.split('\n').length} linhas)`);
  }
}
