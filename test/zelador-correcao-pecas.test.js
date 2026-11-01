// Correção da F3 (varredura pré-aceite de 31/10/2026, B6–B28): peças do zelador uma a uma — escritor, trava, sessões, diário, agendador, CLI e o play pela HTTP. Sem rede, sem CLI real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TravaDisco } from '../orquestrador/trava.js';
import { InstanciaAgendador } from '../orquestrador/agendador-instancia.js';
import { DiarioZelador } from '../orquestrador/zelador-diario.js';
import { criarEscritorZelador } from '../orquestrador/escritor-zelador-plane.js';
import { RetratoCli } from '../orquestrador/retrato-cli.js';
import { ocupacaoPorSessoes } from '../coletores.js';
import { PROJETOS } from '../projetos.js';
import { criarPlaneFalso } from './fixtures/zelador/plane-falso.js';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { montarCenario, PROJETO_FALSO } from './fixtures/zelador/cenario.js';
import { tupla } from './fixtures/frota/frota.js';
import { servirComFalsos } from './painel-falso.js';

const temp = prefixo => fs.mkdtemp(path.join(os.tmpdir(), prefixo));
const P = PROJETO_FALSO;

async function escritorComPlane(opcoes = {}) {
  const dir = await temp('zel-escritor-');
  const plane = criarPlaneFalso({ projetoId: P, sigla: 'X', agora: () => Date.parse('2026-10-31T12:00:00Z') });
  const arquivoChave = path.join(dir, 'zelador.token');
  await fs.writeFile(arquivoChave, `${plane.chave}\n`, { mode: 0o600 });
  const escritor = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave, fetchImpl: plane.fetchImpl, apiBase: 'http://plane.falso', ...opcoes });
  return { dir, plane, escritor, arquivoChave, limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('B6: o escritor revalida a lista fechada — READY TO DEV, tirar PRODUTO e estado fora de Done/Cancelled são recusados sem PATCH', async () => {
  const e = await escritorComPlane();
  try {
    const carta = e.plane.novaCarta({ etiquetas: ['ASTARGNE', 'PRODUTO'] });
    for (const mudanca of [{ tipo: 'labels', adicionar: ['READY TO DEV'], remover: [] }, { tipo: 'labels', adicionar: [], remover: ['PRODUTO'] },
      { tipo: 'estado', grupo: 'started' }, { tipo: 'labels', adicionar: ['ASTARGNE'], remover: [], extra: 1 }]) {
      await assert.rejects(e.escritor.mudar({ projetoId: P, cartaId: carta.id, mudanca }), /fora da lista fechada/, JSON.stringify(mudanca));
    }
    assert.deepEqual(e.plane.escritas, []);
  } finally { await e.limpar(); }
});

test('B6: PENDENTE adulterado no índice (mudança fora da lista) não rola para a frente: resolvido só no diário', async () => {
  const c = await montarCenario({ responder: () => ({ vereditos: [] }) });
  try {
    const alvo = c.plane.novaCarta();
    const chave = 'c'.repeat(64);
    await c.zelador.diario.marcarPendente({ chave, projetoId: P, cartaId: alvo.id, carta: 'FALSO-1', veredito: 'DONO',
      mudanca: { tipo: 'labels', adicionar: ['READY TO DEV'], remover: [] }, digitalAntes: 'x', descricaoNova: null, jobId: randomUUID() });
    c.plane.comentar(alvo.id, { html: '<p>[ZELADOR/v1 veredito=DONO]</p>', autor: ZELADOR_ATOR, externalSource: 'zelador-hangar-v1', externalId: chave, quando: new Date(c.agora() - 3 * 3_600_000).toISOString() });
    await c.zelador.rodarUmaVez();
    assert.equal((await c.lerDiario()).find(l => l.tipo === 'RECONCILIADO').resultado, 'FORA_DA_LISTA');
    assert.deepEqual(c.plane.escritas, []);
    assert.deepEqual(alvo.labels, []);
  } finally { await c.limpar(); }
});

test('B8: subagente em <sessão>/subagents/ (profundidade 4) ocupa; transcript recente sem instante legível ocupa', async () => {
  const raiz = await temp('zel-sub-');
  try {
    const projeto = { pasta: 'alfa', area: 'ProjetosPessoais', plane: randomUUID(), sigla: 'ALFA' };
    const agora = Date.parse('2026-10-31T12:00:00Z');
    const sub = path.join(raiz, 'claude', 'p1', 'sessao-1', 'subagents');
    await fs.mkdir(sub, { recursive: true });
    const linha = (extra = {}) => JSON.stringify({ type: 'assistant', cwd: '/home/x', ...extra,
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(raiz, 'ProjetosPessoais', 'alfa', 'x.js') } }], stop_reason: 'tool_use' } });
    const opcoes = { projeto, raiz, agora, raizClaude: path.join(raiz, 'claude'), raizCodex: path.join(raiz, 'codex') };
    await fs.writeFile(path.join(sub, 'agent-a.jsonl'), `${linha({ timestamp: new Date(agora - 30 * 60_000).toISOString() })}\n`);
    assert.match((await ocupacaoPorSessoes(opcoes)).motivo ?? 'livre', /sessão claude tocou o projeto/);
    await fs.writeFile(path.join(sub, 'agent-a.jsonl'), `${linha()}\n`);
    assert.match((await ocupacaoPorSessoes(opcoes)).motivo ?? 'livre', /sem instante legível/);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('B18: o RESOLVIDO só entra no índice depois da linha do diário — falha no diário deixa o PENDENTE para a reconciliação', async () => {
  const dir = await temp('zel-resolver-');
  try {
    const d = new DiarioZelador({ diretorio: dir });
    await d.marcarPendente({ chave: 'k1', projetoId: 'p', cartaId: 'c', carta: 'X-1', veredito: 'FECHAR', jobId: 'j1' });
    d.anotar = async () => { throw new Error('disco cheio'); };
    await assert.rejects(d.resolver('k1', 'APLICADO'), /disco cheio/);
    assert.deepEqual((await d.pendentes()).map(p => p.chave), ['k1']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('B19: sob a trava só vão conferir + PATCH (ou só o POST); /users/me e a verificação ficam fora', async () => {
  const c = await montarCenario({ responder: (_e, { commitFeito }) => ({ vereditos: [{ carta: 'FALSO-1', veredito: 'FECHAR', evidencias: [{ tipo: 'commit', sha: commitFeito }],
    comentario: 'O trabalho está no ramo principal, conforme o commit citado.' }] }) });
  try {
    c.plane.novaCarta();
    const original = c.servico.comTrava;
    let secao = null;
    const secoes = [];
    c.servico.comTrava = acao => original(async () => { secao = []; try { return await acao(); } finally { secoes.push(secao); secao = null; } });
    const fora = [];
    c.plane.falhas.aoPedir = (metodo, caminho) => { const k = `${metodo} ${caminho.replace(/[0-9a-f-]{36}/g, ':id')}`; (secao ?? fora).push(k); };
    await c.zelador.rodarUmaVez();
    assert.equal(c.plane.cartas.values().next().value.state.group, 'completed');
    const comHttp = secoes.filter(s => s.length);
    assert.ok(comHttp.every(s => s.length <= 3), JSON.stringify(comHttp));
    assert.ok(!comHttp.flat().some(k => k.endsWith('/users/me/')), 'a identidade é conferida fora da trava');
    assert.ok(comHttp.some(s => s.at(-1).startsWith('PATCH')), 'o PATCH vai sob a trava');
    assert.ok(fora.some(k => k.startsWith('GET') && k.endsWith('/work-items/:id/')), 'a verificação relê fora da trava');
  } finally { await c.limpar(); }
});

test('B19: chamada pendurada sob a trava cai no teto curto e solta a trava', async () => {
  const e = await escritorComPlane({ timeoutSobTravaMs: 50 });
  try {
    const carta = e.plane.novaCarta();
    const fetchOriginal = e.plane.fetchImpl;
    const pendurado = (url, op = {}) => (op.method === 'PATCH'
      ? new Promise((_, rejeitar) => op.signal?.addEventListener('abort', () => rejeitar(new Error('abortado pelo teto'))))
      : fetchOriginal(url, op));
    const escritor = criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: e.arquivoChave, fetchImpl: pendurado, apiBase: 'http://plane.falso', timeoutSobTravaMs: 50 });
    const trava = new TravaDisco(e.dir);
    const corrida = escritor.mudar({ projetoId: P, cartaId: carta.id, mudanca: { tipo: 'estado', grupo: 'completed' }, sobTrava: a => trava.segurar(a) });
    const resultado = await Promise.race([corrida.then(() => 'ok', erro => `erro: ${erro.message}`), new Promise(r => setTimeout(() => r('pendurado após 2 s'), 2000))]);
    assert.match(resultado, /^erro: /);
    assert.equal(await trava.segurar(async () => 'livre'), 'livre');
  } finally { await e.limpar(); }
});

test('B20: o Plane sanitiza o HTML (nh3) — verificação da descrição e 409 do comentário comparam o que importa, não o byte', async () => {
  const e = await escritorComPlane();
  try {
    const carta = e.plane.novaCarta({ descricao: '<p>velho</p>' });
    e.plane.falhas.sanitizar = true;
    const r = await e.escritor.mudar({ projetoId: P, cartaId: carta.id, mudanca: { tipo: 'anexar', texto: "caixa d'água" }, descricaoNova: '<p>velho</p><p>caixa d&#39;água</p>' });
    assert.equal(r.conferiu, true);
    const pedido = { projetoId: P, cartaId: carta.id, html: '<p>[ZELADOR/v1 veredito=FECHAR chave=abc]</p><p>caixa d&#39;água</p>', externalId: 'd'.repeat(64) };
    assert.equal((await e.escritor.comentar(pedido)).jaExistia, false);
    assert.equal((await e.escritor.comentar(pedido)).jaExistia, true, 'o mesmo comentário sanitizado é "já gravado"');
  } finally { await e.limpar(); }
});

test('B21: instância que não tomou a trava do agendador no arranque tenta de novo e liga quando o dono antigo morre', async () => {
  const dir = await temp('zel-retoma-');
  try {
    const comTrava = acao => new TravaDisco(dir).segurar(acao);
    const vivos = new Set([111]);
    const a = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 111, processoVivo: p => vivos.has(p) });
    const b = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 222, processoVivo: p => vivos.has(p) });
    assert.equal((await a.tomar()).agenda, true);
    let ligou = 0;
    assert.equal((await b.tomarEVigiar(async () => { ligou += 1; }, 10)).agenda, false);
    vivos.delete(111);
    for (let i = 0; i < 50 && !ligou; i++) await new Promise(r => setTimeout(r, 10));
    b.pararVigia();
    assert.equal(ligou, 1);
    assert.equal(await b.podeAgendar(), true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('B22: o aviso do play lê o lease do zelador em disco — job de outra instância aparece em "em curso"', async () => {
  const alvo = PROJETOS.find(p => p.plane && !p.congelado && !['ANYA', 'CKBL'].includes(p.sigla));
  const lease = { jobId: randomUUID(), projetoId: alvo.plane, adquiridoEm: '2026-10-31T11:55:00.000Z', expiraEm: '2026-10-31T12:15:00.000Z' };
  const s = await servirComFalsos({ sementes: { [`orquestracao/zelador/lease-${alvo.plane}.json`]: lease } });
  try {
    const r = await s.pedir('GET', '/api/orquestracao/play');
    assert.equal(r.status, 200);
    assert.match(r.corpo.projetos.find(p => p.projeto === alvo.plane).emCurso ?? 'nada', /job do zelador/);
  } finally { await s.fechar(); }
});

test('B27: provedor fora do claude no bloco zelador é recusado pelo nome antes de gastar; o motivo de falha da CLI passa pelo filtro de segredo', async () => {
  const c = await montarCenario({ tuplaZelador: tupla('openai', 'high') });
  try {
    c.plane.novaCarta();
    assert.match((await c.zelador.rodarUmaVez()).motivo, /só aceita o provedor claude \(bloco zelador em openai; a CLI dele não roda sob o bwrap\)/);
    assert.equal(c.pedidos.length, 0);
  } finally { await c.limpar(); }
  const segredo = 'plane_api_0123456789abcdefABCDEF';
  const base = RetratoCli.base({ papel: 'zelador', escolha: tupla('claude', 'high'), duracaoMs: 1 });
  const claude = RetratoCli.claude(base, { codigo: 1, stdout: '', stderr: `falhou com PLANE_API_KEY=${segredo}` }, 'zelador');
  assert.doesNotMatch(claude.impedimento, /0123456789abcdef/);
  const codex = await RetratoCli.codex(base, { codigo: 1, stdout: '', stderr: `erro ${segredo}` }, 'zelador', '/nao/existe');
  assert.doesNotMatch(codex.impedimento, /0123456789abcdef/);
});

test('B28: chave do zelador igual à de um orquestrador-*.token ou do painel-admin.token é recusada (por hash, sem logar)', async () => {
  for (const vizinho of ['orquestrador-cad.token', 'painel-admin.token']) {
    const e = await escritorComPlane();
    try {
      await fs.writeFile(path.join(e.dir, vizinho), `${e.plane.chave}\n`, { mode: 0o600 });
      await assert.rejects(e.escritor.conferir(P), /igual a outra identidade/, vizinho);
      await fs.writeFile(path.join(e.dir, vizinho), 'outra-chave-qualquer-1234567\n', { mode: 0o600 });
      assert.equal(await e.escritor.conferir(P), true);
    } finally { await e.limpar(); }
  }
});
