import test from 'node:test';
import assert from 'node:assert/strict';
import { lerCanalPlane, normalizarInteracao, validarAlvoCanal } from '../orquestrador/canal-plane.js';
import { catalogoModelos, prepararPlanoExecucao, validarSelecoes } from '../orquestrador/modelos.js';
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

test('modelo e esforço são escolhidos por papel sem fallback silencioso', () => {
  assert.deepEqual(catalogoModelos(contrato).map(x => x.esforcoPadrao), ['max', 'xhigh']);
  const selecoes = {
    orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
    codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
    validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'high' },
  };
  assert.deepEqual(validarSelecoes(contrato, selecoes), selecoes);
  assert.throws(() => validarSelecoes(contrato, { ...selecoes, validacao: { ...selecoes.validacao, esforco: 'low' } }), /não permitido/);
  assert.throws(() => validarSelecoes(contrato, { ...selecoes, validacao: undefined }), /não permitido/);
  assert.throws(() => prepararPlanoExecucao(contrato, selecoes), /indisponível.*sem fallback/);
  const ativo = { agentes: contrato.agentes.map(a => ({ ...a, disponivel: true })) };
  const plano = prepararPlanoExecucao(ativo, selecoes);
  assert.equal(plano.papeis.codificacao_testes.modelo, 'gpt-6-astra');
  assert.equal(plano.papeis.validacao.esforco, 'high');
  assert.equal(plano.fallback, false);
  assert.throws(() => prepararPlanoExecucao(ativo, { ...selecoes, validacao: undefined }), /não permitido/);
  const apenasClaude = { agentes: [ativo.agentes[0], { ...ativo.agentes[1], disponivel: false }] };
  assert.throws(() => prepararPlanoExecucao(apenasClaude, selecoes), /codificacao_testes; sem fallback/);
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
