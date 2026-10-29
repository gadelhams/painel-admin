import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('aba tem tópicos, canal Plane, seleção por papel e confirmação separada', async () => {
  const html = await fs.readFile(new URL('../publico/index.html', import.meta.url), 'utf8');
  const modulos = ['orquestracao/nucleo.js', 'orquestracao/demanda-prontidao.js', 'orquestracao/demanda-portao.js', 'orquestracao/demanda-historico.js', 'orquestracao/demanda-carta.js', 'orquestracao/fila-filtro.js', 'orquestracao/fila-lista.js', 'orquestracao/fila-triagem.js', 'orquestracao/fila.js', 'orquestracao/despacho.js', 'orquestracao/gate.js', 'orquestracao/conversa-canal.js', 'orquestracao/conversa-handoff.js', 'orquestracao/conversa.js', 'orquestracao/modelos-seletores.js', 'orquestracao/modelos-confirmacao.js', 'orquestracao/modelos.js', 'orquestracao/vigilia-desenho.js', 'orquestracao/vigilia-confirmacao.js', 'orquestracao/vigilia.js', 'orquestracao/consumo.js', 'orquestracao/voz-carta.js', 'orquestrador.js'];
  const partes = await Promise.all(modulos.map(nome => fs.readFile(new URL(`../publico/${nome}`, import.meta.url), 'utf8')));
  const js = partes.join('\n');
  let cursor = -1;
  for (const nome of modulos) {
    const i = html.indexOf(nome, cursor + 1);
    assert.ok(i > cursor, nome);
    cursor = i;
  }
  const servidor = await fs.readFile(new URL('../servidor.js', import.meta.url), 'utf8');
  const rotas = await fs.readFile(new URL('../http/rotas-orquestracao.js', import.meta.url), 'utf8');
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
  assert.match(rotas, /escrita e execução indisponíveis nesta etapa/);
  assert.doesNotMatch(js, /innerHTML|eval\(/);
});
