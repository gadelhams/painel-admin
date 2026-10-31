// Autoteste do portão do mapa (padroes/testes.md, regra 4): a ferramenta tem de morder. Cada caso
// monta uma árvore temporária e confere o que reprova e o que só avisa, pela função e pela CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { conferir, gerar, LIMITE_LINHAS } from '../scripts/mapa-modulos.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'scripts', 'mapa-modulos.mjs');

async function fixture(arquivos) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'mapa-fixture-'));
  await fs.mkdir(path.join(raiz, 'docs'));
  for (const [nome, texto] of Object.entries(arquivos)) {
    await fs.mkdir(path.dirname(path.join(raiz, nome)), { recursive: true });
    await fs.writeFile(path.join(raiz, nome), texto);
  }
  return raiz;
}

const cli = raiz => spawnSync(process.execPath, [SCRIPT, '--check', '--raiz', raiz], { encoding: 'utf8' });
const corpo = n => Array.from({ length: n }, (_, i) => `export const c${i} = ${i};`).join('\n') + '\n';

test('módulo sem cabeçalho reprova, pela função e pela CLI (saída 1)', async () => {
  const raiz = await fixture({ 'a.js': '// Faz A. Não faz B.\nexport const a = 1;\n', 'area/b.js': 'export const b = 2;\n' });
  try {
    await fs.writeFile(path.join(raiz, 'docs', 'mapa.md'), gerar(raiz).conteudo);
    assert.deepEqual(conferir(raiz).erros, ['módulo sem cabeçalho (primeira linha deve dizer o que faz e o que não faz): area/b.js']);
    const r = cli(raiz);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /area\/b\.js/);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('mapa desatualizado reprova; regenerado, passa', async () => {
  const raiz = await fixture({ 'a.js': '// Faz A. Não faz B.\nexport const a = 1;\n' });
  try {
    await fs.writeFile(path.join(raiz, 'docs', 'mapa.md'), gerar(raiz).conteudo);
    assert.equal(cli(raiz).status, 0);
    await fs.writeFile(path.join(raiz, 'novo.js'), '// Faz N. Não faz M.\n');
    assert.deepEqual(conferir(raiz).erros, ['docs/mapa.md desatualizado: rode `node scripts/mapa-modulos.mjs`']);
    assert.equal(cli(raiz).status, 1);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('o mapa leva a primeira linha inteira (o "não faz"); linha sem fim de frase segue até o primeiro ponto', async () => {
  const raiz = await fixture({
    'a.js': '// Porta da fila. A leitura mora ao lado; não decide nada.\n// Detalhe do módulo que fica fora.\n',
    'b.js': '// Começa aqui e\n// termina na segunda linha. Esta frase não entra.\n// Nem esta.\n',
  });
  try {
    const { conteudo } = gerar(raiz);
    assert.match(conteudo, /- `a\.js` — Porta da fila\. A leitura mora ao lado; não decide nada\.\n/);
    assert.match(conteudo, /- `b\.js` — Começa aqui e termina na segunda linha\.\n/);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test(`módulo acima de ${LIMITE_LINHAS} linhas só avisa; a exceção declarada com "partir quando" cala o aviso`, async () => {
  const raiz = await fixture({
    'grande.js': `// Grande sem declaração. Não faz nada.\n${corpo(LIMITE_LINHAS)}`,
    'declarado.js': `// Grande declarado. Não faz nada.\n// exceção de tamanho: catálogo de dados; partir quando ganhar lógica.\n${corpo(LIMITE_LINHAS)}`,
    'meia.js': `// Declaração sem condição. Não faz nada.\n// exceção de tamanho: é grande e pronto.\n${corpo(LIMITE_LINHAS)}`,
    'limite.js': `// No limite. Não faz nada.\n${corpo(LIMITE_LINHAS - 1)}`,
    'test/x.test.js': corpo(LIMITE_LINHAS + 5),
  });
  try {
    await fs.writeFile(path.join(raiz, 'docs', 'mapa.md'), gerar(raiz).conteudo);
    const { erros, avisos } = conferir(raiz);
    assert.deepEqual(erros, []);
    assert.deepEqual(avisos, [
      `grande.js: ${LIMITE_LINHAS + 1} linhas (> ${LIMITE_LINHAS}) sem "exceção de tamanho: …; partir quando …" no cabeçalho`,
      `meia.js: ${LIMITE_LINHAS + 2} linhas (> ${LIMITE_LINHAS}) sem "exceção de tamanho: …; partir quando …" no cabeçalho`,
    ]);
    const r = cli(raiz);
    assert.equal(r.status, 0, 'aviso não reprova');
    assert.match(r.stdout, /aviso: grande\.js/);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
