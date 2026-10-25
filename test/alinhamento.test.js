// Rotina de alinhamento com Plane, git e portão de docs FALSOS. Nada toca a
// rede nem repositórios reais.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { criarAlinhamento, medirFio, LIMIAR_FIO, MARCA_COMPACTADO } from '../alinhamento.js';

const c = (quando, html = '<p>selo</p>') => ({ created_at: quando, comment_html: html });

test('medirFio: conta desde o último COMPACTADO/v1; sem marca conta tudo', () => {
  const f = medirFio([c('2026-10-01'), c('2026-10-02'), c('2026-10-03', `<p>${MARCA_COMPACTADO} até 02/10</p>`), c('2026-10-04'), c('2026-10-05')]);
  assert.deepEqual([f.total, f.desdeCompactado, f.compactadoEm, f.ultimoEm], [5, 2, '2026-10-03', '2026-10-05']);
  assert.equal(medirFio([c('2026-10-01')]).compactadoEm, null);
});

async function ambiente() {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'alinh-'));
  const dir = path.join(raiz, 'ProjetosPessoais', 'Proj');
  await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(dir, 'docs', 'current.md'), '# Proj — estado real (01/09/2026)\n\nFalta PRJ-1 e PRJ-2.\nPRJ-3 selada em 01/10.\n');
  await fs.writeFile(path.join(dir, 'README.md'), '# Proj');
  const projetos = [
    { pasta: 'Proj', area: 'ProjetosPessoais', titulo: 'Proj', plane: 'p1', portas: [] },
    { pasta: 'Gelo', area: 'ProjetosPessoais', titulo: 'Gelo', congelado: true, portas: [] },
    { pasta: 'Sumiu', area: 'ProjetosPessoais', titulo: 'Sumiu', portas: [] },
  ];
  const issue = (id, seq, type, name, updatedAt = '2026-10-26T00:00:00Z') => ({ id, identifier: `PRJ-${seq}`, title: 't', url: `u/${seq}`, project: { id: 'p1' }, state: { type, name }, updatedAt });
  const plane = { issues: [issue('i1', 1, 'completed', 'Done'), issue('i2', 2, 'started', 'In Progress'), issue('i3', 3, 'completed', 'Done', '2026-10-01T00:00:00Z'), issue('i4', 4, 'backlog', 'Backlog')] };
  const comentarios = { i1: [c('2026-10-25')], i2: Array.from({ length: LIMIAR_FIO }, (_, k) => c(`2026-10-${10 + k}`)), i3: [c('2026-09-30')], i4: [] };
  const chamadas = [];
  const consultarPlane = async (caminho) => { const id = /issues\/([^/]+)\/comments/.exec(caminho)[1]; chamadas.push(id); return { results: comentarios[id], next_page_results: false }; };
  const git = async (d, ...args) => {
    if (args[0] === 'log') return '2026-10-20';
    if (args[0] === 'rev-list') return '2\t0';
    throw new Error('x');
  };
  const al = criarAlinhamento({ projetos, raiz, diretorioEstado: path.join(raiz, 'estado'), dirDe: (p) => path.join(raiz, p.area, p.pasta), lerPlane: async () => plane, consultarPlane, git, portaoDocs: async () => 1, agora: () => Date.parse('2026-10-26T12:00:00Z'), log: () => {} });
  return { raiz, al, chamadas, plane, dir };
}

test('varredura: sinais por projeto, congelado fora, fios medidos uma vez e cache por updatedAt', async () => {
  const { raiz, al, chamadas } = await ambiente();
  try {
    const r = await al.varrer();
    assert.equal(r.projetos.some((p) => p.pasta === 'Gelo'), false, 'congelado fica de fora');
    const proj = r.projetos.find((p) => p.pasta === 'Proj');
    const tipos = proj.sinais.map((s) => s.tipo).sort();
    assert.deepEqual(tipos, ['check_docs', 'cita_fechado', 'current_atras', 'fio_longo', 'selado_sem_compactar', 'sem_push']);
    assert.match(proj.sinais.find((s) => s.tipo === 'cita_fechado').texto, /PRJ-1 como pendente, mas está Done/);
    assert.equal(proj.sinais.filter((s) => s.tipo === 'cita_fechado').length, 1, 'PRJ-3 citado como selado não é dívida');
    assert.equal(proj.sinais.find((s) => s.tipo === 'fio_longo').carta, 'PRJ-2');
    assert.equal(proj.sinais.find((s) => s.tipo === 'selado_sem_compactar').carta, 'PRJ-1', 'PRJ-3 selado antes da regra fica de fora');
    assert.match(proj.sinais.find((s) => s.tipo === 'sem_push').texto, /2 commit/);
    assert.deepEqual(proj.docs, { funcional: 'README.md', arquitetural: null, tecnica: 'docs/current.md', contrato: null });
    assert.deepEqual(chamadas.sort(), ['i1', 'i2', 'i3', 'i4'], 'comentários de cada carta uma vez');
    const r2 = await al.varrer();
    assert.deepEqual(chamadas.length, 4, 'segunda varredura não refaz fios (updatedAt igual)');
    assert.equal(r2.total >= 1, true);
    const sumiu = r2.projetos.find((p) => p.pasta === 'Sumiu');
    assert.equal(sumiu.sinais[0].tipo, 'catalogo');
    const lido = await al.ler();
    assert.equal(lido.varridoEm, r2.varridoEm);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
