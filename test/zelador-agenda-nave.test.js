// PAINEL-61: o que a nave precisa para dizer que o play está ligado mas nada roda — a situação da
// instância do agendador, o próximo job (com a primeira volta logo após o arranque) e o resumo do
// último job por projeto, com os PRONTA que não viraram gate. Sem rede, sem CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TravaDisco } from '../orquestrador/trava.js';
import { InstanciaAgendador } from '../orquestrador/agendador-instancia.js';
import { AgendadorZelador } from '../orquestrador/zelador-agendador.js';

const temp = prefixo => fs.mkdtemp(path.join(os.tmpdir(), prefixo));

test('PAINEL-61: a situação da instância diz por que ela não agenda (sem flag, outro pid, arquivo perdido)', async () => {
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
    assert.deepEqual(await a.situacao(), { agenda: false, motivo: 'outro processo tomou o arquivo do agendador; esta instância parou de agendar' });
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
  try {
    let e = await z.estado();
    assert.equal(e.agendando, true);
    assert.equal(e.proximoEm, new Date(t0 + 20).toISOString(), 'a primeira volta é a curta, não um intervalo inteiro');
    await new Promise(r => setTimeout(r, 80));
    assert.equal(voltas, 1, 'a primeira volta rodou sem esperar os 60 s do intervalo');
    e = await z.estado();
    assert.equal(e.proximoEm, new Date(t0 + 60_000).toISOString(), 'depois da volta, a próxima é um intervalo à frente');
  } finally { z.parar(); }
  const e = await z.estado();
  assert.equal(e.agendando, false);
  assert.equal(e.proximoEm, null);
});

test('PAINEL-61: parar antes da primeira volta não deixa volta pendurada', async () => {
  const z = agendador();
  let voltas = 0;
  z.rodarUmaVez = async () => { voltas += 1; return { rodou: false }; };
  z.iniciar(async () => true);
  z.parar();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(voltas, 0);
});

test('PAINEL-61: o resumo por projeto traz a contagem e os PRONTA que não viraram gate, só do último job', async () => {
  const P = 'p-1';
  const linhas = [
    { tipo: 'JOB_INICIO', jobId: 'j1', projetoId: P, quando: '2026-11-01T15:07:52Z' },
    { tipo: 'VEREDITO', jobId: 'j1', projetoId: P, carta: 'CAD-9', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'velho' },
    { tipo: 'JOB_FIM', jobId: 'j1', projetoId: P, quando: '2026-11-01T15:10:03Z', resultado: 'CONCLUIDO', contagem: { aplicados: 4 }, fim: { feita: false, abertas: 16 } },
    { tipo: 'JOB_INICIO', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:07:53Z' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-33', veredito: 'MANTER' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-30', veredito: 'PRONTA', resultado: 'APLICADO' },
    { tipo: 'VEREDITO', jobId: 'j2', projetoId: P, carta: 'CAD-32', veredito: 'PRONTA', resultado: 'MANTER', motivo: 'prontidão ao vivo recusou: estado inadequado para desenvolvimento' },
    { tipo: 'JOB_FIM', jobId: 'j2', projetoId: P, quando: '2026-11-01T16:09:34Z', resultado: 'CONCLUIDO', contagem: { MANTER: 9, aplicados: 1, recusados: 1 },
      fim: { feita: false, abertas: 15, emAndamento: 0, categorias: {}, soDono: false } },
  ];
  const r = (await agendador({ linhas }).estado()).porProjeto[P];
  assert.deepEqual(r, { quando: '2026-11-01T16:09:34Z', feita: false, abertas: 15, emAndamento: 0, categorias: {}, soDono: false,
    contagem: { MANTER: 9, aplicados: 1, recusados: 1 },
    prontaRecusadas: [{ carta: 'CAD-32', resultado: 'MANTER', motivo: 'prontidão ao vivo recusou: estado inadequado para desenvolvimento' }] });
});
