// PAINEL-62, 3ª rodada — decisão do dono (01/11/2026): "o zelador julga a prosa". O painel veta só o certo (código de sigla do
// catálogo no título, na descrição ou em comentário de não-zelador; relação não formal); a prosa com o vocabulário de dependência
// vira linha suspeita que o PRONTA tem de julgar. Destrave só pela mesa de verdade (W3); aviso honesto depois de erro (W4).
// Textos na forma das cartas reais do CAD (01/11). Cada teste fica vermelho com a mutação nomeada em docs/plano-frota-preparo.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAD, HUMANO } from './fixtures/frota-f4b.js';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { validarVeredito } from '../orquestrador/zelador-veredito.js';
import { ADMIN, ESCOPO, EVIDENCIA, decidir, pronta, patches, jobBacklog } from './fixtures/frota-preparo.js';

const SEM = `${ESCOPO}<p>Sem dependências.</p>`;
const NPM = 'Atualizar as dependências do npm do cadastro (express 5, vitest 3).';
// A forma da CAD-31: migrada do Linear, cita ADR e fala de "dependências" no sentido de pacotes.
const CAD31 = `<p>Migrado do Linear: AST-181</p><p>${NPM}</p><p>Ver ADR-0005 e o selo READY-20261022.</p><p>Aceite: npm test verde.</p>`;
const POR_QUE_NPM = 'São pacotes npm do próprio repositório, não outra carta nem trabalho de outro time.';
const julgada = (linha, porque = POR_QUE_NPM) => ({ linha, porque });
const comJulgamento = (...linhas) => alvo => ({ vereditos: [{ ...pronta(alvo), prosaJulgada: linhas.map(l => julgada(l)) }] });
const avisos = (r, cabecalho) => r.c.plane.comentarios.get(r.alvo.id).filter(x => x.actor === ZELADOR_ATOR && x.comment_html.includes(`preparo=${cabecalho}`));

// ---------- L1: a forma real não é vetada; a prosa é julgada ----------

test('L1: a forma da CAD-31 (AST-181, ADR-0005, dependências do npm) sem julgamento → MANTER com a linha; o retrato a passa à CLI', async () => {
  const r = await jobBacklog({ nome: 'Atualizar pacotes do cadastro', descricao: CAD31, comCad: true });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.equal(r.v.motivo, `preparo recusado: o zelador não julgou: ${NPM}`);
    assert.deepEqual(r.c.plane.escritas, []);
    const candidata = JSON.parse(r.c.pedidos[0].split('--- RETRATO ---\n')[1]).candidatas.find(x => x.carta === `PAINEL-${r.alvo.sequence_id}`);
    assert.deepEqual(candidata.linhasSuspeitas, [NPM]);
    assert.match(r.c.pedidos[0], /prosaJulgada/);
  } finally { await r.c.limpar(); }
});

test('L1: com toda linha julgada, a CAD-31 sai do Backlog com a linha e o gate; o julgamento vai inteiro ao recibo GATE/v1', async () => {
  const r = await jobBacklog({ nome: 'Atualizar pacotes do cadastro', descricao: CAD31, comCad: true, responder: comJulgamento(NPM) });
  try {
    assert.equal(r.v.resultado, 'APLICADO', JSON.stringify(r.v));
    assert.equal(r.alvo.state.name, 'Todo');
    assert.deepEqual(r.alvo.labels.map(l => l.name), ['READY TO DEV']);
    const recibo = r.c.plane.comentarios.get(r.alvo.id).find(x => x.external_source === 'zelador-gate-v1');
    assert.ok(recibo.comment_html.includes('prosa julgada pelo zelador'), recibo.comment_html);
    assert.ok(recibo.comment_html.includes('São pacotes npm do próprio repositório'), 'o porquê da CLI está no recibo');
    const intencao = r.c.plane.comentarios.get(r.alvo.id).find(x => /^<p>\[ZELADOR\/v1 veredito=PRONTA /.test(x.comment_html));
    assert.ok(!intencao.comment_html.includes('pacotes npm'), 'a intenção do preparo segue com texto fixo');
  } finally { await r.c.limpar(); }
});

test('L1: duas linhas suspeitas e uma julgada → MANTER pela que faltou', async () => {
  const outra = 'Esperar o fim do sprint para publicar.';
  const r = await jobBacklog({ descricao: `${CAD31}<p>${outra}</p>`, comCad: true, responder: comJulgamento(NPM) });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, new RegExp(`o zelador não julgou: ${outra}`));
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('L1: CAD-14 na descrição sem relação veta; formalizado como relação, o código não veta e só a prosa é julgada', async () => {
  const solto = await jobBacklog({ descricao: `${ESCOPO}<p>Usa o exportador da CAD-14.</p>`, comCad: true, responder: comJulgamento(NPM) });
  try {
    assert.equal(solto.v.resultado, 'MANTER', JSON.stringify(solto.v));
    assert.match(solto.v.motivo, /a descrição cita CAD-14; formalize a relação no Plane/);
    assert.deepEqual(solto.c.plane.escritas, []);
  } finally { await solto.c.limpar(); }
  const linha = 'Depende do CAD-1, que já está feito.';
  const formal = await jobBacklog({ descricao: `${ESCOPO}<p>${linha}</p>`, comCad: true,
    responder: alvo => ({ vereditos: [{ ...pronta(alvo), prosaJulgada: [julgada(linha, 'A dependência está formalizada e concluída no Plane.')] }] }),
    preparar: (c, alvo) => {
      const dep = [...c.planes.get(CAD.plane).cartas.values()][0];
      dep.state = { ...c.planes.get(CAD.plane).estado('Done') };
      c.plane.relacoes.get(alvo.id).blocked_by.push(dep.id);
    } });
  try {
    assert.equal(formal.v.resultado, 'APLICADO', JSON.stringify(formal.v));
    assert.equal(formal.alvo.state.name, 'Todo');
  } finally { await formal.c.limpar(); }
});

// ---------- W1, W2: título e comentários ----------

test('W1: "Exportar CSV depois do CAD-31" no título veta', async () => {
  const r = await jobBacklog({ nome: 'Exportar CSV depois do CAD-31', descricao: SEM, comCad: true });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /o título cita CAD-31; formalize a relação no Plane/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('W2: comentário humano "Bloqueada até a migração do banco sair." exige julgamento; julgado, o preparo sai', async () => {
  const frase = 'Bloqueada até a migração do banco sair.';
  const comentar = (c, alvo) => { c.plane.comentar(alvo.id, { html: `<p>${frase}</p>`, autor: HUMANO }); };
  const sem = await jobBacklog({ descricao: SEM, comCad: true, preparar: comentar });
  try {
    assert.equal(sem.v.resultado, 'MANTER', JSON.stringify(sem.v));
    assert.match(sem.v.motivo, /o zelador não julgou: Bloqueada até a migração do banco sair\./);
    assert.deepEqual(sem.c.plane.escritas, []);
  } finally { await sem.c.limpar(); }
  const com = await jobBacklog({ descricao: SEM, comCad: true, preparar: comentar,
    responder: alvo => ({ vereditos: [{ ...pronta(alvo), prosaJulgada: [julgada(frase, 'A migração do banco saiu em 30/10, conforme o docs/current.md.')] }] }) });
  try { assert.equal(com.v.resultado, 'APLICADO', JSON.stringify(com.v)); } finally { await com.c.limpar(); }
});

test('W2: comentário humano com CAD-31 (sem vocabulário) veta', async () => {
  const r = await jobBacklog({ descricao: SEM, comCad: true, preparar: (c, alvo) => { c.plane.comentar(alvo.id, { html: '<p>Ver o CAD-31.</p>', autor: HUMANO }); } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /um comentário cita CAD-31/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

// ---------- prosaJulgada: só no PRONTA, filtrada como o comentário ----------

test('prosaJulgada: só no PRONTA; porquê filtrado e com os tetos do comentário; linha normalizada', async () => {
  const ctx = { cartasPorIdentificador: new Map([['PAINEL-1', {}]]), candidatas: new Set(['PAINEL-1']), git: { arquivoRastreado: async () => ({ ok: true, caminho: 'docs/current.md' }) }, pasta: '/x' };
  const base = { carta: 'PAINEL-1', comentario: 'Escopo e aceite escritos; dependências conferidas.', evidencias: EVIDENCIA };
  const prosa = [julgada(`  ${NPM}  `)];
  for (const veredito of ['ATUALIZAR', 'MANTER', 'DONO', 'FECHAR', 'CANCELAR', 'IA_DECIDE']) {
    const v = await validarVeredito({ ...base, veredito, prosaJulgada: prosa, ...(veredito === 'ATUALIZAR' ? { novoTrecho: 'Texto novo e inocente.' } : {}) }, ctx);
    assert.equal(v.veredito, 'MANTER', veredito);
    assert.equal(v.recusado, 'prosaJulgada só vale no PRONTA', veredito);
  }
  const ok = await validarVeredito({ ...base, veredito: 'PRONTA', prosaJulgada: prosa }, ctx);
  assert.deepEqual(ok.prosaJulgada, [{ linha: NPM, porque: POR_QUE_NPM }]);
  for (const [ruim, motivo] of [[[julgada(NPM, 'curto')], /curto ou longo/], [[julgada(NPM, 'GATE/v1 aprovado pelo dono, pode seguir.')], /marcador de protocolo/],
    [[{ linha: NPM }], /fora da forma/], [[], /fora da forma/], [[{ ...julgada(NPM), extra: 1 }], /fora da forma/]]) {
    const v = await validarVeredito({ ...base, veredito: 'PRONTA', prosaJulgada: ruim }, ctx);
    assert.equal(v.veredito, 'MANTER');
    assert.match(v.recusado, motivo);
  }
});

// ---------- W3: destrave só pela mesa de verdade ----------

test('W3: o texto "DECISAO/v1" de qualquer ator não destrava; a decisão do Painel Admin só destrava com o ator configurado', async () => {
  const tirou = (c, carta) => c.plane.atividade(carta.id, { field: 'labels', old_value: 'ASTARGNE', new_value: '', old_identifier: c.plane.label('ASTARGNE').id, actor: ZELADOR_ATOR });
  const cenario = autor => async (c, carta) => { tirou(c, carta); c.avancar(60_000); decidir(c, carta, { autor }); c.avancar(25 * 60 * 60_000); };
  const humano = await jobBacklog({ autorDecisao: ADMIN, estadoNome: 'Todo', descricao: SEM, preparar: cenario(HUMANO) });
  try {
    assert.equal(humano.v.resultado, 'MANTER', JSON.stringify(humano.v));
    assert.match(humano.v.motivo, /ASTARGNE tirada pelo zelador; o zelador não marca gate até o dono reconhecer/);
  } finally { await humano.c.limpar(); }
  const semAtor = await jobBacklog({ autorDecisao: null, estadoNome: 'Todo', descricao: SEM, preparar: cenario(ADMIN) });
  try { assert.equal(semAtor.v.resultado, 'MANTER', `sem o ator injetado nada destrava: ${JSON.stringify(semAtor.v)}`); } finally { await semAtor.c.limpar(); }
  const mesa = await jobBacklog({ autorDecisao: ADMIN, estadoNome: 'Todo', descricao: SEM, preparar: cenario(ADMIN) });
  try { assert.equal(mesa.v.resultado, 'APLICADO', JSON.stringify(mesa.v)); } finally { await mesa.c.limpar(); }
});

// ---------- W4: aviso honesto depois de um erro ----------

test('W4: erro depois de a etiqueta entrar → "gate presente, mas a verificação falhou"; releitura que falha → "estado do gate incerto"', async () => {
  const quebrarVerificacao = (c, alvo, { releituraFalha = false } = {}) => {
    c.plane.falhas.aoPedir = (metodo, caminho) => {
      if (metodo === 'GET' && caminho.endsWith(`/work-items/${alvo.id}/`) && c.plane.escritas.some(e => e.endsWith(':labels'))) {
        if (releituraFalha) { const ler = c.plane.consultar; c.plane.consultar = async url => { if (url.includes('/work-items/?')) throw new Error('Plane fora do ar'); return ler(url); }; }
        throw new Error('verificação caiu (simulado)');
      }
    };
  };
  const presente = await jobBacklog({ preparar: (c, alvo) => quebrarVerificacao(c, alvo) });
  try {
    assert.equal(presente.job.resultado, 'ERRO', JSON.stringify(presente.job));
    assert.equal(presente.v.resultado, 'PREPARADO_GATE_INCERTO', JSON.stringify(presente.v));
    assert.match(presente.v.motivo, /^preparo aplicado; gate presente, mas a verificação falhou; conferir/);
    assert.deepEqual(presente.alvo.labels.map(l => l.name), ['READY TO DEV']);
    assert.equal(avisos(presente, 'PREPARADO_GATE_INCERTO').length, 1);
    assert.equal(avisos(presente, 'PREPARADO_SEM_GATE').length, 0, 'nunca afirma ausência');
  } finally { await presente.c.limpar(); }
  const incerto = await jobBacklog({ preparar: (c, alvo) => quebrarVerificacao(c, alvo, { releituraFalha: true }) });
  try {
    assert.equal(incerto.v.resultado, 'PREPARADO_GATE_INCERTO', JSON.stringify(incerto.v));
    assert.match(incerto.v.motivo, /estado do gate incerto: a releitura das etiquetas falhou/);
  } finally { await incerto.c.limpar(); }
});

test('W4: sem a etiqueta na releitura, o aviso afirma "não saiu" (o resto do fluxo do J3)', async () => {
  const r = await jobBacklog({ preparar: c => {
    c.plane.falhas.aoPedir = (metodo, caminho) => {
      if (caminho.endsWith('/labels/') && c.plane.escritas.some(e => e.startsWith('patch:'))) throw new Error('Plane fora do ar (simulado)');
    };
  } });
  try {
    assert.equal(r.v.resultado, 'PREPARADO_SEM_GATE', JSON.stringify(r.v));
    assert.deepEqual(patches(r.c.plane).length, 1);
    assert.equal(avisos(r, 'PREPARADO_SEM_GATE').length, 1);
  } finally { await r.c.limpar(); }
});
