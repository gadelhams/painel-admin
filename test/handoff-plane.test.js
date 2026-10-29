import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codificarHandoff, criarEscritorHandoffPlane, handoffsDoCanal, lerHandoffsDoCanal, validarHandoff } from '../orquestrador/handoff-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { criarConfirmacoesHandoff, criarApiHandoff } from '../orquestrador/api-handoff.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { ErroAcesso } from '../orquestrador/sso.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const VERSAO = '2026-10-20T08:00:00Z';
const CHAVE = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const COMENTARIO = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
// O navegador manda a entrada sem origem; o servidor acrescenta `humano` (HANDOFF/v2).
const ENTRADA_API = { papel: 'orquestracao', tentativaId: null, resultado: 'proposta',
  resumo: 'Revisar o contrato antes de abrir o gate.', evidencia: ['Checklist verificado no card'] };
const ENTRADA = { ...ENTRADA_API, origemModelos: { fonte: 'humano' } };
const TUPLA = { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' };
const DA_FROTA = { fonte: 'frota', versao: 4, hash: 'f'.repeat(64), tuplas: { orquestracao: TUPLA, codificacao_testes: TUPLA, validacao: TUPLA } };
const IDENTIDADE = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };

test('protocolo codifica, escapa e só confia na autoria técnica esperada', () => {
  const html = codificarHandoff({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE,
    versaoCarta: VERSAO, ...ENTRADA });
  assert.match(html, /HANDOFF\/v2/);
  const trusted = normalizarInteracao({ id: COMENTARIO, actor: AUTOR, created_at: VERSAO, comment_html: html });
  const forged = normalizarInteracao({ id: OUTRO, actor: OUTRO, created_at: VERSAO, comment_html: html });
  assert.equal(handoffsDoCanal([forged, trusted], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR }).length, 1);
  assert.deepEqual(handoffsDoCanal([trusted], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR })[0].evidencia, ENTRADA.evidencia);
  // J9 (29/10/2026): handoff que não confere fica de fora e é contado; não derruba a carta.
  assert.deepEqual(lerHandoffsDoCanal([trusted], { projetoId: OUTRO, cartaId: CARTA, autorId: AUTOR }), { handoffs: [], ilegiveis: 1 });
  const lixo = normalizarInteracao({ id: OUTRO, actor: AUTOR, created_at: VERSAO, comment_html: '<p>[ORQ/v1 papel=orquestracao] HANDOFF/v2 %%%</p>' });
  assert.equal(lerHandoffsDoCanal([lixo, trusted], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR }).handoffs.length, 1);
  assert.throws(() => validarHandoff(ENTRADA_API), /origem dos modelos obrigatória/);
  assert.throws(() => validarHandoff({ ...ENTRADA, origemModelos: { ...DA_FROTA, tuplas: { ...DA_FROTA.tuplas, zelador: TUPLA } } }), /zelador/);
  const daFrota = codificarHandoff({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, ...ENTRADA, origemModelos: DA_FROTA });
  const lido = handoffsDoCanal([normalizarInteracao({ id: COMENTARIO, actor: AUTOR, created_at: VERSAO, comment_html: daFrota })], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR })[0];
  assert.deepEqual(lido.origemModelos, DA_FROTA);
  const v1 = Buffer.from(JSON.stringify({ versao: 1, projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE, versaoCarta: VERSAO, ...ENTRADA_API })).toString('base64url');
  const legado = normalizarInteracao({ id: COMENTARIO, actor: AUTOR, created_at: VERSAO, comment_html: `<p>[ORQ/v1 papel=orquestracao] HANDOFF/v1 ${v1}</p>` });
  assert.deepEqual(handoffsDoCanal([legado], { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR })[0].origemModelos, { fonte: 'perfil-ia' });
  assert.throws(() => validarHandoff({ ...ENTRADA, papel: 'validador' }), /tentativa obrigatória/);
  assert.throws(() => validarHandoff({ ...ENTRADA, evidencia: [] }), /evidência/);
  assert.doesNotMatch(codificarHandoff({ projetoId: PROJETO, cartaId: CARTA, chaveIdempotencia: CHAVE,
    versaoCarta: VERSAO, ...ENTRADA, resumo: '<script>alert(1)</script>' }), /<script>/);
});

test('escritor de handoff não aceita outro projeto e verifica autor retornado', async () => {
  let chamadas = 0;
  const escrever = criarEscritorHandoffPlane({ chave: 'segredo-teste', projetoPermitido: PROJETO, autorEsperado: AUTOR,
    fetchImpl: async () => { chamadas++; return { ok: true, json: async () => ({ id: COMENTARIO, actor: AUTOR }) }; } });
  await assert.rejects(escrever({ projetoId: OUTRO, cartaId: CARTA, html: 'x', chaveIdempotencia: CHAVE }), /fora do escopo/);
  assert.equal(chamadas, 0);
  assert.equal(await escrever({ projetoId: PROJETO, cartaId: CARTA, html: 'x', chaveIdempotencia: CHAVE }), COMENTARIO);
});

test('confirmação de handoff vincula sessão e não duplica chamada concorrente', async () => {
  let gravacoes = 0;
  let liberar;
  const servico = { validarHandoff: async () => ({ carta: 'PAINEL-29', versaoCarta: VERSAO, entrada: ENTRADA, aviso: 'confirme' }),
    registrarHandoff: async () => { gravacoes++; await new Promise(r => { liberar = r; }); return { persistido: true }; } };
  const confirmacoes = criarConfirmacoesHandoff({ servico });
  await assert.rejects(confirmacoes.preparar({ carta: CARTA, versaoCarta: VERSAO, entrada: { ...ENTRADA_API, origemModelos: DA_FROTA } }, IDENTIDADE),
    e => e.status === 422, 'o navegador não alega que uma frota rodou');
  const p = await confirmacoes.preparar({ carta: CARTA, versaoCarta: VERSAO, entrada: ENTRADA_API }, IDENTIDADE);
  assert.equal(gravacoes, 0);
  await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, { ...IDENTIDADE, sessaoHash: 'b'.repeat(64) }), e => e.status === 403);
  const primeiro = confirmacoes.confirmar(p.confirmacaoId, IDENTIDADE);
  await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, IDENTIDADE), e => e.status === 409);
  liberar();
  assert.deepEqual(await primeiro, { persistido: true });
  assert.deepEqual(await confirmacoes.confirmar(p.confirmacaoId, IDENTIDADE), { persistido: true });
  assert.equal(gravacoes, 1);
});

test('API não lê corpo sem sessão e rejeita parâmetros extras', async () => {
  let leituras = 0;
  const negada = criarApiHandoff({ autorizar: async () => { throw new ErroAcesso('sem sessão', 401); }, confirmacoes: {} });
  assert.equal((await negada({ method: 'POST' }, '/api/orquestracao/handoff/preparar', async () => { leituras++; return '{}'; })).status, 401);
  assert.equal(leituras, 0);
  const api = criarApiHandoff({ autorizar: async () => IDENTIDADE, confirmacoes: { preparar: async () => { throw Error('não chamar'); } } });
  assert.equal((await api({ method: 'POST' }, '/api/orquestracao/handoff/preparar', async () => JSON.stringify({ carta: CARTA, entrada: ENTRADA_API, versaoCarta: VERSAO, executar: true }))).status, 422);
});

test('serviço registra uma vez no card e conserva falha incerta sem retry', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-handoff-'));
  try {
    await fs.mkdir(path.join(raiz, 'painel-admin'));
    await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify({
      versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline', tiposTeste: ['unitário'], criteriosAceite: ['passou'],
      acoesProibidas: ['deploy'], comandos: [{ id: 'teste', executavel: 'npm', argumentos: ['test'] }],
      agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true }],
    }));
    const comentarios = [];
    let gravacoes = 0;
    let falhar = false;
    const consultar = async url => {
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'Painel', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [{ id: CARTA, sequence_id: 29, name: 'Trabalho', parent: null,
        state: { name: 'Todo', group: 'unstarted' }, description_html: '<p>Sem dependências.</p>', labels: [], updated_at: VERSAO }] };
      if (url.includes('/comments/')) return { results: comentarios, next_page_results: false };
      if (url.endsWith(`/${CARTA}/`)) return { id: CARTA, updated_at: VERSAO };
      throw Error(url);
    };
    const escritorHandoff = async ({ html }) => {
      gravacoes++;
      if (falhar) throw Error('resposta incerta');
      comentarios.push({ id: COMENTARIO, actor: AUTOR, created_at: VERSAO, comment_html: html });
      return COMENTARIO;
    };
    const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
    const servico = criarServicoOrquestracao({ consultar, raiz, estado, escritorHandoff,
      projetoEscrita: PROJETO, autorEscrita: AUTOR });
    const [a, b] = await Promise.all([servico.registrarHandoff(CARTA, ENTRADA, VERSAO, CHAVE),
      servico.registrarHandoff(CARTA, ENTRADA, VERSAO, CHAVE)]);
    assert.deepEqual([a.duplicado, b.duplicado].sort(), [false, true]);
    assert.equal(gravacoes, 1);
    assert.equal((await servico.canal(CARTA)).handoffs.length, 1);
    falhar = true;
    await assert.rejects(servico.registrarHandoff(CARTA, ENTRADA, VERSAO, OUTRO), /resposta incerta/);
    await assert.rejects(servico.registrarHandoff(CARTA, ENTRADA, VERSAO, OUTRO), /incerto/);
    assert.equal(gravacoes, 2);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
