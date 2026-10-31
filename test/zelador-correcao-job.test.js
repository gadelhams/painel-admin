// Correção da F3 (varredura pré-aceite de 31/10/2026, B1–B26): cada teste fecha um achado no job do zelador, pelas portas reais, com Plane, CLI, sessões e relógio falsos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { montarCenario, PROJETO_FALSO } from './fixtures/zelador/cenario.js';
import { HUMANO } from './fixtures/zelador/plane-falso.js';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';

const MIN = 60_000;
const HORA = 60 * MIN;
const carta = (c, n) => [...c.plane.cartas.values()].find(x => x.sequence_id === n);
const vereditos = async c => (await c.lerDiario()).filter(l => l.tipo === 'VEREDITO').map(l => [l.carta, l.veredito, l.resultado ?? null, l.motivo ?? null]);
const fechar = (n = 1, comentario = 'O trabalho está no ramo principal, conforme o commit citado.') => (_e, { commitFeito }) => ({ vereditos: [
  { carta: `FALSO-${n}`, veredito: 'FECHAR', evidencias: [{ tipo: 'commit', sha: commitFeito }], comentario }] });
const veredito = v => () => ({ vereditos: [{ evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md' }], ...v }] });
const recibos = (c, n) => c.plane.comentarios.get(carta(c, n).id).filter(x => String(x.external_id).includes(':recibo:'));
const leaseDeDespacho = async (c, alvo) => {
  await fs.mkdir(path.join(c.diretorio, 'leases'), { recursive: true });
  await fs.writeFile(path.join(c.diretorio, 'leases', `${alvo.id}.json`), JSON.stringify({ cartaId: alvo.id, tentativaId: randomUUID(), expiraEm: new Date(c.agora() + 10 * MIN).toISOString() }));
};
const desligarPlaySemTrava = c => fs.writeFile(path.join(c.diretorio, 'play.json'), '{}');

test('B1: carta que bloqueia carta com gate de OUTRO projeto do catálogo é intocável', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    const base = c.plane.novaCarta();
    const alheia = c.planeOutro.novaCarta({ etiquetas: ['READY TO DEV'], descricao: '<p>Depende de: FALSO-1</p>' });
    c.relacionarCruzado(alheia, base);
    await c.zelador.rodarUmaVez();
    assert.deepEqual((await c.lerDiario()).filter(l => l.tipo === 'INTOCAVEL').map(l => [l.carta, l.motivo]), [['FALSO-1', 'bloqueia carta com gate']]);
    assert.deepEqual(c.plane.escritas, []);
  } finally { await c.limpar(); }
});

test('B1: fechar a carta de que uma carta de OUTRO projeto depende mudaria a prontidão dela — recusado', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    const base = c.plane.novaCarta();
    const alheia = c.planeOutro.novaCarta({ descricao: '<p>Depende de: FALSO-1</p>' });
    c.relacionarCruzado(alheia, base);
    await c.zelador.rodarUmaVez();
    const [v] = await vereditos(c);
    assert.deepEqual(v.slice(0, 3), ['FALSO-1', 'FECHAR', 'MANTER']);
    assert.match(v[3], /mudaria a prontidão de outra carta/);
    assert.equal(carta(c, 1).state.group, 'unstarted');
  } finally { await c.limpar(); }
});

test('B2: carta com DECISAO/v1 da mesa não recebe ASTARGNE; carta com aplicação pendente da mesa é intocável; mesa ilegível = intocável', async () => {
  const dono = veredito({ carta: 'FALSO-1', veredito: 'DONO', labelsTrava: ['ASTARGNE'], comentario: 'Escolher o nome público é decisão de produto do dono.' });
  let pendencias = async () => [{ identificador: 'FALSO-2', chave: 'k', etapa: 'pendente' }];
  const c = await montarCenario({ responder: dono, pendenciasMesa: () => pendencias() });
  try {
    const decidida = c.plane.novaCarta();
    c.plane.comentar(decidida.id, { html: '<p><strong>DECISAO/v1</strong> · Painel Admin (C-3PO) · decisão do dono</p><p>Decisão: segue sem trava</p>',
      autor: randomUUID(), quando: new Date(c.agora() - 72 * HORA).toISOString(), externalSource: 'painel-decisao-v1', externalId: 'd1' });
    c.plane.novaCarta();
    await c.zelador.rodarUmaVez();
    assert.deepEqual(await vereditos(c), [['FALSO-1', 'DONO', 'MANTER', 'o dono já decidiu na mesa (DECISAO/v1); o zelador não repõe ASTARGNE']]);
    assert.deepEqual((await c.lerDiario()).filter(l => l.tipo === 'INTOCAVEL').map(l => [l.carta, l.motivo]), [['FALSO-2', 'aplicação da mesa pendente na carta']]);
    assert.deepEqual(c.plane.escritas, []);
    pendencias = async () => { throw new Error('diário da mesa corrompido'); };
    c.avancar(31 * MIN);
    await c.zelador.rodarUmaVez();
    assert.deepEqual((await c.lerDiario()).filter(l => l.tipo === 'INTOCAVEL').slice(-2).map(l => l.motivo), ['pendências da mesa ilegíveis', 'pendências da mesa ilegíveis']);
  } finally { await c.limpar(); }
});

test('B3: dono reabriu uma carta Done — o zelador também não a CANCELA (nenhum estado terminal)', async () => {
  const c = await montarCenario({ responder: veredito({ carta: 'FALSO-1', veredito: 'CANCELAR', evidencias: [{ tipo: 'carta', carta: 'FALSO-2' }], comentario: 'Duplicata da FALSO-2, segundo a CLI.' }) });
  try {
    const reaberta = c.plane.novaCarta();
    c.plane.novaCarta();
    const done = c.plane.estado('Done'); const todo = c.plane.estado('Todo');
    c.plane.atividade(reaberta.id, { field: 'state', old_value: 'Done', new_value: 'Todo', old_identifier: done.id, new_identifier: todo.id, actor: HUMANO, created_at: new Date(c.agora() - 72 * HORA).toISOString() });
    await c.zelador.rodarUmaVez();
    assert.deepEqual(await vereditos(c), [['FALSO-1', 'CANCELAR', 'MANTER', 'outro ator tirou a carta de Done; o zelador não a põe em estado terminal']]);
    assert.deepEqual(c.plane.escritas, []);
  } finally { await c.limpar(); }
});

test('B4: lease de despacho aparece depois da intenção — o abortar fica só no diário local, sem recibo no Plane', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    c.plane.novaCarta();
    c.plane.falhas.depoisDoComentario = async alvo => { await leaseDeDespacho(c, alvo); c.plane.falhas.depoisDoComentario = null; };
    await c.zelador.rodarUmaVez();
    assert.deepEqual(await vereditos(c), [['FALSO-1', 'FECHAR', 'ABORTADO', 'lease de despacho apareceu na carta']]);
    assert.deepEqual(recibos(c, 1), [], 'carta ocupada não recebe comentário');
    const fim = (await c.lerDiario()).find(l => l.tipo === 'ZELADOR_ABORTADO');
    assert.equal(fim.reciboNoPlane, false);
    assert.deepEqual(await c.zelador.diario.pendentes(), []);
  } finally { await c.limpar(); }
});

test('B7: trecho que apaga um de dois marcadores humanos (ou um sem parêntese) vira MANTER, mesmo sem mudar a prontidão', async () => {
  const c = await montarCenario({ responder: () => ({ vereditos: [
    { carta: 'FALSO-1', veredito: 'ATUALIZAR', trecho: '(BLOQUEADA até o fornecedor responder)', novoTrecho: 'Fornecedor respondeu.', evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md' }], comentario: 'O fornecedor já respondeu, segundo o docs/current.md.' },
    { carta: 'FALSO-2', veredito: 'ATUALIZAR', trecho: 'ok de custo dado', novoTrecho: 'custo revisto', evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md' }], comentario: 'O custo foi revisto conforme o docs/current.md.' },
  ] }) });
  try {
    c.plane.novaCarta({ descricao: '<p>(DONO decide o nome)</p><p>(BLOQUEADA até o fornecedor responder)</p><p>Sem dependências.</p>' });
    c.plane.novaCarta({ descricao: '<p>ASTARGNE: ok de custo dado</p><p>Sem dependências.</p>' });
    await c.zelador.rodarUmaVez();
    const v = await vereditos(c);
    assert.deepEqual(v[0], ['FALSO-1', 'MANTER', null, 'o trecho toca marcador de decisão ou linha de dependência']);
    assert.deepEqual(v[1].slice(0, 3), ['FALSO-2', 'ATUALIZAR', 'MANTER']);
    assert.match(v[1][3], /marcador humano/);
    assert.deepEqual(c.plane.escritas, []);
  } finally { await c.limpar(); }
});

test('B9: sessão de IA que começa a tocar o projeto depois da escolha para o job antes da carta seguinte', async () => {
  let chamadas = 0;
  const c = await montarCenario({ responder: fechar(1), ocupacao: async () => (++chamadas > 1 ? { ocupado: true, motivo: 'sessão claude tocou o projeto nas últimas 120 min' } : { ocupado: false, motivo: null }) });
  try {
    c.plane.novaCarta();
    await c.zelador.rodarUmaVez();
    assert.ok((await c.lerDiario()).some(l => l.tipo === 'OCUPADO' && /sessão claude/.test(l.motivo)));
    assert.deepEqual(c.plane.escritas, []);
  } finally { await c.limpar(); }
});

test('B10: relações ilegíveis de uma carta do universo abortam a mudança (não escondem a prontidão dela)', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    const base = c.plane.novaCarta();
    const dependente = c.plane.novaCarta({ descricao: '<p>Depende de: FALSO-1</p>' });
    c.plane.relacionar(dependente, base);
    c.plane.falhas.relacoesFalham.add(dependente.id);
    await c.zelador.rodarUmaVez();
    const [v] = await vereditos(c);
    assert.deepEqual(v.slice(0, 3), ['FALSO-1', 'FECHAR', 'MANTER']);
    assert.match(v[3], /relações ilegíveis de FALSO-2/);
    assert.equal(carta(c, 1).state.group, 'unstarted');
  } finally { await c.limpar(); }
});

test('B13: play desligado no meio da sequência — a mudança não sai, mas o recibo de fechamento sai e o PENDENTE é resolvido', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    c.plane.novaCarta();
    c.plane.falhas.depoisDoComentario = async () => { await desligarPlaySemTrava(c); c.plane.falhas.depoisDoComentario = null; };
    await c.zelador.rodarUmaVez();
    assert.equal(carta(c, 1).state.group, 'unstarted');
    assert.deepEqual(recibos(c, 1).map(x => x.external_id.split(':').at(-1)), ['ABORTADO']);
    assert.deepEqual(await c.zelador.diario.pendentes(), []);
  } finally { await c.limpar(); }
});

test('B13: PENDENTE de projeto com play desligado é reconciliado só com recibo, sem CLI e sem mudança', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    c.plane.novaCarta();
    c.plane.falhas.mudarDepoisDoComentario = true;
    assert.equal((await c.zelador.rodarUmaVez()).resultado, 'ERRO');
    c.plane.falhas.mudarDepoisDoComentario = false;
    await c.play.alternar(PROJETO_FALSO, false, '1');
    c.avancar(31 * MIN);
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'PLAY_DESLIGADO', JSON.stringify(r));
    assert.equal(c.pedidos.length, 1, 'a CLI não roda de novo');
    assert.equal(carta(c, 1).state.group, 'unstarted');
    assert.deepEqual(recibos(c, 1).map(x => x.external_id.split(':').at(-1)), ['ABORTADO']);
    assert.deepEqual(await c.zelador.diario.pendentes(), []);
  } finally { await c.limpar(); }
});

test('B14: carta apagada com PENDENTE — resolvido só no diário ("carta sumiu"), o projeto não trava', async () => {
  const c = await montarCenario({ responder: () => ({ vereditos: [] }) });
  try {
    const sumira = c.plane.novaCarta();
    c.plane.novaCarta();
    await c.zelador.diario.marcarPendente({ chave: 'a'.repeat(64), projetoId: PROJETO_FALSO, cartaId: sumira.id, carta: 'FALSO-1', veredito: 'FECHAR',
      mudanca: { tipo: 'estado', grupo: 'completed' }, digitalAntes: 'x', descricaoNova: null, jobId: randomUUID() });
    c.plane.apagar(sumira);
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'CONCLUIDO', JSON.stringify(r));
    assert.deepEqual(await c.zelador.diario.pendentes(), []);
    assert.equal((await c.lerDiario()).find(l => l.tipo === 'RECONCILIADO').resultado, 'CARTA_SUMIU');
    assert.deepEqual(c.plane.escritas, []);
  } finally { await c.limpar(); }
});

test('B15: depois de um ABORTADO, o mesmo veredito com outra prosa ganha chave nova e aplica (sem 409 repetido)', async () => {
  let vez = 0;
  const c = await montarCenario({ responder: (e, ctx) => fechar(1, vez++ ? 'Fechada: o commit citado está no ramo principal.' : undefined)(e, ctx) });
  try {
    const alvo = c.plane.novaCarta();
    c.plane.falhas.depoisDoComentario = async x => { await leaseDeDespacho(c, x); c.plane.falhas.depoisDoComentario = null; };
    await c.zelador.rodarUmaVez();
    await fs.rm(path.join(c.diretorio, 'leases', `${alvo.id}.json`));
    c.avancar(31 * MIN);
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'CONCLUIDO', JSON.stringify(r));
    assert.deepEqual((await vereditos(c)).map(v => v[2]), ['ABORTADO', 'APLICADO']);
    assert.equal(carta(c, 1).state.group, 'completed');
    const intencoes = c.plane.comentarios.get(alvo.id).filter(x => !String(x.external_id).includes(':recibo:'));
    assert.equal(new Set(intencoes.map(x => x.external_id)).size, 2, 'cada tentativa tem a sua chave');
  } finally { await c.limpar(); }
});

test('B16: o zelador aplicou e o dono desfez antes do recibo — o recibo diz "aplicada e desfeita", não "não aplicada"', async () => {
  const c = await montarCenario({ responder: fechar(1) });
  try {
    const alvo = c.plane.novaCarta();
    c.plane.falhas.antesDoComentario = async (_c, corpo) => { if (corpo.external_id.includes(':recibo:')) throw new Error('queda antes do recibo'); };
    assert.equal((await c.zelador.rodarUmaVez()).resultado, 'ERRO');
    c.plane.falhas.antesDoComentario = null;
    c.avancar(10 * MIN);
    const done = c.plane.estado('Done'); const todo = c.plane.estado('Todo');
    alvo.state = { ...todo };
    c.plane.atividade(alvo.id, { field: 'state', old_value: 'Done', new_value: 'Todo', old_identifier: done.id, new_identifier: todo.id, actor: HUMANO });
    c.avancar(21 * MIN);
    await c.zelador.rodarUmaVez();
    const [recibo] = recibos(c, 1);
    assert.match(recibo.external_id, /:recibo:DESFEITO$/);
    assert.match(recibo.comment_html, /aplicada e depois desfeita por outro ator/);
    assert.equal(carta(c, 1).state.group, 'unstarted', 'o zelador não refaz');
  } finally { await c.limpar(); }
});

test('B17/B26: DIVERGENTE com o POST do recibo falhando — o play já fica suspenso, e a reconciliação grava o recibo sem pagar CLI', async () => {
  const c = await montarCenario({ responder: veredito({ carta: 'FALSO-1', veredito: 'DONO', labelsTrava: ['TAREFA DONO'], comentario: 'Testar no aparelho real é tarefa de mãos do dono.' }) });
  try {
    c.plane.novaCarta();
    c.plane.falhas.verificacaoMente = true;
    c.plane.falhas.antesDoComentario = async (_c, corpo) => { if (corpo.external_id.includes(':recibo:')) throw new Error('queda no recibo'); };
    assert.equal((await c.zelador.rodarUmaVez()).resultado, 'ERRO');
    assert.equal((await c.play.estado()).projetos[0].situacao, 'suspenso', 'a divergência não se perde com o recibo');
    c.plane.falhas.antesDoComentario = null;
    c.avancar(31 * MIN);
    await c.zelador.rodarUmaVez();
    assert.deepEqual(recibos(c, 1).map(x => x.external_id.split(':').at(-1)), ['DIVERGENTE']);
    assert.deepEqual(await c.zelador.diario.pendentes(), []);
    assert.equal(c.pedidos.length, 1);
  } finally { await c.limpar(); }
});

test('B26: recibo DIVERGENTE achado na reconciliação suspende o play e o job para antes do retrato e da CLI', async () => {
  const c = await montarCenario({ responder: () => ({ vereditos: [] }) });
  try {
    const alvo = c.plane.novaCarta();
    const chave = 'b'.repeat(64);
    await c.zelador.diario.marcarPendente({ chave, projetoId: PROJETO_FALSO, cartaId: alvo.id, carta: 'FALSO-1', veredito: 'DONO',
      mudanca: { tipo: 'labels', adicionar: ['TAREFA DONO'], remover: [] }, digitalAntes: 'x', descricaoNova: null, jobId: randomUUID() });
    for (const id of [chave, `${chave}:recibo:DIVERGENTE`]) c.plane.comentar(alvo.id, { html: '<p>[ZELADOR/v1 recibo=DIVERGENTE]</p>', autor: ZELADOR_ATOR, externalSource: 'zelador-hangar-v1', externalId: id, quando: new Date(c.agora() - 3 * HORA).toISOString() });
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'PLAY_DESLIGADO', JSON.stringify(r));
    assert.equal(c.pedidos.length, 0, 'suspensão na reconciliação não paga CLI');
    assert.equal((await c.play.estado()).projetos[0].situacao, 'suspenso');
  } finally { await c.limpar(); }
});

test('B23/B24: play desligado entre a escolha e o job sai como PLAY_DESLIGADO; suspender com play desligado fica registrado', async () => {
  let c;
  c = await montarCenario({ responder: fechar(1), ocupacao: async () => { await c.play.alternar(PROJETO_FALSO, false, '1'); return { ocupado: false, motivo: null }; } });
  try {
    c.plane.novaCarta();
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'PLAY_DESLIGADO', JSON.stringify(r));
    assert.equal(await c.play.suspender(PROJETO_FALSO, 'divergência na verificação de FALSO-1'), false);
    const historico = (await fs.readFile(path.join(c.diretorio, 'play-historico.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(historico.at(-1).tipo, 'SUSPENSAO_SEM_PLAY');
    assert.equal(historico.at(-1).play, 'desligado');
  } finally { await c.limpar(); }
});
