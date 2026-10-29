import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { criarLeitorDiarioFrota } from '../orquestrador/diario-frota.js';
import { resumirCarta } from '../orquestrador/resumo-carta.js';
import { DiarioVigilia } from '../orquestrador/vigilia-diario.js';

test('JSONL: linha truncada no fim é ignorada e sinalizada; ruim no meio falha fechada', () => {
  assert.deepEqual(lerJsonl('{"a":1}\n{"a":2}\n'), { linhas: [{ a: 1 }, { a: 2 }], truncadaNoFim: false });
  assert.deepEqual(lerJsonl('{"a":1}\n{"a":'), { linhas: [{ a: 1 }], truncadaNoFim: true });
  assert.throws(() => lerJsonl('{"a":1}\n{"a":\n{"a":3}\n', 'teste'), /teste ilegível na linha 2/);
  assert.throws(() => lerJsonl('{"a":1}\n{"a":\n'), /ilegível/, 'linha ruim terminada em quebra não é escrita interrompida');
});

test('vigília: um evento cortado no fim não derruba mais o diário do projeto', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vig-'));
  const d = new DiarioVigilia({ diretorio: dir, agora: () => Date.parse('2026-10-29T12:00:00Z') });
  await d.anotar('p1', { tipo: 'TENTATIVA', cartaId: 'c1' });
  await fs.appendFile(d.eventos('p1'), '{"tipo":"TENTA');
  assert.equal(await d.tentativas24h('p1'), 1);
});

test('diário da frota: projeta despacho e vigília num formato só, só campos estruturados, filtra por carta', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frota-'));
  const carta = '11111111-1111-4111-8111-111111111111';
  await fs.writeFile(path.join(dir, 'touchpoints.jsonl'), `${JSON.stringify({ quando: '2026-10-29T10:00:00Z', tipo: 'TENTATIVA', cartaId: carta, tentativaId: 't1', prompt: 'SEGREDO no texto' })}\n`);
  await fs.mkdir(path.join(dir, 'vigilia'));
  await fs.writeFile(path.join(dir, 'vigilia', 'P1.jsonl'), `${JSON.stringify({ quando: '2026-10-29T11:00:00Z', tipo: 'AVANCO', cartaId: carta, carta: 'ALFA-1', de: 'READY TO DEV', para: 'READY TO TEST' })}\n{"quando":"2026-10-29T12:00:00Z","tipo":"ERR`);
  await fs.writeFile(path.join(dir, 'vigilia', 'P2.jsonl'), '{"ok":1}\n{ruim\n{"ok":2}\n');
  const ler = criarLeitorDiarioFrota({ diretorio: dir, projetos: [{ plane: 'P1', titulo: 'Alfa' }, { plane: 'P2', titulo: 'Beta' }] });
  const tudo = await ler();
  assert.deepEqual(tudo.eventos.map(e => [e.origem, e.tipo]), [['vigilia', 'AVANCO'], ['despacho', 'TENTATIVA']], 'mais recente primeiro; a linha "ERRO" cortada no fim não entra');
  assert.equal(JSON.stringify(tudo).includes('SEGREDO'), false, 'campo fora da lista não vaza');
  assert.match(tudo.avisos.join(' '), /vigília Beta: .*ilegível na linha 2/, 'corrupção no meio aparece, sem derrubar as outras fontes');
  assert.match(tudo.avisos.join(' '), /vigília Alfa: última linha incompleta ignorada/);
  assert.equal(tudo.eventos.find(e => e.tipo === 'AVANCO').projetoId, 'P1');
  assert.equal((await ler({ cartaId: '22222222-2222-4222-8222-222222222222' })).eventos.length, 0);
  assert.equal((await ler({ cartaId: carta })).eventos.length, 2);
});

test('resumo da carta: bloco Estado da compactação, último handoff e gate, dívida do fio', () => {
  const descricaoHtml = '<p><strong>Estado (29/10/2026):</strong> backend pronto, falta a tela.</p><p><strong>Feito e decidido</strong></p><ul><li>commit abc123</li></ul><p><strong>Para ler</strong> docs/x.md</p><p>Texto de origem longo.</p>';
  const interacoes = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, autor: 'agentes', quando: `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00Z`, texto: 'nota' }));
  const r = resumirCarta({ descricaoHtml, interacoes,
    handoffs: [{ papel: 'validacao', resultado: 'concluido', resumo: 'ok', quando: '2026-10-15T00:00:00Z' }, { papel: 'orquestracao', resultado: 'em_andamento', resumo: 'briefing', quando: '2026-10-12T00:00:00Z' }],
    gates: [{ gate: 'READY TO DEV', quando: '2026-10-11T00:00:00Z' }] });
  assert.match(r.estado, /^Estado \(29\/10\/2026\): backend pronto/);
  assert.match(r.feito, /commit abc123/);
  assert.doesNotMatch(r.estado, /Para ler|Texto de origem/, 'o bloco Estado para no próximo bloco');
  assert.equal(r.ultimoHandoff.papel, 'validacao');
  assert.equal(r.ultimoGate.gate, 'READY TO DEV');
  assert.deepEqual([r.fio.comentarios, r.fio.pedeCompactacao], [9, true]);
  const compactada = resumirCarta({ descricaoHtml: '<p>só texto</p>', interacoes: [...interacoes, { id: 'k', quando: '2026-10-19T00:00:00Z', texto: 'COMPACTADO/v1 até 2026-10-18' }] });
  assert.deepEqual([compactada.estado, compactada.descricao, compactada.fio.desdeCompactacao, compactada.fio.pedeCompactacao], [null, 'só texto', 0, false]);
});
