import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { avaliarProntidaoGate } from '../orquestrador/politica.js';
import { codificarGate, gatesDoCanal, criarEscritorGatePlane } from '../orquestrador/gate-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarConfirmacoesGate } from '../orquestrador/api-gate.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const CHAVE = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const COMENTARIO = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const LABEL = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const VERSAO = '2026-10-20T08:00:00Z';
const proposta = { gate: 'READY TO DEV', justificativa: 'Escopo e critérios revisados.', evidencias: ['Dependências concluídas no Plane'] };
const carta = { id: CARTA, labels: [], state: { group: 'unstarted', name: 'Todo' }, filhos: [], description_html: '<p>Sem dependências.</p>' };

test('prontidão do gate não é despacho; dois gates, dependência e decisão humana bloqueiam', () => {
  assert.equal(avaliarProntidaoGate(carta, { gate: proposta.gate }).pronta, true);
  assert.equal(avaliarProntidaoGate({ ...carta, labels: [{ name: 'ASTARGNE' }] }, { gate: proposta.gate }).pronta, false);
  assert.equal(avaliarProntidaoGate({ ...carta, labels: [{ name: 'READY TO TEST' }] }, { gate: proposta.gate }).pronta, false);
  assert.match(avaliarProntidaoGate(carta, { gate: proposta.gate,
    dependencias: [{ id: 'PAINEL-30', estado: 'pendente' }] }).motivos.join(' '), /PAINEL-30/);
  assert.match(avaliarProntidaoGate({ ...carta, labels: [{ name: 'READY TO DEV' }, { name: 'READY TO TEST' }] },
    { gate: proposta.gate }).motivos.join(' '), /dois gates/);
});

test('comentário de gate exige autoria esperada e evidencia versão/idempotência', () => {
  const html = codificarGate({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, ...proposta });
  const confiavel = normalizarInteracao({ id: COMENTARIO, actor: AUTOR, comment_html: html });
  const falso = normalizarInteracao({ id: OUTRO, actor: OUTRO, comment_html: html });
  assert.equal(gatesDoCanal([falso, confiavel], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR }).length, 1);
  assert.equal(gatesDoCanal([confiavel], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR })[0].gate, proposta.gate);
  assert.throws(() => gatesDoCanal([confiavel], { projetoId: OUTRO, cartaId: CARTA, autorId: AUTOR }), /não confere/);
  assert.doesNotMatch(codificarGate({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO,
    ...proposta, justificativa: '<script>alert(1)</script>' }), /<script>/);
});

test('escritor preserva etiquetas existentes e só aplica após comentário auditável', async () => {
  const outra = 'ffffffff-ffff-4fff-ffff-ffffffffffff';
  const existentes = [{ id: outra, name: 'triagem' }];
  let etiquetas = [...existentes];
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (url.includes('/labels/')) return { ok: true, json: async () => ({ results: [{ id: LABEL, name: 'READY TO DEV' }] }) };
    if (url.includes('/comments/')) return { ok: true, json: async () => ({ id: COMENTARIO, actor: AUTOR }) };
    if (opcoes.method === 'PATCH') {
      assert.deepEqual(JSON.parse(opcoes.body).labels, [outra, LABEL]);
      etiquetas = [...existentes, { id: LABEL, name: 'READY TO DEV' }];
      return { ok: true, json: async () => ({ id: CARTA }) };
    }
    return { ok: true, json: async () => ({ id: CARTA, updated_at: VERSAO, labels: etiquetas }) };
  };
  const escrever = criarEscritorGatePlane({ chave: 'segredo', projetoPermitido: PROJETO, autorEsperado: AUTOR, fetchImpl });
  await assert.rejects(escrever({ projetoId: OUTRO, cartaId: CARTA, gate: proposta.gate, html: 'x',
    chaveIdempotencia: CHAVE, versaoCarta: VERSAO }), /fora do escopo/);
  assert.equal(chamadas.length, 0);
  const resultado = await escrever({ projetoId: PROJETO, cartaId: CARTA, gate: proposta.gate, html: 'x',
    chaveIdempotencia: CHAVE, versaoCarta: VERSAO });
  assert.equal(resultado.comentarioId, COMENTARIO);
  assert.equal(chamadas.filter(x => x.opcoes.method === 'PATCH').length, 1);
  assert.ok(chamadas.every(x => !x.url.includes('segredo')));
});

test('registro do gate é idempotente; falha parcial não repete alteração', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-gate-'));
  try {
    const comentarios = [];
    let escritas = 0;
    let falhar = false;
    const consultar = async url => {
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [{ ...carta, name: 'Trabalho', sequence_id: 99, parent: null, updated_at: VERSAO }] };
      if (url.includes('/relations/')) return { blocked_by: [] };
      if (url.includes('/comments/')) return { results: comentarios, next_page_results: false };
      if (url.endsWith(`/${CARTA}/`)) return { id: CARTA, updated_at: VERSAO };
      throw Error(url);
    };
    const escritorGate = async ({ html }) => {
      escritas++;
      // Cenário C09: o comentário de evidência já foi gravado quando o PATCH falha.
      comentarios.push({ id: falhar ? randomUUID() : COMENTARIO, actor: AUTOR, comment_html: html, created_at: VERSAO });
      if (falhar) throw Error('Plane incerto');
      return { comentarioId: COMENTARIO };
    };
    const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
    const servico = criarServicoOrquestracao({ consultar, raiz, estado, escritorGate,
      projetoEscrita: PROJETO, autorEscrita: AUTOR });
    assert.equal((await servico.validarGate(CARTA, proposta)).carta, 'PAINEL-99');
    const [a, b] = await Promise.all([servico.registrarGate(CARTA, proposta, VERSAO, CHAVE),
      servico.registrarGate(CARTA, proposta, VERSAO, CHAVE)]);
    assert.deepEqual([a.duplicado, b.duplicado].sort(), [false, true]);
    assert.equal(escritas, 1);
    falhar = true;
    await assert.rejects(servico.registrarGate(CARTA, proposta, VERSAO, OUTRO), /Plane incerto/);
    await assert.rejects(servico.registrarGate(CARTA, proposta, VERSAO, OUTRO), /incerta/);
    assert.equal(escritas, 2);
    assert.equal((await estado.lerHistorico(CARTA)).filter(x => x.tipo === 'GATE_APLICADO').length, 1);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('confirmação de gate usa a proposta guardada e bloqueia sessão alheia', async () => {
  const identity = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };
  let escrita = 0;
  const c = criarConfirmacoesGate({ servico: {
    validarGate: async () => ({ carta: 'PAINEL-99', versaoCarta: VERSAO, proposta, aviso: 'confirmar' }),
    registrarGate: async () => { escrita++; return { aplicado: true }; },
  } });
  const p = await c.preparar({ carta: CARTA, proposta, versaoCarta: VERSAO }, identity);
  assert.equal(escrita, 0);
  await assert.rejects(c.confirmar(p.confirmacaoId, { ...identity, sessaoHash: 'b'.repeat(64) }), e => e.status === 403);
  assert.deepEqual(await c.confirmar(p.confirmacaoId, identity), { aplicado: true });
  assert.deepEqual(await c.confirmar(p.confirmacaoId, identity), { aplicado: true });
  assert.equal(escrita, 1);
});
