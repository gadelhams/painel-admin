import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lerCanalPlane, normalizarInteracao, validarAlvoCanal } from '../orquestrador/canal-plane.js';
import { prepararPlanoFrota } from '../orquestrador/modelos.js';
import { criarLeitorConsumo, percentualDeConsumo } from '../orquestrador/consumo.js';

const projetoId = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const cartaId = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const contrato = { agentes: [
  { id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', esforcos: ['high', 'max'], disponivel: false },
  { id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', esforcos: ['high', 'xhigh'], disponivel: false },
] };

test('card Plane é o canal; comentários paginam e não aceitam alvo arbitrário', async () => {
  assert.throws(() => validarAlvoCanal('../etc', cartaId), /inválido/);
  const caminhos = [];
  const consultar = async caminho => {
    caminhos.push(caminho);
    if (caminho.endsWith(`/${cartaId}/`)) return { id: cartaId };
    if (caminho.includes('cursor=segunda')) return { results: [{ id: '2', comment_html: '<p>Validação concluída</p>' }], next_page_results: false };
    return { results: [{ id: '1', comment_html: '<p>Desenvolvedor: feito<br>testes</p>', actor: { display_name: 'Agente' } }], next_page_results: true, next_cursor: 'segunda' };
  };
  const canal = await lerCanalPlane({ consultar, projetoId, cartaId });
  assert.equal(canal.fonte, 'Plane');
  assert.equal(canal.interacoes.length, 2);
  assert.match(canal.interacoes[0].texto, /feito\ntestes/);
  assert.equal(canal.interacoes[0].autor, 'Agente');
  assert.equal(caminhos.length, 3);
  assert.equal(normalizarInteracao({ id: '3', comment_html: '<script>x</script>' }).texto, '');
  const marcada = normalizarInteracao({ id: '4', comment_html: '<p>[ORQ/v1 papel=validador] Testes passaram</p>' });
  assert.equal(marcada.papel, 'validador');
  assert.equal(marcada.texto, 'Testes passaram');
  await assert.rejects(lerCanalPlane({ consultar: async () => ({ id: 'outra' }), projetoId, cartaId }), /não confere/);
});

// Reescrito na F2 (29/10/2026): a escolha por carta saiu; o plano vem da frota congelada
// e o contrato só liga ou desliga cada provedor.
test('plano vem da frota congelada; provedor desligado no contrato para sem fallback', () => {
  const tuplas = {
    orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
    codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
    validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'high' },
  };
  const congelada = { versao: 3, hash: 'a'.repeat(64), tuplas };
  assert.throws(() => prepararPlanoFrota(contrato, congelada), /desligado no contrato/);
  const ativo = { agentes: contrato.agentes.map(a => ({ ...a, disponivel: true })) };
  const plano = prepararPlanoFrota(ativo, congelada);
  assert.equal(plano.papeis.codificacao_testes.modelo, 'gpt-6-astra');
  assert.equal(plano.papeis.validacao.esforco, 'high');
  assert.equal(plano.papeis.validacao.agenteId, 'Claude');
  assert.deepEqual(plano.frota, { versao: 3, hash: 'a'.repeat(64) });
  assert.equal(plano.fallback, false);
  assert.throws(() => prepararPlanoFrota(ativo, { ...congelada, tuplas: { ...tuplas, validacao: undefined } }), /fora do catálogo/);
  assert.throws(() => prepararPlanoFrota(ativo, { ...congelada, tuplas: { ...tuplas, validacao: { ...tuplas.validacao, esforco: 'max', provedor: 'openai', modelo: 'gpt-6-astra' } } }), /fora do catálogo/);
  const apenasClaude = { agentes: [ativo.agentes[0], { ...ativo.agentes[1], disponivel: false }] };
  assert.throws(() => prepararPlanoFrota(apenasClaude, congelada), /openai desligado no contrato para codificacao_testes/);
  assert.throws(() => prepararPlanoFrota(ativo, null), /sem fallback/);
});

test('consumo mostra somente assinatura, com janela atual; API e amostra antiga não entram', async () => {
  assert.deepEqual(percentualDeConsumo({ usado: 4, limite: 5 }).disponivel, false);
  const agora = Date.parse('2026-10-20T08:00:00Z');
  assert.equal(percentualDeConsumo({ tipo: 'api', usado: 75, limite: 100, unidade: 'tokens', janela: '5h', fonte: 'teste', atualizadoEm: '2026-10-20T08:00:00Z' }, { agora }).disponivel, false);
  assert.equal(percentualDeConsumo({ tipo: 'assinatura', percentualUsado: 75, janela: '5h', fonte: 'teste', atualizadoEm: '2026-10-19T08:00:00Z' }, { agora }).disponivel, false);
  const ler = criarLeitorConsumo({ agora: () => agora, fontes: {
    openai: async () => [
      { tipo: 'assinatura', percentualUsado: 75, janela: '5h', fonte: 'teste', atualizadoEm: '2026-10-20T08:00:00Z' },
      { tipo: 'assinatura', usado: 20, limite: 100, unidade: 'cota incluída', janela: 'semanal', fonte: 'teste', atualizadoEm: '2026-10-20T08:00:00Z' },
      { tipo: 'api', percentualUsado: 90, janela: 'API', fonte: 'teste', atualizadoEm: '2026-10-20T08:00:00Z' },
    ],
  } });
  const consumo = await ler();
  assert.deepEqual(consumo.openai.janelas.map(x => x.percentual), [75, 20]);
  assert.equal(consumo.claude.disponivel, false);
});

test('Codex: rate_limits da sessão viram amostra da assinatura; velha vira "última leitura", zerada some', async () => {
  const { amostrasDoEvento, nomeJanela, criarFonteCodex } = await import('../orquestrador/fonte-consumo-codex.js');
  const evento = { timestamp: '2026-10-29T11:30:00Z', payload: { type: 'token_count', rate_limits: {
    primary: { used_percent: 26, window_minutes: 10080, resets_at: Date.parse('2026-11-04T06:35:27Z') / 1000 },
    secondary: { used_percent: 61.5, window_minutes: 300, resets_at: Date.parse('2026-10-29T14:00:00Z') / 1000 } } } };
  const amostras = amostrasDoEvento(evento);
  assert.deepEqual(amostras.map(a => [a.percentualUsado, a.janela]), [[26, 'semana'], [61.5, '5 h']]);
  assert.equal(nomeJanela(120), '2 h');
  assert.deepEqual(amostrasDoEvento({ timestamp: 'x', payload: { rate_limits: evento.payload.rate_limits } }), [], 'sem instante não vira amostra');
  const ler = (agora) => criarLeitorConsumo({ agora: () => Date.parse(agora), fontes: { openai: async () => amostras } })();
  assert.deepEqual((await ler('2026-10-29T11:40:00Z')).openai.janelas.map(j => j.percentual), [26, 61.5]);
  const velha = (await ler('2026-10-29T13:00:00Z')).openai;
  assert.equal(velha.disponivel, false, 'leitura de 1h30 atrás não é consumo atual');
  assert.deepEqual(velha.ultimasLeituras.map(u => u.janela), ['semana', '5 h']);
  const depois = (await ler('2026-10-29T15:00:00Z')).openai;
  assert.deepEqual(depois.ultimasLeituras.map(u => u.janela), ['semana'], 'a janela de 5 h zerou: a leitura antiga dela não serve mais');
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-'));
  await fs.mkdir(path.join(raiz, '2026', '10', '27'), { recursive: true });
  await fs.writeFile(path.join(raiz, '2026', '10', '27', 'rollout-a.jsonl'), `${JSON.stringify({ timestamp: '2026-10-27T10:00:00Z', payload: { type: 'user_message' } })}\n${JSON.stringify(evento)}\n${JSON.stringify({ timestamp: '2026-10-29T11:31:00Z', payload: { type: 'agent_message' } })}\n`);
  assert.deepEqual((await criarFonteCodex({ raiz, agora: () => Date.parse('2026-10-29T12:00:00Z') })()).map(a => a.percentualUsado), [26, 61.5], 'acha a sessão aberta há dias, no diretório do dia em que nasceu');
});

test('Claude: o arquivo da statusLine vira amostra; ausente ou ilegível não inventa número', async () => {
  const { amostrasDoArquivo, criarFonteClaude } = await import('../orquestrador/fonte-consumo-claude.js');
  const dados = { versao: 1, atualizadoEm: '2026-10-29T12:00:00Z', cincoHoras: { percentual: 23.5, reiniciaEm: '2026-10-29T15:00:00Z' }, semana: { percentual: 41, reiniciaEm: null } };
  assert.deepEqual(amostrasDoArquivo(dados).map(a => [a.janela, a.percentualUsado]), [['5 h', 23.5], ['semana', 41]]);
  assert.deepEqual(amostrasDoArquivo({ ...dados, versao: 2 }), [], 'formato desconhecido não vira número');
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-uso-'));
  assert.deepEqual(await criarFonteClaude({ arquivo: path.join(raiz, 'nao-existe.json') })(), []);
  await fs.writeFile(path.join(raiz, 'ruim.json'), '{');
  assert.deepEqual(await criarFonteClaude({ arquivo: path.join(raiz, 'ruim.json') })(), []);
  await fs.writeFile(path.join(raiz, 'ok.json'), JSON.stringify(dados));
  const consumo = await criarLeitorConsumo({ agora: () => Date.parse('2026-10-29T12:05:00Z'), fontes: { claude: criarFonteClaude({ arquivo: path.join(raiz, 'ok.json') }) } })();
  assert.deepEqual(consumo.claude.janelas.map(j => j.percentual), [23.5, 41]);
});
