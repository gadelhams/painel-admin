// PAINEL-61: o que a nave precisa para dizer que o play está ligado mas nada roda — a situação da
// instância do agendador, o próximo job (com a primeira volta logo após o arranque, contida pelo
// último job do diário) e o resumo do último job por projeto, com os PRONTA que não viraram gate.
// Sem rede, sem CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TravaDisco } from '../orquestrador/trava.js';
import { InstanciaAgendador } from '../orquestrador/agendador-instancia.js';
import { AgendadorZelador } from '../orquestrador/zelador-agendador.js';

const temp = prefixo => fs.mkdtemp(path.join(os.tmpdir(), prefixo));
const esperar = ms => new Promise(r => setTimeout(r, ms));

test('PAINEL-61: a situação da instância diz por que ela não agenda (sem flag, outro pid, arquivo perdido ou apagado)', async () => {
  const dir = await temp('zel-situacao-');
  try {
    const comTrava = acao => new TravaDisco(dir).segurar(acao);
    const sem = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: false });
    assert.deepEqual(await sem.situacao(), { agenda: false, motivo: 'ORQ_AGENDADOR ausente: esta instância não agenda vigília nem zelador' });
    const vivos = new Set([111]);
    const a = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 111, processoVivo: p => vivos.has(p) });
    const b = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 222, processoVivo: p => vivos.has(p) });
    assert.equal((await b.situacao()).agenda, false, 'antes de tentar não agenda');
    await a.tomar();
    assert.deepEqual(await a.situacao(), { agenda: true, motivo: null });
    await b.tomar();
    assert.match((await b.situacao()).motivo, /outra instância \(pid 111\)/);
    vivos.delete(111);
    await b.tomar();
    assert.deepEqual(await b.situacao(), { agenda: true, motivo: null });
    assert.deepEqual(await a.situacao(), { agenda: false, motivo: 'outro processo (pid 222) tomou o arquivo do agendador; esta instância parou de agendar' });
    await fs.rm(path.join(dir, 'agendador.json'));
    assert.deepEqual(await b.situacao(), { agenda: false, motivo: 'o arquivo do agendador sumiu ou ficou ilegível; esta instância parou de agendar (reinicie o serviço)' },
      'sem dono nenhum, não acusa outro processo');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('PAINEL-61 (V4): tentativa que lança mostra o motivo real e a vigia segue tentando', async () => {
  let falhar = true;
  const dir = await temp('zel-tentativa-');
  try {
    const comTrava = acao => (falhar ? Promise.reject(new Error('trava da orquestração ocupada')) : new TravaDisco(dir).segurar(acao));
    const i = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 333, processoVivo: () => false });
    let tomou = 0;
    const r = await i.tomarEVigiar(async () => { tomou += 1; }, 15);
    assert.equal(r.agenda, false);
    assert.equal((await i.situacao()).motivo, 'a tentativa de tomar o agendador falhou: trava da orquestração ocupada');
    falhar = false;
    await esperar(60);
    assert.equal(tomou, 1, 'a vigia tentou de novo e tomou');
    assert.deepEqual(await i.situacao(), { agenda: true, motivo: null });
    i.pararVigia();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

function agendador({ linhas = [], agora = () => Date.parse('2026-11-02T12:00:00Z'), primeiraVoltaMs = 20, intervaloMs = 60_000 } = {}) {
  const diario = { linhas: async () => ({ linhas, avisos: [] }), jobs24h: async () => 0 };
  return new AgendadorZelador({ servico: {}, play: {}, diario, leases: {}, fabricaJob: () => null, lerConsumo: async () => null,
    ocupacao: async () => ({ ocupado: false }), consultar: async () => [], intervaloMs, primeiraVoltaMs, agora });
}

test('PAINEL-61: a primeira volta sai logo após o arranque e o estado diz quando é a próxima', async () => {
  const t0 = Date.parse('2026-11-02T12:00:00Z');
  const z = agendador({ agora: () => t0 });
  let voltas = 0;
  z.rodarUmaVez = async () => { voltas += 1; return { rodou: false }; };
  assert.equal((await z.estado()).proximoEm, null, 'sem iniciar não há próximo job');
  z.iniciar(async () => true);
  z.iniciar(async () => true);
  try {
    let e = await z.estado();
    assert.equal(e.agendando, true);
    assert.equal(e.proximoEm, new Date(t0 + 20).toISOString(), 'a primeira volta é a curta, não um intervalo inteiro');
    await esperar(80);
    assert.equal(voltas, 1, 'uma volta só, mesmo com iniciar duas vezes, sem esperar o intervalo');
    e = await z.estado();
    assert.equal(e.proximoEm, new Date(t0 + 60_000).toISOString(), 'depois da volta, a próxima é um intervalo à frente');
  } finally { z.parar(); }
  const e = await z.estado();
  assert.equal(e.agendando, false);
  assert.equal(e.proximoEm, null);
});

test('PAINEL-61: reinício em laço não antecipa job; a primeira volta espera um intervalo depois do último JOB_INICIO', async () => {
  const t = Date.now();
  const linhas = [{ tipo: 'JOB_INICIO', jobId: 'j1', projetoId: 'p', quando: new Date(t - 50).toISOString() }];
  const z = agendador({ linhas, agora: Date.now, primeiraVoltaMs: 10, intervaloMs: 120 });
  let voltas = 0;
  z.rodarUmaVez = async () => { voltas += 1; return { rodou: false }; };
  z.iniciar(async () => true);
  try {
    await esperar(40);
    assert.equal(voltas, 0, 'o último job foi há 50 ms de um intervalo de 120: a primeira volta não sai');
    assert.ok(Math.abs(Date.parse((await z.estado()).proximoEm) - (t - 50 + 120)) <= 5, 'o próximo é o fim do intervalo do último job');
    await esperar(120);
    assert.equal(voltas, 1, 'passado o intervalo, a volta sai');
  } finally { z.parar(); }
});

test('PAINEL-61: parar antes da primeira volta não deixa volta pendurada', async () => {
  const z = agendador();
  let voltas = 0;
  z.rodarUmaVez = async () => { voltas += 1; return { rodou: false }; };
  z.iniciar(async () => true);
  z.parar();
  await esperar(60);
  assert.equal(voltas, 0);
});

const P = 'p-1';
const fimConcluido = (jobId, quando, abertas) => ({ tipo: 'JOB_FIM', jobId, projetoId: P, quando, resultado: 'CONCLUIDO', contagem: { aplicados: 1 },
  fim: { feita: false, abertas, emAndamento: 0, categorias: {}, soDono: false } });

test('PAINEL-61: o resumo por projeto traz a contagem e os PRONTA que não viraram gate, inclusive os rebaixados, só do último job', async () => {
  const linhas = [
    { tipo: 'JOB_INICIO', jobId: 'j1', projetoId: P, quando: '2026-11-01T15:07:52Z' },
    { tipo: 'VEREDITO', jobId: 'j1', projetoId: P, carta: 'CAD-9', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'velho' },
    fimConcluido('j1', '2026-11-01T15:10:03Z', 16),
    { tipo: 'JOB_INICIO', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:07:53Z' },
    { tipo: 'JOB_INICIO', jobId: 'outro', projetoId: 'p-2', quando: '2026-11-01T16:07:54Z' },
    { tipo: 'VEREDITO', jobId: 'outro', projetoId: 'p-2', carta: 'X-1', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'de outro projeto' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-33', veredito: 'MANTER' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-30', veredito: 'PRONTA', resultado: 'APLICADO' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-31', veredito: 'MANTER', proposto: 'PRONTA', motivo: 'comentário curto ou longo demais' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-32', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'prontidão ao vivo recusou: estado inadequado para desenvolvimento' },
    { ...fimConcluido('j2', '2026-11-01T16:09:34Z', 15), contagem: { MANTER: 9, aplicados: 1, recusados: 1 } },
  ];
  const r = (await agendador({ linhas }).estado()).porProjeto[P];
  assert.deepEqual(r, { retrato: { quando: '2026-11-01T16:09:34Z', feita: false, abertas: 15, emAndamento: 0, categorias: {}, soDono: false,
    contagem: { MANTER: 9, aplicados: 1, recusados: 1 } },
    ultimoJob: { quando: '2026-11-01T16:09:34Z', resultado: 'CONCLUIDO', inicioLido: true },
    prontaRecusadas: [
      { carta: 'CAD-31', resultado: 'REBAIXADA', motivo: 'comentário curto ou longo demais' },
      { carta: 'CAD-32', resultado: 'MANTER', motivo: 'prontidão ao vivo recusou: estado inadequado para desenvolvimento' }] });
});

test('PAINEL-61 (V5): job que termina sem fim mostra a data e o resultado dele, e as recusadas dele, sem perder as categorias do último concluído', async () => {
  const linhas = [
    { tipo: 'JOB_INICIO', jobId: 'j1', projetoId: P, quando: '2026-11-01T15:07:52Z' },
    { tipo: 'VEREDITO', jobId: 'j1', projetoId: P, carta: 'CAD-9', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'velho' },
    fimConcluido('j1', '2026-11-01T15:10:03Z', 16),
    { tipo: 'JOB_INICIO', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:07:53Z' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-32', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'recusada no job que caiu' },
    { tipo: 'JOB_FIM', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:09:00Z', resultado: 'ERRO', motivo: 'Plane 502' },
    // JOB_FIM cujo início ficou fora da janela de leitura: sem vereditos atribuídos, e a tela sabe.
    { tipo: 'JOB_FIM', jobId: 'j0', projetoId: 'p-3', quando: '2026-11-01T10:00:00Z', resultado: 'CONCLUIDO', fim: { feita: true, abertas: 0 } },
  ];
  const r = (await agendador({ linhas }).estado()).porProjeto;
  assert.equal(r[P].retrato.quando, '2026-11-01T15:10:03Z', 'o retrato e a contagem levam a data do job que os produziu');
  assert.equal(r[P].retrato.abertas, 16);
  assert.deepEqual(r[P].retrato.contagem, { aplicados: 1 });
  assert.deepEqual(r[P].ultimoJob, { quando: '2026-11-01T16:09:00Z', resultado: 'ERRO', inicioLido: true });
  assert.deepEqual(r[P].prontaRecusadas, [{ carta: 'CAD-32', resultado: 'MANTER', motivo: 'recusada no job que caiu' }]);
  assert.deepEqual(r['p-3'].ultimoJob, { quando: '2026-11-01T10:00:00Z', resultado: 'CONCLUIDO', inicioLido: false });
  assert.deepEqual(r['p-3'].prontaRecusadas, []);
});

test('PAINEL-61 (W2): job interrompido no arranque aparece como último job, com as recusadas dele', async () => {
  const linhas = [
    { tipo: 'JOB_INICIO', jobId: 'j1', projetoId: P, quando: '2026-11-01T15:07:52Z' },
    fimConcluido('j1', '2026-11-01T15:10:03Z', 16),
    { tipo: 'JOB_INICIO', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:07:53Z' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-32', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'recusada antes da queda' },
    { tipo: 'JOB_INTERROMPIDO', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:20:00Z', motivo: 'o painel caiu ou reiniciou durante o job' },
  ];
  const r = (await agendador({ linhas }).estado()).porProjeto[P];
  assert.deepEqual(r.ultimoJob, { quando: '2026-11-01T16:20:00Z', resultado: 'INTERROMPIDO', inicioLido: true });
  assert.deepEqual(r.prontaRecusadas, [{ carta: 'CAD-32', resultado: 'MANTER', motivo: 'recusada antes da queda' }]);
  assert.equal(r.retrato.quando, '2026-11-01T15:10:03Z');
});

test('PAINEL-61 (W3): parar e iniciar durante a espera da primeira volta não deixa dois laços nem volta depois do parar', async () => {
  let soltar;
  const z = agendador({ primeiraVoltaMs: 5, intervaloMs: 30 });
  let chamadas = 0;
  z.ultimoInicioMs = () => { chamadas += 1; return chamadas === 1 ? new Promise(r => { soltar = r; }) : Promise.resolve(null); };
  let voltas = 0;
  z.rodarUmaVez = async () => { voltas += 1; return { rodou: false }; };
  z.iniciar(async () => true);
  await esperar(20);
  z.parar();
  z.iniciar(async () => true);
  soltar(null);
  await esperar(100);
  z.parar();
  const ate = voltas;
  assert.ok(ate >= 2 && ate <= 5, `um laço só de 30 ms em ~95 ms (${ate} voltas)`);
  await esperar(80);
  assert.equal(voltas, ate, 'nada roda depois do parar');
});

test('PAINEL-61 (W4/W5): falha ao ligar aparece na situação; falha na soltura da trava não prende a instância', async () => {
  const dir = await temp('zel-ligar-');
  try {
    const comTrava = acao => new TravaDisco(dir).segurar(acao);
    const i = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 444, processoVivo: () => false });
    await assert.rejects(i.tomarEVigiar(async () => { throw new Error('vigília não subiu'); }, 15), /vigília não subiu/);
    assert.deepEqual(await i.situacao(), { agenda: false, motivo: 'o agendador foi tomado mas não ligou: vigília não subiu; reinicie o serviço' });
    // W5: o arquivo é gravado e só a soltura da trava lança; a vigia retoma e liga.
    let soltura = 0;
    const comTravaQueFalha = async acao => { const r = await new TravaDisco(dir).segurar(acao); soltura += 1; if (soltura === 1) throw new Error('rmdir da trava falhou'); return r; };
    const j = new InstanciaAgendador({ diretorio: dir, comTrava: comTravaQueFalha, habilitado: true, pid: 555, processoVivo: () => false });
    let ligou = 0;
    const r = await j.tomarEVigiar(async () => { ligou += 1; }, 15);
    assert.equal(r.agenda, false);
    await esperar(60);
    assert.equal(ligou, 1, 'a vigia retomou o próprio arquivo e ligou');
    assert.deepEqual(await j.situacao(), { agenda: true, motivo: null });
    j.pararVigia();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
