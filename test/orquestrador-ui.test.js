import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('aba tem tópicos, canal Plane, seleção por papel e confirmação separada', async () => {
  const html = await fs.readFile(new URL('../publico/index.html', import.meta.url), 'utf8');
  const js = await fs.readFile(new URL('../publico/orquestrador.js', import.meta.url), 'utf8');
  const servidor = await fs.readFile(new URL('../servidor.js', import.meta.url), 'utf8');
  for (const id of ['aba-orquestracao', 'orq-cartas', 'orq-conversa', 'orq-modelos', 'orq-consumo', 'orq-historico',
    'orq-preparar-modelos', 'orq-confirmacao-modelos', 'orq-triagem-carregar', 'orq-categoria']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const topico of ['demanda', 'conversa', 'modelos', 'consumo', 'historico']) {
    assert.match(html, new RegExp(`data-orq-topico="${topico}"`));
  }
  assert.match(js, /\/api\/orquestracao\/canal/);
  assert.match(js, /\/api\/orquestracao\/modelos\/validar/);
  assert.match(js, /\/api\/orquestracao\/modelos\/preparar/);
  assert.match(js, /\/api\/orquestracao\/modelos\/confirmar/);
  assert.match(js, /\/api\/orquestracao\/triagem-dev/);
  assert.match(servidor, /criarTriagemDev/);
  assert.match(html, /Categoria <select/);
  for (const classe of ['orq-seletor-provedor', 'orq-seletor-modelo', 'orq-seletor-esforco']) {
    assert.match(js, new RegExp(classe));
  }
  assert.match(servidor, /criarAutorizador/);
  assert.match(js, /percentual/);
  assert.match(js, /agentesDisponiveis/);
  assert.match(js, /Agentes disponíveis/);
  assert.match(js, /Responsável pela tentativa/);
  assert.match(servidor, /escrita e execução indisponíveis nesta etapa/);
  assert.doesNotMatch(js, /innerHTML|eval\(/);
});
