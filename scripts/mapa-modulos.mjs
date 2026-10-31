// Gera docs/mapa.md a partir do cabeçalho de cada módulo e avisa módulo grande. Não edita módulo nenhum.
//
// Convenção (desde 28/10/2026): todo módulo .js/.mjs fora de test/ e e2e/ abre
// com uma linha de comentário que diz o que faz e o que NÃO faz. O mapa é
// derivado dessa linha — nunca editado à mão — para que uma mudança simples
// comece por um arquivo curto e termine num módulo só. `--check` (no `npm test`)
// falha se o mapa commitado divergir do gerado ou se faltar cabeçalho.
//
// O que entra no mapa (31/10/2026, PAINEL-55): a primeira linha do comentário INTEIRA —
// é nela que mora o "não faz". Se ela não fecha frase (termina sem . ! ?), o texto segue
// pelas linhas seguintes até o primeiro fim de frase; o resto do comentário é do módulo.
//
// Tamanho (padroes/modulos.md, regra 8): módulo acima de LIMITE_LINHAS gera AVISO, que não
// reprova. A exceção se declara no comentário de cabeçalho, numa linha própria:
//   // exceção de tamanho: <por que é grande>; partir quando <condição>.
// Sem "partir quando" a declaração não vale e o aviso continua.
// `--raiz <dir>` confere outra árvore (o autoteste usa uma fixture temporária).

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, basename, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
export const LIMITE_LINHAS = 300;
const IGNORAR = new Set(['node_modules', 'vendor', 'docs', 'test-results', 'playwright-report', '.git', '.claude']);
const SEM_EXIGENCIA = ['test/', 'e2e/']; // testes e provas: listados, cabeçalho opcional
const RE_EXCECAO = /^exceção de tamanho:.*\bpartir quando\b/i;

function listar(raiz, dir = raiz) {
  const saida = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(ent.name)) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) saida.push(...listar(raiz, abs));
    else if (/\.(js|mjs)$/.test(ent.name)) saida.push(relative(raiz, abs).split(sep).join('/'));
  }
  return saida.sort();
}

// O bloco de comentário que abre o módulo, uma entrada por linha, sem os marcadores.
function blocoDoCabecalho(linhas) {
  const inicio = linhas.findIndex(l => l.trim() !== '' && !l.startsWith('#!'));
  if (inicio < 0) return null;
  const primeira = linhas[inicio];
  const bloco = [];
  if (primeira.startsWith('//')) {
    for (let i = inicio; i < linhas.length && linhas[i].startsWith('//'); i++) bloco.push(linhas[i].replace(/^\/\/\s?/, ''));
  } else if (primeira.startsWith('/*')) {
    for (let i = inicio; i < linhas.length; i++) {
      bloco.push(linhas[i].replace(/^\s*\/?\*+\s?/, '').replace(/\*\/\s*$/, ''));
      if (linhas[i].includes('*/')) break;
    }
  } else return null;
  return bloco;
}

function resumo(bloco) {
  const partes = [];
  for (const linha of bloco) {
    const t = linha.trim();
    if (!t) break;
    partes.push(t);
    if (partes.length === 1 && /[.!?]$/.test(t)) break;
    if (partes.length > 1) {
      const texto = partes.join(' ');
      const fim = texto.slice(partes[0].length).search(/[.!?](\s|$)/);
      if (fim >= 0) return texto.slice(0, partes[0].length + fim + 1);
    }
  }
  return partes.join(' ').replace(/\s+/g, ' ').trim() || null;
}

function ler(raiz, caminho) {
  const linhas = readFileSync(join(raiz, caminho), 'utf8').split('\n');
  const bloco = blocoDoCabecalho(linhas);
  const total = linhas.at(-1) === '' ? linhas.length - 1 : linhas.length;
  return { texto: bloco ? resumo(bloco) : null, total, excecao: Boolean(bloco?.some(l => RE_EXCECAO.test(l.trim()))) };
}

export function gerar(raiz = RAIZ) {
  const grupos = new Map();
  const semCabecalho = [];
  const grandes = [];
  for (const caminho of listar(raiz)) {
    const dir = caminho.includes('/') ? dirname(caminho) + '/' : 'raiz';
    const { texto, total, excecao } = ler(raiz, caminho);
    const exigido = !SEM_EXIGENCIA.some(p => caminho.startsWith(p));
    if (!texto && exigido) semCabecalho.push(caminho);
    if (exigido && total > LIMITE_LINHAS && !excecao) grandes.push({ caminho, total });
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
  return { conteudo: linhas.join('\n'), semCabecalho, grandes };
}

// Erros reprovam; avisos só informam. Mesma resposta para a CLI e para o autoteste.
export function conferir(raiz = RAIZ) {
  const { conteudo, semCabecalho, grandes } = gerar(raiz);
  const erros = semCabecalho.map(c => `módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz): ${c}`);
  const saida = join(raiz, 'docs', 'mapa.md');
  if ((existsSync(saida) ? readFileSync(saida, 'utf8') : '') !== conteudo) erros.push('docs/mapa.md desatualizado: rode `node scripts/mapa-modulos.mjs`');
  const avisos = grandes.map(g => `${g.caminho}: ${g.total} linhas (> ${LIMITE_LINHAS}) sem "exceção de tamanho: …; partir quando …" no cabeçalho`);
  return { erros, avisos, conteudo };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--raiz');
  const raiz = i > 0 ? resolve(process.argv[i + 1]) : RAIZ;
  if (process.argv.includes('--check')) {
    const { erros, avisos } = conferir(raiz);
    for (const a of avisos) console.log(`aviso: ${a}`);
    for (const e of erros) console.error(e);
    if (erros.length) process.exit(1);
    console.log('mapa de módulos: em dia');
  } else {
    const { conteudo, semCabecalho, grandes } = gerar(raiz);
    if (semCabecalho.length) {
      console.error('módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz):');
      for (const c of semCabecalho) console.error(`  ${c}`);
      process.exit(1);
    }
    for (const g of grandes) console.log(`aviso: ${g.caminho}: ${g.total} linhas (> ${LIMITE_LINHAS})`);
    writeFileSync(join(raiz, 'docs', 'mapa.md'), conteudo);
    console.log(`docs/mapa.md gerado (${conteudo.split('\n').length} linhas)`);
  }
}
