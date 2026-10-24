import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Protocolo cobre as seis abas sem trocar IDs nem ações', async () => {
  const html = await fs.readFile(new URL('../publico/index.html', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../publico/protocolo.css', import.meta.url), 'utf8');
  const scripts = await Promise.all(['backlog', 'decisoes', 'contas'].map(async nome => fs.readFile(new URL(`../publico/${nome}.js`, import.meta.url), 'utf8')));
  assert.ok(html.indexOf('estilo.css') < html.indexOf('protocolo.css'));
  for (const aba of ['projetos', 'backlog', 'decisoes', 'orquestracao', 'contas', 'chaves']) {
    assert.match(html, new RegExp(`id="aba-${aba}"`));
    assert.match(html, new RegExp(`data-aba="${aba}"`));
  }
  for (const seletor of ['.tira-telemetria', '.grid-backlog', '.grupo-projeto-decisoes', '.contas-secao', '.orq-projeto']) {
    assert.ok(css.includes(seletor), `${seletor} precisa do visual Protocolo`);
  }
  assert.match(css, /\[data-tema="light"\]/);
  assert.match(html, /PROTOCOLO · 01 \/ PORTFÓLIO/);
  assert.match(html, /PROTOCOLO · ORQUESTRAÇÃO/);
  for (const [indice, secao] of ['02 \/ DEMANDAS', '03 \/ DECISÕES', '05 \/ ACESSO'].entries()) {
    assert.match(scripts[indice], new RegExp(`PROTOCOLO · ${secao}`));
  }
  assert.doesNotMatch(html, /dispare um job/);
});
