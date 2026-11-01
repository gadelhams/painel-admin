// Gera o mapa de módulos (índice docs/mapa.md + um arquivo por área em docs/mapa/) a partir do cabeçalho de cada módulo e avisa módulo grande. Não edita módulo nenhum.
//
// Convenção (desde 28/10/2026): todo módulo .js/.mjs fora de test/ e e2e/ abre
// com uma linha de comentário que diz o que faz e o que NÃO faz. O mapa é
// derivado dessa linha — nunca editado à mão — para que uma mudança simples
// comece por um arquivo curto e termine num módulo só. `--check` (no `npm test`)
// falha se algum arquivo do mapa divergir do gerado, se sobrar arquivo em docs/mapa/ ou se
// faltar cabeçalho.
//
// Partido por área (01/11/2026, PAINEL-56; padroes/contexto-no-codigo.md, item 3): o mapa único
// passava de 60 mil caracteres. Área é a primeira pasta; a que passa de LIMITE_MAPA vira
// `<área>-1.md`, `<área>-2.md`… O agente busca (`rg docs/mapa/`), não lê o mapa inteiro.
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

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, dirname, basename, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
export const LIMITE_LINHAS = 300;
export const LIMITE_MAPA = 10000; // caracteres por arquivo de área, como o check-docs mede
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

// Área = primeira pasta do caminho (`publico/hangar/x.js` → publico); os arquivos da raiz são a área "raiz".
const areaDe = dir => (dir === 'raiz' ? 'raiz' : dir.split('/')[0]);
const secao = (dir, itens) => [`## ${dir}`, '', ...itens.map(({ nome, texto }) => `- \`${nome}\`${texto ? ` — ${texto}` : ''}`), ''].join('\n');
const cabecaArea = rotulo => `# painel-admin — mapa: ${rotulo} (gerado)\n\nParte do [mapa de módulos](../mapa.md); gerado, não edite.\n\n`;

// Parte uma área em pedaços de até LIMITE_MAPA caracteres: seções inteiras quando cabem; seção
// maior que o limite é cortada entre módulos e repete o título.
function partir(area, secoes) {
  const folga = cabecaArea(`${area} (99 de 99)`); // o rótulo mais longo que a parte pode ganhar
  const blocos = [];
  for (const { dir, itens } of secoes) {
    if ((folga + secao(dir, itens)).length <= LIMITE_MAPA) { blocos.push({ dir, itens }); continue; }
    let atual = [];
    for (const item of itens) {
      if (atual.length && (folga + secao(dir, [...atual, item])).length > LIMITE_MAPA) { blocos.push({ dir, itens: atual }); atual = []; }
      atual.push(item);
    }
    if (atual.length) blocos.push({ dir, itens: atual });
  }
  const partes = [];
  for (const bloco of blocos) {
    const ultima = partes.at(-1);
    const corpo = b => b.map(x => secao(x.dir, x.itens)).join('\n');
    if (ultima && (folga + corpo([...ultima, bloco])).length <= LIMITE_MAPA) ultima.push(bloco);
    else partes.push([bloco]);
  }
  return partes;
}

// Um arquivo por área em docs/mapa/ (partido se passar de LIMITE_MAPA) e o índice curto em docs/mapa.md.
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
  const areas = new Map();
  for (const dir of ordem) {
    const area = areaDe(dir);
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push({ dir, itens: grupos.get(dir) });
  }
  const arquivos = {};
  const indice = [
    '# painel-admin — mapa de módulos (gerado)',
    '',
    'Gerado por `node scripts/mapa-modulos.mjs`, um arquivo por área em `mapa/`; o `npm test`',
    'falha se algum estiver desatualizado. Cada linha é o cabeçalho do próprio módulo: o que faz',
    'e o que **não** faz. Mudança simples: busque, não leia inteiro (`rg -n \'trava|lease\' docs/mapa/`),',
    'abra só esse módulo e o `test/<área>.test.js` correspondente, rode `npm test`. O porquê de',
    'cada mecanismo está em [`arquitetura.md`](arquitetura.md); o estado, em',
    '[`current.md`](current.md).',
    '',
  ];
  for (const [area, secoes] of areas) {
    const partes = partir(area, secoes);
    partes.forEach((blocos, i) => {
      const nome = partes.length === 1 ? `${area}.md` : `${area}-${i + 1}.md`;
      const rotulo = partes.length === 1 ? area : `${area} (${i + 1} de ${partes.length})`;
      arquivos[`docs/mapa/${nome}`] = cabecaArea(rotulo) + blocos.map(b => secao(b.dir, b.itens)).join('\n');
      // Pasta cortada entre partes diz de que módulo a que módulo esta parte vai.
      const cortada = dir => partes.filter(p => p.some(x => x.dir === dir)).length > 1;
      const pastas = blocos.map(({ dir, itens }) => `\`${dir}\`${cortada(dir) ? ` (\`${itens[0].nome}\` a \`${itens.at(-1).nome}\`)` : ''}`);
      indice.push(`- [\`mapa/${nome}\`](mapa/${nome}) — ${pastas.join(', ')}`);
    });
  }
  arquivos['docs/mapa.md'] = indice.join('\n') + '\n';
  return { arquivos, semCabecalho, grandes };
}

// Os .md que estão em docs/mapa/ e o gerador não produz (área que sumiu ou mudou de partes).
function sobrando(raiz, arquivos) {
  const pasta = join(raiz, 'docs', 'mapa');
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter(n => n.endsWith('.md')).map(n => `docs/mapa/${n}`).filter(f => !(f in arquivos)).sort();
}

// Grava o índice e as áreas e apaga o que sobrou de uma geração anterior.
export function escrever(raiz = RAIZ) {
  const r = gerar(raiz);
  mkdirSync(join(raiz, 'docs', 'mapa'), { recursive: true });
  for (const f of sobrando(raiz, r.arquivos)) rmSync(join(raiz, f));
  for (const [f, conteudo] of Object.entries(r.arquivos)) writeFileSync(join(raiz, f), conteudo);
  return r;
}

// Erros reprovam; avisos só informam. Mesma resposta para a CLI e para o autoteste.
export function conferir(raiz = RAIZ) {
  const { arquivos, semCabecalho, grandes } = gerar(raiz);
  const erros = semCabecalho.map(c => `módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz): ${c}`);
  for (const [f, conteudo] of Object.entries(arquivos)) {
    const saida = join(raiz, f);
    if ((existsSync(saida) ? readFileSync(saida, 'utf8') : '') !== conteudo) erros.push(`${f} desatualizado: rode \`node scripts/mapa-modulos.mjs\``);
  }
  for (const f of sobrando(raiz, arquivos)) erros.push(`${f} sobrando (o gerador não o produz): rode \`node scripts/mapa-modulos.mjs\``);
  const avisos = grandes.map(g => `${g.caminho}: ${g.total} linhas (> ${LIMITE_LINHAS}) sem "exceção de tamanho: …; partir quando …" no cabeçalho`);
  return { erros, avisos, arquivos };
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
    const { semCabecalho, grandes } = gerar(raiz);
    if (semCabecalho.length) {
      console.error('módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz):');
      for (const c of semCabecalho) console.error(`  ${c}`);
      process.exit(1);
    }
    for (const g of grandes) console.log(`aviso: ${g.caminho}: ${g.total} linhas (> ${LIMITE_LINHAS})`);
    const { arquivos } = escrever(raiz);
    console.log(`mapa gerado: docs/mapa.md + ${Object.keys(arquivos).length - 1} arquivo(s) em docs/mapa/`);
  }
}
