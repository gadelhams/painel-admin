// J56 (F4a): identidades de escrita pelo catálogo — ator fixo, chave em arquivo 600 lida por operação, conferência de arranque
// (/users/me, papel Member, chaves e atores distintos) e desligamento só da identidade divergente. Plane falso; chaves falsas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { montarIdentidadesEscrita } from '../orquestrador/identidades-escrita.js';
import { criarServicoOrquestracao, criarEstadoOrquestracao } from '../orquestrador/fila.js';

const CAD = '2001df58-5cc1-44a1-8f77-035c04f5a02f';
const EMU = '87dd03dc-ff75-4b86-b265-44740e0f112e';
const CKBL = '7ce26c40-6e46-49a8-9a7d-bf06bbda6542';
const A_CAD = 'f59f036c-5bd9-4470-a17a-389511dad9a5';
const A_EMU = 'ff32ae91-bb6b-407f-bc51-8919cc932142';
const A_CKBL = '12121212-1212-4212-8212-121212121212';
const GUEST = '34343434-3434-4343-8343-343434343434';
const ZELADOR = '830e2631-de81-4871-95b7-ed9cc1774b32';
const projetos = [
  { pasta: 'CadastroUnico', sigla: 'CAD', plane: CAD, identidadeEscrita: { arquivo: 'orquestrador-cad', ator: A_CAD } },
  { pasta: 'EmuladorWeb', sigla: 'EMU', plane: EMU, identidadeEscrita: { arquivo: 'orquestrador-emu', ator: A_EMU } },
  { pasta: 'CK3BannerLord', sigla: 'CKBL', plane: CKBL, identidadeEscrita: { arquivo: 'orquestrador-ckbl', legadoEnv: '' } },
];
const fabricas = { handoff: o => ({ tipo: 'handoff', ...o }), gate: o => ({ tipo: 'gate', ...o }), estado: o => ({ tipo: 'estado', ...o }) };

// Plane falso: cada chave responde por um usuário, com o papel no projeto e no workspace.
function planeFalso(usuarios) {
  const chamadas = [];
  const fetchImpl = async (url, { headers }) => {
    const k = headers['X-API-Key'];
    chamadas.push(new URL(url).pathname);
    const u = usuarios[k];
    const json = (corpo, status = 200) => ({ status, ok: status < 300, json: async () => corpo });
    if (!u) return json({ erro: 'chave inválida' }, 401);
    if (url.endsWith('/users/me/')) return json({ id: u.id });
    if (url.endsWith('/workspaces/astargne/members/')) return u.ws === 5 ? json({ erro: 'proibido' }, 403) : json([{ id: u.id, role: u.ws }]);
    const m = /\/projects\/([0-9a-f-]{36})\/$/.exec(url);
    if (m) return json({ id: m[1], member_role: u.papel?.[m[1]] ?? null });
    return json({}, 404);
  };
  return { fetchImpl, chamadas };
}

async function cenario({ arquivos = {}, modo = 0o600, ambiente = {}, usuarios = {}, zelador = 'chave-do-zelador-0000000' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ident-'));
  for (const [nome, chave] of Object.entries(arquivos)) await fs.writeFile(path.join(dir, `${nome}.token`), `${chave}\n`, { mode: modo });
  const plane = planeFalso(usuarios);
  const r = montarIdentidadesEscrita({ projetos, ambiente: { PLANE_API_KEY: 'chave-guest-000000000000', ...ambiente }, proprietarioId: '1',
    fabricas, fetchImpl: plane.fetchImpl, diretorio: dir, atoresReservados: { zelador: ZELADOR }, chavesReservadas: async () => ({ zelador }) });
  return { ...r, dir, plane, limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}
const BASE = {
  'chave-guest-000000000000': { id: GUEST, ws: 5 },
  'chave-cad-00000000000000': { id: A_CAD, ws: 5, papel: { [CAD]: 15 } },
  'chave-emu-00000000000000': { id: A_EMU, ws: 5, papel: { [EMU]: 15 } },
};

test('J56: identidades do catálogo nascem pendentes e só escrevem depois da conferência; a chave é lida a cada operação', async () => {
  const c = await cenario({ arquivos: { 'orquestrador-cad': 'chave-cad-00000000000000', 'orquestrador-emu': 'chave-emu-00000000000000' }, usuarios: BASE });
  try {
    assert.deepEqual(Object.keys(c.identidades).sort(), [CAD, EMU].sort(), 'CKBL sem arquivo e sem .env não nasce');
    assert.equal(c.situacao(CAD).estado, 'pendente');
    await assert.rejects(c.identidades[CAD].escritorGate.chave(), /desligada/);
    const estado = await c.conferir();
    assert.equal(estado[CAD].estado, 'ok');
    assert.equal(estado[EMU].estado, 'ok');
    assert.equal(c.identidades[CAD].autorEscrita, A_CAD);
    assert.equal(await c.identidades[CAD].escritorGate.chave(), 'chave-cad-00000000000000');
    assert.equal(process.env['chave-cad-00000000000000'], undefined);
    assert.ok(!Object.values(process.env).includes('chave-cad-00000000000000'), 'a chave nunca vai para process.env');
    // Trocada no disco depois da conferência: a operação recusa até a próxima conferência.
    await fs.writeFile(path.join(c.dir, 'orquestrador-cad.token'), 'chave-cad-trocada-00000000\n', { mode: 0o600 });
    await assert.rejects(c.identidades[CAD].escritorGate.chave(), /chave mudou desde a conferência/);
  } finally { await c.limpar(); }
});

test('J56: ator divergente, papel Admin, chave repetida, ator do zelador e arquivo frouxo desligam só aquela identidade', async () => {
  const casos = [
    ['ator divergente', { usuarios: { ...BASE, 'chave-cad-00000000000000': { id: '56565656-5656-4565-8565-565656565656', ws: 5, papel: { [CAD]: 15 } } } }, /\/users\/me não bate com o ator fixo/],
    ['Admin no projeto', { usuarios: { ...BASE, 'chave-cad-00000000000000': { id: A_CAD, ws: 5, papel: { [CAD]: 20 } } } }, /papel no projeto não é Member \(20\)/],
    ['Admin no workspace', { usuarios: { ...BASE, 'chave-cad-00000000000000': { id: A_CAD, ws: 20, papel: { [CAD]: 15 } } } }, /papel no workspace acima de Member/],
    ['chave igual à Guest', { arquivos: { 'orquestrador-cad': 'chave-guest-000000000000' } }, /chave igual à de outra identidade \(guest\)/],
    ['chave igual à do zelador', { zelador: 'chave-cad-00000000000000' }, /chave igual à de outra identidade \(zelador\)/],
  ];
  for (const [nome, opcoes, motivo] of casos) {
    const c = await cenario({ arquivos: { 'orquestrador-cad': 'chave-cad-00000000000000', 'orquestrador-emu': 'chave-emu-00000000000000', ...(opcoes.arquivos ?? {}) },
      usuarios: opcoes.usuarios ?? BASE, ...(opcoes.zelador ? { zelador: opcoes.zelador } : {}) });
    try {
      const e = await c.conferir();
      assert.equal(e[CAD].estado, 'desligada', nome);
      assert.match(e[CAD].motivo, motivo, nome);
      assert.equal(e[EMU].estado, 'ok', `${nome}: a outra identidade segue`);
    } finally { await c.limpar(); }
  }
  const frouxa = await cenario({ arquivos: { 'orquestrador-cad': 'chave-cad-00000000000000' }, modo: 0o644, usuarios: BASE });
  try { assert.match((await frouxa.conferir())[CAD].motivo, /permissão frouxa/); } finally { await frouxa.limpar(); }
});

test('J56: ator do catálogo igual ao do zelador desliga; Plane fora deixa pendente (não liga nem desliga para sempre)', async () => {
  const igual = montarIdentidadesEscrita({ projetos: [{ ...projetos[0], identidadeEscrita: { arquivo: 'orquestrador-cad', ator: ZELADOR } }],
    ambiente: { PLANE_API_KEY: 'chave-guest-000000000000' }, proprietarioId: '1', fabricas, diretorio: os.tmpdir(), existe: () => true,
    lerChave: async () => 'chave-cad-00000000000000', fetchImpl: planeFalso({ ...BASE, 'chave-cad-00000000000000': { id: ZELADOR, ws: 5, papel: { [CAD]: 15 } } }).fetchImpl,
    atoresReservados: { zelador: ZELADOR } });
  assert.match((await igual.conferir())[CAD].motivo, /ator igual ao de outra identidade \(zelador\)/);
  const fora = montarIdentidadesEscrita({ projetos: [projetos[0]], ambiente: { PLANE_API_KEY: 'chave-guest-000000000000' }, proprietarioId: '1', fabricas,
    diretorio: os.tmpdir(), existe: () => true, lerChave: async () => 'chave-cad-00000000000000', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal((await fora.conferir())[CAD].estado, 'pendente');
  assert.equal(fora.identidades[CAD] !== undefined, true);
});

test('J56: CKBL legado segue pelo .env enquanto o arquivo não existe; nome fora da lista branca desliga', async () => {
  const c = await cenario({ ambiente: { PLANE_ORQ_WRITE_KEY: 'chave-ckbl-env-00000000', PLANE_ORQ_WRITE_PROJECT_ID: CKBL, PLANE_ORQ_WRITE_ACTOR_ID: A_CKBL },
    usuarios: { ...BASE, 'chave-ckbl-env-00000000': { id: A_CKBL, ws: 5, papel: { [CKBL]: 15 } } } });
  try {
    const e = await c.conferir();
    assert.equal(e[CKBL].estado, 'ok');
    assert.equal(e[CKBL].origem, 'env');
    assert.equal(c.identidades[CKBL].autorEscrita, A_CKBL);
  } finally { await c.limpar(); }
  const torto = montarIdentidadesEscrita({ projetos: [{ ...projetos[0], identidadeEscrita: { arquivo: '../zelador', ator: A_CAD } }], ambiente: {}, proprietarioId: '1', fabricas });
  assert.deepEqual(torto.identidades, {});
  assert.match(torto.situacao(CAD).motivo, /lista branca/);
});

test('J56: o serviço não entrega identidade desligada (gate, handoff e despacho somem) e diz o motivo na fila', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'ident-svc-'));
  try {
    const situacoes = { [CAD]: { estado: 'desligada', motivo: '/users/me não bate com o ator fixo' } };
    const servico = criarServicoOrquestracao({ consultar: async () => ({ results: [] }), raiz, estado: criarEstadoOrquestracao({ diretorio: raiz }),
      identidadesEscrita: { [CAD]: { autorEscrita: A_CAD, escritorHandoff: async () => 'x', escritorGate: async () => ({}) } },
      situacaoIdentidade: id => situacoes[id] ?? null, executor: { validar: async () => {} }, execucaoHabilitada: true });
    assert.equal(servico.identidade(CAD), null);
    assert.equal(servico.podeDespachar(CAD), false);
    situacoes[CAD] = { estado: 'ok' };
    assert.equal(servico.podeDespachar(CAD), true);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
