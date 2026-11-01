#!/usr/bin/env node
// check-docs v1.6 (29/10/2026; v1.5 de 25/10, v1 de 30/09) — portão de documentação do padrão de contexto
// por tarefa (~/Work/PADROES-CONTEXTO.md). Cópia canônica: ~/Work/ferramentas/.
// Cada repo leva uma cópia (scripts/check-docs.mjs) e a liga ao seu portão.
//
// Confere, na pasta do projeto (argumento ou cwd):
//   1. existência dos arquivos obrigatórios;
//   2. teto de caracteres dos arquivos de entrada (caracteres, não tokens:
//      medida reproduzível — a mesma justificativa do LoreEngine);
//   3. links markdown relativos em README/CLAUDE/AGENTS, nas `entradas` extras e
//      nas `pastas` de docs (padrão: docs/**/*.md);
//   4. rotas em crase do AGENTS.md (`docs/x.md`, `scripts/y.sh`…) — o
//      original do LoreEngine não conferia estas;
//   5. doc órfão nas pastas de docs (ninguém aponta para ele) — AVISO, não reprova;
//   6. ADRs sem índice (docs/adr/ sem README.md ou index.md) — AVISO;
//   7. (v1.6, opcional) teto do acervo: aviso e reprovação por tamanho.
// Configuração opcional em check-docs.json na raiz do projeto:
//   { "obrigatorios": [...], "tetos": {"AGENTS.md": 5000}, "ignorar": ["docs/historico"] }
// v1.6 — chaves novas, todas opcionais; sem elas o comportamento é o da v1.5:
//   "entradas": ["PADROES-*.md"]  arquivos extras cujos links se conferem;
//   "pastas":   ["docs", "padroes"]  pastas de docs (substitui o padrão ["docs"]);
//   "tetos":    {"padroes/*.md": 5000}  chave com * vale para cada arquivo que casa
//               (o * não cruza /);
//   "acervo":   {"aviso": 15000, "teto": 30000, "excecoes": {"x.md": "nota do dono"}}
//               mede todo .md conferido que não tem teto próprio; a exceção exige nota.
// Nasceu para a raiz do ~/Work conferir os masters (PADROES-*.md) e os temas em padroes/.
// Sai com 1 em qualquer reprovação; avisos não mudam o código de saída.
// v1.3: a guarda de CLI comparava import.meta.url com `file://${argv[1]}`, que
// nunca casa com espaço no caminho (a URL vem com %20): a CLI saía 0 sem
// conferir nada. Agora usa pathToFileURL.
// v1.4: rota em crase com ../ (master do servidor, padrões) era pulada; agora
// precisa existir, como link para fora da raiz.
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PADRAO = {
  obrigatorios: ['CLAUDE.md', 'AGENTS.md', 'docs/current.md'],
  tetos: { 'CLAUDE.md': 1000, 'AGENTS.md': 5000, 'docs/current.md': 2500, 'docs/invariants.md': 3500 },
  ignorar: ['docs/historico', 'node_modules', '.git'],
};

const RE_LINK = /\]\(([^)\s]+)\)/g;
// Rota em crase: só caminho relativo de documento (.md). Pastas de dados e
// scripts citados em crase (`artifacts/`, `scripts/x.sh`) podem não existir
// num clone limpo — não são rota de leitura.
// Rota em crase pode ter espaço no nome (ex.: `docs/Entendimento da Mecânica - X.md`).
const RE_CRASE = /`([^`]+)`/g;
const RE_ROTA = /^(?![a-z]+:)(?:[\w. -]+\/)*[\w. -]+\.md$/;

const ehPadrao = (chave) => chave.includes('*');
function casaPadrao(padrao, rel) {
  const re = new RegExp(`^${padrao.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
  return re.test(rel);
}

// Arquivos .md da pasta do padrão (só o nível do padrão: `padroes/*.md` não desce).
async function expandir(padrao, raiz) {
  const pasta = dirname(padrao);
  const dir = join(raiz, pasta);
  if (!existsSync(dir)) return [];
  const achados = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = pasta === '.' ? e.name : `${pasta}/${e.name}`;
    if (e.isFile() && casaPadrao(padrao, rel)) achados.push(rel);
  }
  return achados.sort();
}

async function listarMd(dir, raiz, ignorar) {
  const achados = [];
  if (!existsSync(dir)) return achados;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name);
    const rel = relative(raiz, caminho).split(sep).join('/');
    if (ignorar.some((i) => rel === i || rel.startsWith(`${i}/`))) continue;
    if (e.isDirectory()) achados.push(...(await listarMd(caminho, raiz, ignorar)));
    else if (e.name.endsWith('.md')) achados.push(rel);
  }
  return achados;
}

export async function verificar(raiz = process.cwd()) {
  raiz = resolve(raiz);
  const config = existsSync(join(raiz, 'check-docs.json'))
    ? JSON.parse(await readFile(join(raiz, 'check-docs.json'), 'utf8'))
    : {};
  const obrigatorios = config.obrigatorios ?? PADRAO.obrigatorios;
  const tetos = { ...PADRAO.tetos, ...(config.tetos ?? {}) };
  const ignorar = [...PADRAO.ignorar, ...(config.ignorar ?? [])];
  const pastas = config.pastas ?? ['docs'];
  const erros = [];
  const avisos = [];
  const medidas = [];

  for (const f of obrigatorios) if (!existsSync(join(raiz, f))) erros.push(`falta o arquivo obrigatório ${f}`);

  const comTeto = new Set();
  for (const [chave, teto] of Object.entries(tetos)) {
    const arquivos = ehPadrao(chave) ? await expandir(chave, raiz) : [chave];
    for (const f of arquivos) {
      if (!existsSync(join(raiz, f))) continue;
      comTeto.add(f);
      const n = (await readFile(join(raiz, f), 'utf8')).length;
      medidas.push(`${f}: ${n}/${teto} caracteres`);
      if (n > teto) erros.push(`${f}: ${n} caracteres excedem o teto de ${teto}`);
    }
  }

  const extras = [];
  for (const e of config.entradas ?? []) extras.push(...(ehPadrao(e) ? await expandir(e, raiz) : [e]));
  const entrada = [...new Set([...['README.md', 'CLAUDE.md', 'AGENTS.md'], ...extras])].filter((f) => existsSync(join(raiz, f)));
  const docs = [];
  for (const p of pastas) for (const d of await listarMd(join(raiz, p), raiz, ignorar)) if (!docs.includes(d) && !entrada.includes(d)) docs.push(d);
  const referenciados = new Set();

  // Acervo (v1.6): o doc sem teto próprio também tem tamanho máximo, quando o
  // projeto liga a regra. Acima do aviso, avisa; acima do teto, reprova, salvo
  // exceção com a nota do dono no check-docs.json.
  if (config.acervo) {
    const { aviso = 15000, teto = 30000, excecoes = {} } = config.acervo;
    for (const f of [...entrada, ...docs]) {
      if (comTeto.has(f)) continue;
      const n = (await readFile(join(raiz, f), 'utf8')).length;
      const nota = typeof excecoes[f] === 'string' && excecoes[f].trim();
      if (n > teto && !nota) erros.push(`${f}: ${n} caracteres excedem o teto do acervo de ${teto} (exceção só com nota do dono em acervo.excecoes)`);
      else if (n > aviso) avisos.push(`${f}: ${n} caracteres passam do aviso do acervo de ${aviso}${nota ? ' (exceção do dono)' : ''}`);
    }
  }

  for (const f of [...entrada, ...docs]) {
    const texto = await readFile(join(raiz, f), 'utf8');
    for (const m of texto.matchAll(RE_LINK)) {
      const alvo = decodeURIComponent(m[1].split('#')[0]); // links com %20
      if (!alvo || /^[a-z]+:/i.test(alvo)) continue;
      const abs = resolve(raiz, dirname(f), alvo);
      // Fora do repositório (../../PADROES-X.md) só precisa existir — e no CI o
      // workspace da raiz não está no checkout: lá é aviso, não erro.
      const fora = relative(raiz, abs).startsWith('..');
      if (!existsSync(abs)) (fora && process.env.CI ? avisos : erros).push(`${f}: ${fora && process.env.CI ? 'link para fora do repositório não conferível no CI' : 'link quebrado'} → ${alvo}`);
      else referenciados.add(relative(raiz, abs).split(sep).join('/'));
    }
    if (f === 'AGENTS.md') {
      for (const m of texto.matchAll(RE_CRASE)) {
        const rota = m[1];
        if (!RE_ROTA.test(rota)) continue;
        const abs = resolve(raiz, rota);
        if (!existsSync(abs)) (rota.startsWith('../') && process.env.CI ? avisos : erros).push(`AGENTS.md: ${rota.startsWith('../') && process.env.CI ? 'rota para fora do repositório não conferível no CI' : 'rota em crase não existe'} → ${rota}`);
        else if (!rota.startsWith('../')) referenciados.add(relative(raiz, abs).split(sep).join('/'));
      }
    }
  }

  // Link para uma pasta (ex.: `docs/adr/`) cobre tudo dentro dela.
  const pastasReferenciadas = [];
  for (const r of referenciados) if ((await stat(join(raiz, r))).isDirectory()) pastasReferenciadas.push(r);
  for (const d of docs) {
    const coberto = referenciados.has(d) || pastasReferenciadas.some((p) => d.startsWith(`${p}/`));
    if (!coberto && !/(^|\/)(README|index)\.md$/.test(d)) avisos.push(`doc órfão (ninguém aponta para ele): ${d}`);
  }
  if (existsSync(join(raiz, 'docs/adr')) && !existsSync(join(raiz, 'docs/adr/README.md')) && !existsSync(join(raiz, 'docs/adr/index.md'))) {
    avisos.push('docs/adr/ sem índice (README.md ou index.md)');
  }

  return { erros, avisos, medidas, total: entrada.length + docs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await verificar(process.argv[2]);
  for (const m of r.medidas) console.log(m);
  for (const a of r.avisos) console.log(`aviso: ${a}`);
  for (const e of r.erros) console.error(`ERRO: ${e}`);
  console.log(`Documentação: ${r.total} arquivos, ${r.erros.length} erro(s), ${r.avisos.length} aviso(s).`);
  process.exit(r.erros.length ? 1 : 0);
}
