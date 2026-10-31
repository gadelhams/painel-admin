// CSS partido por aba (PAINEL-51): todo .css de publico/ é carregado, todo <link> existe, toda classe do HTML tem dono e tokens só em tokens.css. Não confere cascata nem visual.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Por que estes testes existem: em 31/10/2026 estilo.css e protocolo.css viraram
// tokens.css + base.css + um arquivo por aba. Arquivo que ninguém carrega, <link>
// para arquivo que sumiu ou regra que ficou para trás num corte apagam o visual
// de uma aba sem erro nenhum no console — só se nota olhando.

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'publico');

function listar(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'vendor') return [];
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? listar(abs, ext) : e.name.endsWith(ext) ? [abs] : [];
  });
}

const paginas = listar(PUBLICO, '.html');
const folhas = listar(PUBLICO, '.css');

// CSS de cada página, na ordem dos <link rel="stylesheet">, com o caminho resolvido.
function folhasDaPagina(html) {
  const texto = fs.readFileSync(html, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return [...texto.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(([tag]) => {
    const href = tag.match(/href="([^"]+)"/)[1].split('?')[0];
    return path.resolve(path.dirname(html), href);
  });
}

function semComentarios(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

// Classes que aparecem em algum seletor (o texto antes de cada "{", fora de @-regras).
function classesComRegra(css) {
  const donos = new Set();
  for (const [, cab] of semComentarios(css).matchAll(/([^{}]+)\{/g)) {
    if (cab.trim().startsWith('@')) continue;
    for (const [, nome] of cab.matchAll(/\.([a-zA-Z_][\w-]*)/g)) donos.add(nome);
  }
  return donos;
}

function classesDoHtml(html) {
  const texto = fs.readFileSync(html, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return new Set([...texto.matchAll(/\bclass="([^"]*)"/g)].flatMap(([, v]) => v.split(/\s+/).filter(Boolean)));
}

// <style> embutido na página também é dono (c3po/vozes.html só tem esse).
function cssEmbutido(html) {
  return [...fs.readFileSync(html, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join('\n');
}

// Classes do HTML que já não tinham regra antes da partição: rótulos de seção cujo
// visual vem pelo id (#aba-hangar, #aba-chaves, #aba-docs). Classe nova sem regra
// entra aqui com motivo; a que ganhar regra tem de sair (o teste avisa).
const SEM_REGRA = new Map([
  ['index.html', new Set(['hg', 'chaves', 'docs'])],
]);

test('todo <link rel="stylesheet"> aponta para arquivo que existe', () => {
  for (const html of paginas) {
    for (const css of folhasDaPagina(html)) {
      assert.ok(fs.existsSync(css), `${path.relative(PUBLICO, html)} carrega ${path.relative(PUBLICO, css)}, que não existe`);
    }
  }
});

test('todo .css de publico/ é carregado por alguma página', () => {
  const carregadas = new Set(paginas.flatMap(folhasDaPagina));
  for (const css of folhas) {
    assert.ok(carregadas.has(css), `${path.relative(PUBLICO, css)} não é carregado por nenhum HTML de publico/`);
  }
});

test('nenhuma classe do HTML ficou sem dono nos CSS que a página carrega', () => {
  for (const html of paginas) {
    const rel = path.relative(PUBLICO, html).split(path.sep).join('/');
    const fontes = [...folhasDaPagina(html).map(css => fs.readFileSync(css, 'utf8')), cssEmbutido(html)];
    const donos = new Set(fontes.flatMap(css => [...classesComRegra(css)]));
    const excecoes = SEM_REGRA.get(rel) ?? new Set();
    const orfas = [...classesDoHtml(html)].filter(c => !donos.has(c) && !excecoes.has(c));
    assert.deepEqual(orfas, [], `${rel}: classe sem regra em nenhum CSS carregado`);
    for (const c of excecoes) assert.ok(!donos.has(c), `${rel}: "${c}" ganhou regra; tire-a de SEM_REGRA`);
  }
});

test('fontes e variáveis de tema só em tokens.css', () => {
  const TOKEN = /(^|[;{\s])(--(?:ui|color|font|space|hg)-[\w-]+|--(?:ok|alerta|falha|ideia))\s*:/;
  for (const css of folhas) {
    const nome = path.relative(PUBLICO, css).split(path.sep).join('/');
    if (nome === 'tokens.css' || nome.startsWith('c3po/')) continue;
    const texto = semComentarios(fs.readFileSync(css, 'utf8'));
    assert.ok(!/@font-face/.test(texto), `${nome} declara @font-face`);
    assert.ok(!/:root\b/.test(texto), `${nome} declara :root`);
    assert.ok(!TOKEN.test(texto), `${nome} declara variável de tema: ${texto.match(TOKEN)?.[2]}`);
  }
  const index = folhasDaPagina(path.join(PUBLICO, 'index.html')).map(f => path.basename(f));
  assert.equal(index[0], 'tokens.css', 'tokens.css vem antes de todo outro CSS');
});
