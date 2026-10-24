import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { codificarPerfil } from '../orquestrador/perfil-plane.js';
import { codificarGate } from '../orquestrador/gate-plane.js';
import { criarConfirmacoesDespacho, criarApiDespacho } from '../orquestrador/api-despacho.js';
import { ErroAcesso } from '../orquestrador/sso.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const VERSAO = '2026-10-20T08:00:00Z';
const PERFIL = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const CHAVE = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const CHAVE_GATE = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const identidade = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };
const selecoes = Object.fromEntries(['orquestracao', 'codificacao_testes', 'validacao'].map(p => [p,
  { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' }]));

async function ambiente(executar, habilitado = true) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-despacho-'));
  let versaoAtual = VERSAO;
  await fs.mkdir(path.join(raiz, 'painel-admin'));
  await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify({
    versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'],
    criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
    comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }],
    agentes: [{ id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }],
  }));
  const comentarios = [{ id: PERFIL, actor: AUTOR, created_at: VERSAO,
    comment_html: codificarPerfil({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, selecoes }) },
  { id: randomUUID(), actor: AUTOR, created_at: VERSAO,
    comment_html: codificarGate({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE_GATE,
      versaoCarta: VERSAO, gate: 'READY TO DEV', justificativa: 'Escopo e dependências revisados.',
      evidencias: ['Sem dependências formais, declarado na carta.'] }) }];
  const consultar = async url => {
    if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
    if (url.includes('/work-items/?')) return { results: [{ id: CARTA, sequence_id: 99, name: 'Trabalho', parent: null,
      state: { name: 'Todo', group: 'unstarted' }, labels: [{ name: 'READY TO DEV' }],
      description_html: '<p>Sem dependências.</p>', updated_at: versaoAtual }] };
    if (url.includes('/relations/')) return { blocked_by: [] };
    if (url.includes('/comments/')) return { results: comentarios, next_page_results: false };
    if (url.endsWith(`/${CARTA}/`)) return { id: CARTA, updated_at: versaoAtual };
    throw Error(url);
  };
  let validacoes = 0;
  const executor = { validar: async ({ plano, comando }) => {
    validacoes++;
    assert.equal(plano.papeis.codificacao_testes.esforco, 'xhigh');
    assert.deepEqual(comando.argumentos, ['test']);
  }, executar };
  const escritorHandoff = async ({ html }) => {
    const id = randomUUID();
    comentarios.push({ id, actor: AUTOR, created_at: VERSAO, comment_html: html });
    return id;
  };
  const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
  const servico = criarServicoOrquestracao({ consultar, raiz, estado, escritorPerfil: async () => PERFIL,
    escritorHandoff, projetoEscrita: PROJETO, autorEscrita: AUTOR, executor, execucaoHabilitada: habilitado });
  return { raiz, comentarios, estado, servico, validacoes: () => validacoes,
    mudarVersao: valor => { versaoAtual = valor; } };
}

test('portão desligado não reserva lease nem chama executor', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; }, false);
  try {
    await assert.rejects(a.servico.validarDespacho(CARTA, 'testes', VERSAO), /desligado/);
    assert.equal((await a.servico.fila()).execucaoHabilitada, false);
    assert.equal(await a.estado.lerLease(CARTA), null);
    assert.equal(chamadas, 0);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('etiqueta isolada ou recibo de outra autoria não habilita despacho', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; });
  try {
    const pronta = (await a.servico.fila()).itens.find(x => x.id === CARTA);
    assert.equal(pronta.elegivel, true);
    assert.equal(pronta.provenienciaGate, 'verificada');
    a.comentarios.pop();
    const isolada = (await a.servico.fila()).itens.find(x => x.id === CARTA);
    assert.equal(isolada.elegivel, false);
    assert.match(isolada.motivos.join(' '), /gate sem proveniência verificável/);
    await assert.rejects(a.servico.validarDespacho(CARTA, 'testes', VERSAO), /gate sem proveniência verificável/);
    const prechecagem = await a.servico.preavaliar(CARTA, 'READY TO DEV');
    assert.match(prechecagem.ajustesDoGate.join(' '), /GATE\/v1/);
    assert.equal(prechecagem.despachoPassaria, false);
    a.comentarios.push({ id: randomUUID(), actor: randomUUID(), created_at: VERSAO,
      comment_html: codificarGate({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE_GATE,
        versaoCarta: VERSAO, gate: 'READY TO DEV', justificativa: 'Escopo e dependências revisados.',
        evidencias: ['Sem dependências formais, declarado na carta.'] }) });
    assert.equal((await a.servico.fila()).itens.find(x => x.id === CARTA).elegivel, false);
    assert.equal(chamadas, 0);
    assert.equal(await a.estado.lerLease(CARTA), null);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('despacho confirmado revalida perfil exato, registra início e resultado no card', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido',
    resumo: 'Comando de testes concluído com sucesso.', evidencia: ['Suíte unitária sem falhas'] }; });
  try {
    const confirmacoes = criarConfirmacoesDespacho({ servico: a.servico });
    const p = await confirmacoes.preparar({ carta: CARTA, comando: 'testes', versaoCarta: VERSAO }, identidade);
    assert.equal(chamadas, 0);
    assert.equal(p.plano.papeis.codificacao_testes.esforco, 'xhigh');
    await assert.rejects(confirmacoes.confirmar(p.confirmacaoId,
      { ...identidade, sessaoHash: 'b'.repeat(64) }), e => e.status === 403);
    const resultado = await confirmacoes.confirmar(p.confirmacaoId, identidade);
    assert.equal(resultado.resultado, 'concluido');
    assert.equal(chamadas, 1);
    assert.equal((await a.servico.canal(CARTA)).handoffs.length, 2);
    assert.equal(await a.estado.lerLease(CARTA), null);
    const persistido = (await a.estado.lerHistorico(CARTA)).find(e => e.tipo === 'RESULTADO_EXECUTOR');
    assert.equal(persistido?.resumo, 'Comando de testes concluído com sucesso.');
    assert.deepEqual(await confirmacoes.confirmar(p.confirmacaoId, identidade), resultado);
    assert.equal(chamadas, 1);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('concorrência permite só uma tentativa; falha depois do lançamento conserva lease para revisão', async () => {
  let liberar;
  let iniciadas = 0;
  const a = await ambiente(async () => { iniciadas++; await new Promise(r => { liberar = r; });
    throw Error('resultado do executor incerto'); });
  try {
    const primeira = a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
      perfilComentarioId: PERFIL, chaveIdempotencia: randomUUID(), usuarioId: '7' });
    while (!liberar) await new Promise(r => setTimeout(r, 5));
    await assert.rejects(a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
      perfilComentarioId: PERFIL, chaveIdempotencia: randomUUID(), usuarioId: '7' }), /lease ativo|carta impedida/);
    liberar();
    await assert.rejects(primeira, /incerto/);
    assert.equal(iniciadas, 1);
    assert.equal((await a.estado.lerLease(CARTA)).modoReal, true);
    assert.equal((await a.servico.fila()).itens.find(x => x.id === CARTA).elegivel, false);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('repetição persistida não reexecuta depois de perder a confirmação em memória', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido',
    resumo: 'Testes concluídos.', evidencia: ['Teste falso passou'] }; });
  const chaveIdempotencia = randomUUID();
  const pedido = { cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
    perfilComentarioId: PERFIL, chaveIdempotencia, usuarioId: '7' };
  try {
    const primeira = await a.servico.iniciarDespacho(pedido);
    assert.equal(primeira.resultado, 'concluido');
    const repetida = await a.servico.iniciarDespacho(pedido);
    assert.equal(repetida.duplicada, true);
    assert.equal(repetida.tentativaId, primeira.tentativaId);
    assert.equal(chamadas, 1);
    await assert.rejects(a.servico.iniciarDespacho({ ...pedido, comandoId: 'outro' }), /idempotência reutilizada/);
    assert.equal(chamadas, 1);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('card alterado após preparar cancela a confirmação sem reservar lease', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido',
    resumo: 'Não deveria executar.', evidencia: ['nenhuma'] }; });
  try {
    const confirmacoes = criarConfirmacoesDespacho({ servico: a.servico });
    const p = await confirmacoes.preparar({ carta: CARTA, comando: 'testes', versaoCarta: VERSAO }, identidade);
    a.mudarVersao('2026-10-20T08:01:00Z');
    await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, identidade), e => e.status === 422 && /carta mudou/.test(e.message));
    assert.equal(chamadas, 0);
    assert.equal(await a.estado.lerLease(CARTA), null);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('API não lê o corpo sem SSO e não aceita comando extra na confirmação', async () => {
  let leituras = 0;
  const negada = criarApiDespacho({ autorizar: async () => { throw new ErroAcesso('sem sessão', 401); }, confirmacoes: {} });
  assert.equal((await negada({ method: 'POST' }, '/api/orquestracao/despacho/preparar',
    async () => { leituras++; return '{}'; })).status, 401);
  assert.equal(leituras, 0);
  const api = criarApiDespacho({ autorizar: async () => identidade, confirmacoes: {} });
  assert.equal((await api({ method: 'POST' }, '/api/orquestracao/despacho/confirmar',
    async () => JSON.stringify({ confirmacaoId: randomUUID(), comando: 'deploy' }))).status, 422);
});
