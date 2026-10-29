import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { criarLeitorDiarioFrota } from '../orquestrador/diario-frota.js';
import { resumirCarta } from '../orquestrador/resumo-carta.js';
import { DiarioVigilia } from '../orquestrador/vigilia-diario.js';
import { DiarioTouchpoints } from '../orquestrador/diario-touchpoints.js';
import { DiarioChaves } from '../chaves/eventos.js';

test('JSONL: linha truncada no fim é ignorada e sinalizada; ruim no meio falha fechada', () => {
  assert.deepEqual(lerJsonl('{"a":1}\n{"a":2}\n'), { linhas: [{ a: 1 }, { a: 2 }], truncadaNoFim: false, truncadasNoMeio: 0 });
  assert.deepEqual(lerJsonl('{"a":1}\n{"a":'), { linhas: [{ a: 1 }], truncadaNoFim: true, truncadasNoMeio: 0 });
  assert.throws(() => lerJsonl('{"a":1}\n{"a":\n{"a":3}\n', 'teste'), /teste ilegível na linha 2/);
  assert.throws(() => lerJsonl('{"a":1}\n{"a":\n'), /ilegível/, 'linha ruim terminada em quebra não é escrita interrompida');
});

test('vigília: um evento cortado no fim não derruba mais o diário do projeto', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vig-'));
  const d = new DiarioVigilia({ diretorio: dir, agora: () => Date.parse('2026-10-29T12:00:00Z') });
  await d.anotar('p1', { tipo: 'TENTATIVA', cartaId: 'c1' });
  await fs.appendFile(d.eventos('p1'), '{"tipo":"TENTA');
  assert.equal(await d.tentativas24h('p1'), 1);
  // J-F: o acréscimo seguinte não cola na cauda cortada; a linha nova sobrevive e o diário segue legível.
  await d.anotar('p1', { tipo: 'TENTATIVA', cartaId: 'c2' });
  assert.equal(await d.tentativas24h('p1'), 2);
  assert.deepEqual((await d.linhas('p1')).map(e => e.cartaId), ['c1', 'c2']);
});

test('J-F: anexarJsonl separa a cauda cortada; só a linha ruim logo antes de um registro marcado é tolerada', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-'));
  const arq = path.join(dir, 'x.jsonl');
  await anexarJsonl(arq, { n: 1 });
  await fs.appendFile(arq, '{"n":2,"cort');
  await anexarJsonl(arq, { n: 3 });
  const lido = lerJsonl(await fs.readFile(arq, 'utf8'));
  assert.deepEqual(lido.linhas, [{ n: 1 }, { n: 3 }]);
  assert.equal(lido.truncadasNoMeio, 1);
  assert.throws(() => lerJsonl('{"n":1}\n{"n":\n{"n":3}\n'), /ilegível na linha 2/, 'linha ruim sem a marca do acréscimo continua falhando fechada');
  assert.throws(() => lerJsonl('{"n":1}\n{"n":\n{"n":2}\n{"n":3,"_aposTruncada":true}\n'), /ilegível na linha 2/, 'a marca só vale para a linha logo antes');
  for (const [nome, ArquivoLog] of [['touchpoints', DiarioTouchpoints]]) {
    const log = new ArquivoLog({ diretorio: dir, agora: () => 0 });
    await log.anotar({ tipo: 'A', cartaId: 'k' });
    await fs.appendFile(path.join(dir, 'touchpoints.jsonl'), '{"tipo":"B"');
    await log.anotar({ tipo: 'C', cartaId: 'k' });
    assert.deepEqual((await log.daCarta('k')).map(e => e.tipo), ['A', 'C'], nome);
  }
  await fs.rm(dir, { recursive: true, force: true });
});

test('N4b: falha dupla — cauda cortada e a escrita de recuperação também cortada — não fecha o diário para sempre', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl2-'));
  const arq = path.join(dir, 'x.jsonl');
  await anexarJsonl(arq, { n: 1 });
  await fs.appendFile(arq, '{"n":2,"cort');
  await fs.appendFile(arq, '\n{"_aposTruncada":true,"n":3,"tamb');
  const meio = lerJsonl(await fs.readFile(arq, 'utf8'));
  assert.deepEqual(meio.linhas, [{ n: 1 }]);
  assert.equal(meio.truncadaNoFim, true);
  assert.equal(meio.truncadasNoMeio, 1);
  await anexarJsonl(arq, { n: 4 });
  const fim = lerJsonl(await fs.readFile(arq, 'utf8'));
  assert.deepEqual(fim.linhas, [{ n: 1 }, { n: 4 }]);
  assert.equal(fim.truncadasNoMeio, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test('N4a/N4c: a perda deixa rastro no diário da frota; o diário de chaves usa o mesmo acréscimo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl3-'));
  await anexarJsonl(path.join(dir, 'touchpoints.jsonl'), { quando: '2026-10-29T10:00:00Z', tipo: 'TENTATIVA', cartaId: 'c' });
  await fs.appendFile(path.join(dir, 'touchpoints.jsonl'), '{"tipo":"RESUL');
  await anexarJsonl(path.join(dir, 'touchpoints.jsonl'), { quando: '2026-10-29T10:01:00Z', tipo: 'RESULTADO', cartaId: 'c' });
  const d = await criarLeitorDiarioFrota({ diretorio: dir, projetos: [] })();
  assert.equal(d.eventos.length, 2);
  assert.match(d.avisos.join(' '), /despacho: 1 linha\(s\) de escrita interrompida ignorada\(s\) no meio/);
  const chaves = new DiarioChaves({ diretorioEstado: dir, agora: () => 0 });
  await chaves.anotar({ tipo: 'TROCA', nome: 'X' });
  await fs.appendFile(path.join(dir, 'chaves.jsonl'), '{"tipo":"TRO');
  await chaves.anotar({ tipo: 'TROCA', nome: 'Y' });
  assert.deepEqual((await chaves.ler()).map(e => e.nome), ['X', 'Y']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('diário da frota: projeta despacho e vigília num formato só, só campos estruturados, filtra por carta', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'frota-'));
  const carta = '11111111-1111-4111-8111-111111111111';
  await fs.writeFile(path.join(dir, 'touchpoints.jsonl'), `${JSON.stringify({ quando: '2026-10-29T10:00:00Z', tipo: 'TENTATIVA', cartaId: carta, tentativaId: 't1', prompt: 'SEGREDO no texto' })}\n`
    + `${JSON.stringify({ quando: '2026-10-29T09:00:00Z', tipo: 'RESULTADO_EXECUTOR', cartaId: carta, tentativaId: 't0', resultado: 'impedido', frotaVersao: 3, causa: { tipo: 'limite', provedor: 'claude' }, resumo: 'SEGREDO do modelo' })}\n`);
  await fs.mkdir(path.join(dir, 'vigilia'));
  await fs.writeFile(path.join(dir, 'vigilia', 'P1.jsonl'), `${JSON.stringify({ quando: '2026-10-29T11:00:00Z', tipo: 'AVANCO', cartaId: carta, carta: 'ALFA-1', de: 'READY TO DEV', para: 'READY TO TEST' })}\n{"quando":"2026-10-29T12:00:00Z","tipo":"ERR`);
  await fs.writeFile(path.join(dir, 'vigilia', 'P2.jsonl'), '{"ok":1}\n{ruim\n{"ok":2}\n');
  const ler = criarLeitorDiarioFrota({ diretorio: dir, projetos: [{ plane: 'P1', titulo: 'Alfa' }, { plane: 'P2', titulo: 'Beta' }] });
  const tudo = await ler();
  assert.deepEqual(tudo.eventos.map(e => [e.origem, e.tipo]), [['vigilia', 'AVANCO'], ['despacho', 'TENTATIVA'], ['despacho', 'RESULTADO_EXECUTOR']], 'mais recente primeiro; a linha "ERRO" cortada no fim não entra');
  // J-L5: a versão da frota e a causa do impedido entram; o resumo do modelo não.
  const r = tudo.eventos.find(e => e.tipo === 'RESULTADO_EXECUTOR');
  assert.equal(r.frotaVersao, 3);
  assert.equal(r.causa, 'limite');
  assert.equal(JSON.stringify(tudo).includes('SEGREDO'), false, 'campo fora da lista não vaza');
  assert.match(tudo.avisos.join(' '), /vigília Beta: .*ilegível na linha 2/, 'corrupção no meio aparece, sem derrubar as outras fontes');
  assert.match(tudo.avisos.join(' '), /vigília Alfa: última linha incompleta ignorada/);
  assert.equal(tudo.eventos.find(e => e.tipo === 'AVANCO').projetoId, 'P1');
  assert.equal((await ler({ cartaId: '22222222-2222-4222-8222-222222222222' })).eventos.length, 0);
  assert.equal((await ler({ cartaId: carta })).eventos.length, 3);
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
