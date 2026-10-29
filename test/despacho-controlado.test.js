import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { gravarFrota, conteudoFrota, tupla } from './fixtures/frota/frota.js';
import { ArquivoFrota } from '../orquestrador/frota.js';
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
// O PERFIL-IA/v1 antigo no card pede esforço `low`; a frota pede `xhigh`. Desde a F2
// (29/10/2026) só a frota vale (J2): o perfil aparece como "ignorado".
const perfilLegado = Object.fromEntries(['orquestracao', 'codificacao_testes', 'validacao'].map(p => [p,
  { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'low' }]));
const comentarioPerfil = () => `<p>[ORQ/v1 papel=decisao] PERFIL-IA/v1 ${Buffer.from(JSON.stringify({ versao: 1, projetoId: PROJETO,
  cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, selecoes: perfilLegado })).toString('base64url')}</p>`;
const FROTA_OPENAI = conteudoFrota({ orquestracao: tupla('openai'), codificacao_testes: tupla('openai'), validacao: tupla('openai') });

async function ambiente(executar, habilitado = true, { frota = FROTA_OPENAI, agentes = null, aoValidar = null } = {}) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-despacho-'));
  let versaoAtual = VERSAO;
  await fs.mkdir(path.join(raiz, 'painel-admin'));
  await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify({
    versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'],
    criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
    comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }],
    agentes: agentes ?? [{ id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }],
  }));
  const comentarios = [{ id: PERFIL, actor: AUTOR, created_at: VERSAO,
    comment_html: comentarioPerfil() },
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
  const planosExecutados = [];
  const executor = { validar: async ({ plano, comando }) => {
    validacoes++;
    if (aoValidar) await aoValidar(validacoes);
    assert.equal(plano.papeis.codificacao_testes.esforco, 'xhigh');
    assert.deepEqual(comando.argumentos, ['test']);
  }, executar: async (pedido) => { planosExecutados.push(pedido.plano); return executar(pedido); } };
  const escritorHandoff = async ({ html }) => {
    const id = randomUUID();
    comentarios.push({ id, actor: AUTOR, created_at: VERSAO, comment_html: html });
    return id;
  };
  const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
  const frotaGravada = frota ? await gravarFrota(path.join(raiz, 'estado'), frota) : null;
  const servico = criarServicoOrquestracao({ consultar, raiz, estado,
    escritorHandoff, projetoEscrita: PROJETO, autorEscrita: AUTOR, executor, execucaoHabilitada: habilitado });
  return { raiz, comentarios, estado, servico, validacoes: () => validacoes, frota: frotaGravada, planosExecutados,
    frotaPedido: { frotaVersao: frotaGravada?.versao, frotaHash: frotaGravada?.hash },
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

test('despacho confirmado usa a frota (não o perfil antigo), registra início e resultado no card', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido',
    resumo: 'Comando de testes concluído com sucesso.', evidencia: ['Suíte unitária sem falhas'] }; });
  try {
    const confirmacoes = criarConfirmacoesDespacho({ servico: a.servico });
    const p = await confirmacoes.preparar({ carta: CARTA, comando: 'testes', versaoCarta: VERSAO }, identidade);
    assert.equal(chamadas, 0);
    assert.equal(p.plano.papeis.codificacao_testes.esforco, 'xhigh');
    assert.equal(p.frota.versao, 1);
    assert.match(p.perfilAntigo.resumo, /codificacao_testes openai\/gpt-6-astra\/low/);
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
      ...a.frotaPedido, chaveIdempotencia: randomUUID(), usuarioId: '7' });
    while (!liberar) await new Promise(r => setTimeout(r, 5));
    await assert.rejects(a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
      ...a.frotaPedido, chaveIdempotencia: randomUUID(), usuarioId: '7' }), /lease ativo|carta impedida/);
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
    ...a.frotaPedido, chaveIdempotencia, usuarioId: '7' };
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

// Correção J-A (29/10/2026): a versão anterior deste teste consagrava a janela — a troca
// ANTES da reserva rodava a v1. Agora a reserva relê a frota sob a trava: troca antes
// recusa sem lease; troca DEPOIS da reserva roda a v1 congelada.
const FROTA_TROCADA = () => conteudoFrota({ orquestracao: tupla('openai', 'low'), codificacao_testes: tupla('openai', 'xhigh'), validacao: tupla('openai', 'low') });

test('J-A: troca de frota entre a checagem e a reserva recusa "frota mudou" sem lease nem executor', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido', resumo: 'Não deveria executar.', evidencia: ['nenhuma'] }; }, true, {
    aoValidar: async (n) => { if (n === 1) await gravarFrota(path.join(a.raiz, 'estado'), FROTA_TROCADA()); },
  });
  try {
    await assert.rejects(a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
      ...a.frotaPedido, chaveIdempotencia: randomUUID(), usuarioId: '7' }), /frota mudou antes da reserva/);
    assert.equal(await a.estado.lerLease(CARTA), null);
    assert.equal((await a.estado.lerHistorico(CARTA)).filter(e => e.tipo === 'TENTATIVA').length, 0);
    assert.equal(chamadas, 0);
    assert.equal((await a.servico.canal(CARTA)).handoffs.length, 0, 'nenhum HANDOFF escrito');
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('J3: troca de frota depois da reserva não muda os papéis e o HANDOFF grava as tuplas congeladas', async () => {
  const a = await ambiente(async () => ({ resultado: 'concluido', resumo: 'Comando de testes concluído.', evidencia: ['Suíte sem falhas'] }), true, {
    // A segunda checagem roda com o lease já tomado: a troca aqui é "durante a tentativa".
    aoValidar: async (n) => { if (n === 2) await gravarFrota(path.join(a.raiz, 'estado'), FROTA_TROCADA()); },
  });
  try {
    const r = await a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
      ...a.frotaPedido, chaveIdempotencia: randomUUID(), usuarioId: '7' });
    assert.equal(r.resultado, 'concluido');
    assert.equal(r.frotaVersao, 1);
    assert.equal((await new ArquivoFrota({ diretorio: path.join(a.raiz, 'estado') }).ler()).versao, 2, 'a troca gravou a v2');
    assert.equal(a.planosExecutados.length, 1);
    assert.equal(a.planosExecutados[0].papeis.orquestracao.esforco, 'xhigh', 'executor recebeu as tuplas da v1');
    assert.equal(a.planosExecutados[0].papeis.validacao.esforco, 'xhigh');
    assert.deepEqual(a.planosExecutados[0].frota, { versao: 1, hash: a.frota.hash });
    const handoffs = (await a.servico.canal(CARTA)).handoffs;
    assert.deepEqual(handoffs.map(h => h.resultado), ['em_andamento', 'concluido']);
    for (const h of handoffs) {
      assert.equal(h.origemModelos.fonte, 'frota');
      assert.equal(h.origemModelos.versao, 1);
      assert.deepEqual(h.origemModelos.tuplas, FROTA_OPENAI.executor);
    }
    const tentativa = (await a.estado.lerHistorico(CARTA)).find(e => e.tipo === 'TENTATIVA');
    assert.equal(tentativa.frota.versao, 1);
    assert.deepEqual(tentativa.contexto, { comandoId: 'testes', versaoCarta: VERSAO, frotaVersao: 1, frotaHash: a.frota.hash, usuarioId: '7' });
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('J3: frota trocada entre preparar e confirmar recusa sem reservar lease', async () => {
  let chamadas = 0;
  const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido', resumo: 'Não deveria executar.', evidencia: ['nenhuma'] }; });
  try {
    const confirmacoes = criarConfirmacoesDespacho({ servico: a.servico });
    const p = await confirmacoes.preparar({ carta: CARTA, comando: 'testes', versaoCarta: VERSAO }, identidade);
    await gravarFrota(path.join(a.raiz, 'estado'), conteudoFrota({ orquestracao: tupla('openai', 'high'),
      codificacao_testes: tupla('openai'), validacao: tupla('openai') }));
    await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, identidade), e => e.status === 422 && /frota mudou/.test(e.message));
    assert.equal(chamadas, 0);
    assert.equal(await a.estado.lerLease(CARTA), null);
  } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
});

test('J5: frota ausente, ilegível ou inválida bloqueia o despacho, sem cair para o perfil nem para padrão', async () => {
  for (const [nome, preparar] of [
    ['ausente', async () => {}],
    ['ilegivel', dir => fs.writeFile(path.join(dir, 'frota.json'), '{ isto não é json')],
    ['invalida', async dir => { const g = await gravarFrota(dir); const bruto = JSON.parse(await fs.readFile(path.join(dir, 'frota.json'), 'utf8'));
      bruto.conteudo.executor.validacao.esforco = 'low'; await fs.writeFile(path.join(dir, 'frota.json'), JSON.stringify(bruto)); assert.ok(g); }],
  ]) {
    let chamadas = 0;
    const a = await ambiente(async () => { chamadas++; return { resultado: 'concluido', resumo: 'Não deveria executar.', evidencia: ['nenhuma'] }; }, true, { frota: null });
    try {
      await fs.mkdir(path.join(a.raiz, 'estado'), { recursive: true });
      await preparar(path.join(a.raiz, 'estado'));
      await assert.rejects(a.servico.validarDespacho(CARTA, 'testes', VERSAO), new RegExp(`frota ${nome}`), nome);
      await assert.rejects(a.servico.iniciarDespacho({ cartaId: CARTA, comandoId: 'testes', versaoCarta: VERSAO,
        frotaVersao: 1, frotaHash: 'a'.repeat(64), chaveIdempotencia: randomUUID(), usuarioId: '7' }), new RegExp(`frota ${nome}`));
      assert.equal(a.validacoes(), 0, `${nome}: executor nem validado`);
      assert.equal(chamadas, 0);
      assert.equal(await a.estado.lerLease(CARTA), null);
      assert.equal((await a.servico.fila()).frota.estado, nome);
    } finally { await fs.rm(a.raiz, { recursive: true, force: true }); }
  }
});

test('J1: frota ok não habilita projeto nem provedor desligados no contrato', async () => {
  const desligado = await ambiente(async () => { throw Error('não executar'); }, true,
    { agentes: [{ id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: false }] });
  try {
    const item = (await desligado.servico.fila()).itens.find(x => x.id === CARTA);
    assert.equal(item.elegivel, false);
    assert.match(item.motivos.join(' '), /nenhum agente elegível/);
    await assert.rejects(desligado.servico.validarDespacho(CARTA, 'testes', VERSAO), /carta impedida/);
    assert.equal(desligado.validacoes(), 0);
  } finally { await fs.rm(desligado.raiz, { recursive: true, force: true }); }
  // Projeto ligado só para OpenAI; a frota pede Claude na validação: o contrato vence.
  // Correção J-E: a incompatibilidade aparece já na prontidão (a carta não é candidata),
  // não só no despacho; antes este teste esperava elegivel === true.
  const soOpenai = await ambiente(async () => { throw Error('não executar'); }, true,
    { frota: conteudoFrota({ orquestracao: tupla('openai'), codificacao_testes: tupla('openai'), validacao: tupla('claude') }) });
  try {
    const item = (await soOpenai.servico.fila()).itens.find(x => x.id === CARTA);
    assert.equal(item.elegivel, false);
    assert.deepEqual(item.motivos, ['frota pede claude que o contrato desligou']);
    await assert.rejects(soOpenai.servico.validarDespacho(CARTA, 'testes', VERSAO), /carta impedida: frota pede claude que o contrato desligou/);
    assert.equal(soOpenai.validacoes(), 0);
    assert.equal(await soOpenai.estado.lerLease(CARTA), null);
  } finally { await fs.rm(soOpenai.raiz, { recursive: true, force: true }); }
});
