import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { codificarPerfil, criarEscritorPerfilPlane, perfisDoCanal } from '../orquestrador/perfil-plane.js';
import { codificarGate } from '../orquestrador/gate-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const CHAVE = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const VERSAO = '2026-10-20T08:00:00Z';
const selecoes = Object.fromEntries(['orquestracao', 'codificacao_testes', 'validacao'].map(p => [p,
  { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'high' }]));

test('perfil só é autoritativo quando vem da identidade esperada e confere com a carta', () => {
  const html = codificarPerfil({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, selecoes });
  const confiavel = normalizarInteracao({ id: ID, actor: AUTOR, comment_html: html, created_at: VERSAO });
  const falso = normalizarInteracao({ id: OUTRO, actor: OUTRO, comment_html: html, created_at: VERSAO });
  assert.equal(perfisDoCanal([falso, confiavel], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR }).length, 1);
  assert.deepEqual(perfisDoCanal([confiavel], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR })[0].selecoes, selecoes);
  assert.throws(() => perfisDoCanal([confiavel], { projetoId: OUTRO, cartaId: CARTA, autorId: AUTOR }), /não confere/);
  assert.throws(() => perfisDoCanal([confiavel], { projetoId: PROJETO, cartaId: CARTA }), /identidade/);
});

test('escritor restrito nunca usa projeto alheio nem devolve a chave', async () => {
  const chamadas = [];
  const escrever = criarEscritorPerfilPlane({ chave: 'segredo-de-teste', projetoPermitido: PROJETO, autorEsperado: AUTOR,
    fetchImpl: async (url, opcoes) => { chamadas.push({ url, opcoes }); return { ok: true, json: async () => ({ id: ID, actor: AUTOR }) }; } });
  await assert.rejects(escrever({ projetoId: OUTRO, cartaId: CARTA, html: '<p>x</p>', chaveIdempotencia: CHAVE }), /fora do escopo/);
  assert.equal(chamadas.length, 0);
  assert.equal(await escrever({ projetoId: PROJETO, cartaId: CARTA, html: '<p>x</p>', chaveIdempotencia: CHAVE }), ID);
  assert.equal(chamadas[0].opcoes.headers['X-API-Key'], 'segredo-de-teste');
  assert.ok(!chamadas[0].url.includes('segredo-de-teste'));
});

test('serviço em leitura não registra perfil nem alcança escritor', async () => {
  const servico = criarServicoOrquestracao();
  await assert.rejects(servico.registrarModelos(CARTA, selecoes, VERSAO, CHAVE), /identidade de escrita restrita não configurada/);
});

test('registro no card é idempotente, vincula simulação e rejeita versão obsoleta', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-perfil-'));
  try {
    const pasta = path.join(raiz, 'painel-admin');
    await fs.mkdir(pasta);
    await fs.writeFile(path.join(pasta, '.orquestrador.json'), JSON.stringify({
      versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'],
      criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
      comandos: [{ id: 'teste', executavel: 'npm', argumentos: ['test'] }],
      agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', esforcos: ['high', 'max'], disponivel: true }],
    }));
    const comentarios = [{ id: OUTRO, actor: AUTOR, created_at: VERSAO,
      comment_html: codificarGate({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: OUTRO,
        versaoCarta: VERSAO, gate: 'READY TO DEV', justificativa: 'Trabalho pronto para desenvolvimento.',
        evidencias: ['Escopo fechado e sem dependências formais.'] }) }];
    let gravacoes = 0;
    let falhar = false;
    const consultar = async url => {
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [{ id: CARTA, name: 'Trabalho', sequence_id: 99, parent: null,
        description_html: '<p>Sem dependências.</p>', labels: [{ name: 'READY TO DEV' }], state: { name: 'Todo', group: 'unstarted' }, updated_at: VERSAO }] };
      if (url.includes('/relations/')) return { blocked_by: [] };
      if (url.includes('/comments/')) return { results: comentarios, next_page_results: false };
      if (url.endsWith(`/${CARTA}/`)) return { id: CARTA, updated_at: VERSAO };
      throw new Error(`consulta inesperada ${url}`);
    };
    const escritorPerfil = async ({ html }) => {
      gravacoes++;
      if (falhar) throw new Error('resposta do Plane incerta');
      comentarios.push({ id: ID, actor: AUTOR, created_at: VERSAO, comment_html: html });
      return ID;
    };
    const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
    const servico = criarServicoOrquestracao({ consultar, raiz, estado, escritorPerfil, projetoEscrita: PROJETO, autorEscrita: AUTOR });
    const [a, b] = await Promise.all([
      servico.registrarModelos(CARTA, selecoes, VERSAO, CHAVE),
      servico.registrarModelos(CARTA, selecoes, VERSAO, CHAVE),
    ]);
    assert.deepEqual([a.duplicada, b.duplicada].sort(), [false, true]);
    assert.equal(gravacoes, 1);
    assert.equal((await servico.modelos(CARTA)).perfil.chaveIdempotencia, CHAVE);
    const simulacao = await servico.simular(CARTA, 'teste');
    assert.equal(simulacao.perfilRegistrado, true);
    assert.equal(simulacao.plano.papeis.codificacao_testes.esforco, 'high');
    await assert.rejects(servico.registrarModelos(CARTA, selecoes, '2026-10-19T00:00:00Z', OUTRO), /carta mudou/);
    assert.equal(gravacoes, 1);
    assert.equal((await estado.lerHistorico(CARTA)).filter(e => e.tipo === 'PERFIL_REGISTRADO').length, 1);
    falhar = true;
    await assert.rejects(servico.registrarModelos(CARTA, selecoes, VERSAO, OUTRO), /resposta do Plane incerta/);
    await assert.rejects(servico.registrarModelos(CARTA, selecoes, VERSAO, OUTRO), /registro anterior incerto/);
    assert.equal(gravacoes, 2, 'falha incerta não dispara segunda escrita');
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
