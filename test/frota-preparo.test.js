// PAINEL-62: o preparo do PRONTA — o zelador tira a carta do Backlog e declara "Dependências: nenhuma" antes do gate, só pelo juiz
// real e só quando nada no texto, nos comentários ou nas relações fala de dependência. Uma janela do parecer de 01/11/2026 por teste,
// cada um vermelho com a mutação nomeada (tabela em docs/plano-frota-preparo.md). Plane, CLI e executor falsos; nada de rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PAINEL, HUMANO } from './fixtures/frota-f4b.js';
import { montarCenario } from './fixtures/zelador/cenario.js';
import { ZELADOR_ATOR, digitalDaCarta, violaProntidao, MOTIVO_ESTADO, MOTIVO_DECLARACAO } from '../orquestrador/zelador-politica.js';
import { estadoAlvoDoPreparo } from '../orquestrador/zelador-preparo.js';
import { mudancaNaListaFechada, novaDescricao, validarVeredito } from '../orquestrador/zelador-veredito.js';
import { linhaDoZelador } from '../orquestrador/texto-dependencia.js';
import { dependenciasDaCarta } from '../orquestrador/dependencias-carta.js';
import { uuidV5 } from '../orquestrador/uuid.js';

import { ESCOPO, LINHA, EVIDENCIA, COMENTARIO_CLI, MIN, pronta, patches, vereditoDe, jobBacklog } from './fixtures/frota-preparo.js';

// ---------- D1, D2, D10, D13: a forma da CAD-32 ----------

test('PAINEL-62 CAD-32: Backlog sem relação nem declaração → um PATCH (Todo + linha), recibo, READY TO DEV com a chave da digital D1', async () => {
  const r = await jobBacklog();
  try {
    assert.equal(r.v.resultado, 'APLICADO', JSON.stringify(r.v));
    const id = `PAINEL-${r.alvo.sequence_id}`;
    assert.deepEqual(patches(r.c.plane), [`patch:${id}:description_html+state`, `patch:${id}:labels`], 'um PATCH só no preparo, depois o gate');
    assert.equal(r.alvo.state.name, 'Todo', 'o unstarted de menor sequence');
    assert.equal(r.alvo.description_html, `${ESCOPO}<p>${LINHA}</p>`);
    assert.deepEqual(r.alvo.labels.map(l => l.name), ['READY TO DEV']);
    const comentarios = r.c.plane.comentarios.get(r.alvo.id);
    assert.equal(comentarios.filter(x => String(x.external_id).endsWith(':recibo:APLICADO')).length, 1, 'recibo do preparo');
    const d1 = digitalDaCarta({ ...r.alvo, labels: [] }, comentarios);
    const recibo = comentarios.find(x => x.external_source === 'zelador-gate-v1');
    assert.equal(recibo.external_id, uuidV5(`${r.alvo.id}|READY TO DEV|${d1}`));
    assert.equal(recibo.actor, ZELADOR_ATOR);
    // D1/J4 da correção: a intenção do preparo é texto do painel; a prosa da CLI não entra nela.
    const intencao = comentarios.find(x => /^<p>\[ZELADOR\/v1 veredito=PRONTA /.test(x.comment_html));
    assert.match(intencao.comment_html, /Preparo do painel para o READY TO DEV/);
    assert.ok(!intencao.comment_html.includes(COMENTARIO_CLI), 'o texto da CLI não aparece na intenção do preparo');
    // D14: a CLI recebeu a conferência de dependências da candidata em Backlog.
    const candidata = JSON.parse(r.c.pedidos[0].split('--- RETRATO ---\n')[1]).candidatas[0];
    assert.deepEqual(candidata.conferenciaDeDependencias, { relacoes: {}, codigosCitados: [] });
    assert.match(r.c.pedidos[0], /PRONTA de carta em Backlog/);
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D2: a linha fixa declara; "nenhuma (exceto CAD-31)" não declara; a data é a de São Paulo', () => {
  const porId = new Map();
  const deps = html => dependenciasDaCarta({ description_html: html }, { blocked_by: [] }, porId).map(d => d.motivo);
  assert.deepEqual(deps(`${ESCOPO}<p>${LINHA}</p>`), []);
  assert.deepEqual(deps(`${ESCOPO}<p>Dependências: nenhuma (exceto CAD-31)</p>`), ['ausência de dependências não declarada na carta']);
  assert.deepEqual(deps(`${ESCOPO}<p>Dependências: nenhuma (declarada por alguém em 31/10/2026)</p>`), ['ausência de dependências não declarada na carta']);
  assert.equal(linhaDoZelador(Date.parse('2026-11-01T02:00:00Z')), 'Dependências: nenhuma (declarada pelo zelador do Hangar em 31/10/2026)');
  assert.equal(linhaDoZelador(Date.parse('2026-11-01T03:00:00Z')), 'Dependências: nenhuma (declarada pelo zelador do Hangar em 01/11/2026)');
});

test('PAINEL-62 D13: alvo = unstarted de menor sequence, sem bloqueado/em espera; sequence ausente ou empate recusa', () => {
  const e = (name, group, sequence) => ({ id: randomUUID(), name, group, sequence });
  assert.equal(estadoAlvoDoPreparo([e('Backlog', 'backlog', 15000), e('Em espera', 'unstarted', 20000), e('Todo', 'unstarted', 25000), e('Depois', 'unstarted', 26000)]).estado.name, 'Todo');
  assert.match(estadoAlvoDoPreparo([e('Todo', 'unstarted', 25000), e('Outro', 'unstarted', undefined)]).erro, /sem sequence/);
  assert.match(estadoAlvoDoPreparo([e('Todo', 'unstarted', 25000), e('Outro', 'unstarted', 25000)]).erro, /mesma sequence/);
  assert.match(estadoAlvoDoPreparo([e('Aguardando', 'unstarted', 1)]).erro, /sem estado/);
});

// ---------- D6: anti-lavagem pelo texto e pelas relações ----------

test('PAINEL-62 D6: lavagem — código do catálogo e relates_to vetam; prosa com vocabulário sem julgamento → MANTER; nada escrito', async () => {
  const casos = [
    ['Depende de CAD-31', { descricao: `${ESCOPO}<p>Depende de CAD-31</p>` }, /a descrição cita CAD-31; formalize a relação no Plane/],
    ['Dependência: CAD-31', { descricao: `${ESCOPO}<p>Dependência: CAD-31</p>` }, /a descrição cita CAD-31; formalize a relação no Plane/],
    ['Bloqueada por', { descricao: `${ESCOPO}<p>Bloqueada pela migração do banco.</p>` }, /o zelador não julgou: Bloqueada pela migração do banco\./],
    // LOR não é sigla do catálogo: não veta, mas o "Requer" é prosa a julgar.
    ['Requer LOR-45', { descricao: `${ESCOPO}<p>Requer LOR-45 no ar.</p>` }, /o zelador não julgou: Requer LOR-45 no ar\./],
    ['comentário humano com código', { preparar: (c, alvo) => { c.plane.comentar(alvo.id, { html: '<p>Ver o CAD-31 antes.</p>', autor: HUMANO }); } }, /um comentário cita CAD-31/],
    ['relates_to', { preparar: (c, alvo) => { c.plane.relacoes.get(alvo.id).relates_to.push(c.plane.novaCarta({ nome: 'Parente' }).id); } }, /relação relates_to na carta; formalize a relação no Plane/],
  ];
  for (const [nome, opcoes, motivo] of casos) {
    const r = await jobBacklog({ ...opcoes, comCad: true });
    try {
      assert.equal(r.v.resultado, 'MANTER', `${nome}: ${JSON.stringify(r.v)}`);
      assert.match(r.v.motivo, motivo, nome);
      assert.deepEqual(r.c.plane.escritas, [], `${nome}: nada escrito`);
      assert.equal(r.alvo.state.name, 'Backlog', nome);
    } finally { await r.c.limpar(); }
  }
});

test('PAINEL-62 D6, janela 14: relações {} (sem as listas de dependência) → declarar recusado, nada escrito', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => { c.plane.relacoes.set(alvo.id, {}); } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /relações do Plane ilegíveis ou fora da forma/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D6, janela 13: relação criada entre a simulação e o PATCH aborta sob a trava; nenhum PATCH', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => {
    const dep = c.plane.novaCarta({ nome: 'Dependência nova' });
    let feito = false;
    // A leitura dos comentários do escritor só acontece sob a trava, depois da simulação.
    c.plane.falhas.aoPedir = (metodo, caminho) => {
      if (!feito && metodo === 'GET' && caminho.endsWith(`/work-items/${alvo.id}/comments/`)) { feito = true; c.plane.relacionar(alvo, dep); }
    };
  } });
  try {
    assert.equal(r.v.resultado, 'ABORTADO', JSON.stringify(r.v));
    assert.match(r.v.motivo, /relações da carta mudaram/);
    assert.deepEqual(patches(r.c.plane), []);
    assert.equal(r.alvo.state.name, 'Backlog');
  } finally { await r.c.limpar(); }
});

// ---------- D7: lavagem em duas passadas ----------

test('PAINEL-62 D7: ATUALIZAR do zelador tira "Ver também o CAD-31" (só o código, sem vocabulário) → o PRONTA seguinte é MANTER até o DECISAO/v1', async () => {
  let passada = 0;
  const r = await jobBacklog({ descricao: `${ESCOPO}<p>Ver também o CAD-31.</p>`, responder: alvo => {
    passada += 1;
    return { vereditos: [passada === 1
      ? { carta: `PAINEL-${alvo.sequence_id}`, veredito: 'ATUALIZAR', trecho: 'Ver também o CAD-31.', novoTrecho: 'Escopo revisto pelo zelador.',
        comentario: 'A nota sobre outra carta ficou velha; o estado do projeto confirma.', evidencias: EVIDENCIA }
      : pronta(alvo)] };
  } });
  try {
    assert.equal(r.v.resultado, 'APLICADO', `a primeira passada limpa: ${JSON.stringify(r.v)}`);
    assert.doesNotMatch(r.alvo.description_html, /CAD-31/);
    r.c.avancar(31 * MIN);
    await r.c.zelador.rodarUmaVez();
    const v = await vereditoDe(r.c, r.alvo);
    assert.equal(v.veredito, 'PRONTA');
    assert.equal(v.resultado, 'MANTER', JSON.stringify(v));
    assert.match(v.motivo, /código de carta ou dependência em prosa tirados da descrição pelo zelador/);
    assert.equal(r.alvo.state.name, 'Backlog');
    assert.equal(patches(r.c.plane).length, 1, 'só o PATCH do ATUALIZAR');
  } finally { await r.c.limpar(); }
});

// ---------- D8, D9: J57 ----------

test('PAINEL-62 D8: um humano levou a carta de Todo para Backlog → MANTER, o zelador não a tira de lá', async () => {
  const r = await jobBacklog({ descricao: `${ESCOPO}<p>Sem dependências.</p>`, preparar: (c, alvo) => {
    c.plane.atividade(alvo.id, { field: 'state', old_value: 'Todo', new_value: 'Backlog', old_identifier: c.plane.estado('Todo').id, new_identifier: c.plane.estado('Backlog').id, actor: HUMANO });
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /outro ator pôs a carta no Backlog vinda de Todo/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D9: um humano tirou a linha do zelador (de outra data) → MANTER, o zelador não declara de novo', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => {
    c.plane.atividade(alvo.id, { field: 'description', old_value: `${ESCOPO}<p>Dependências: nenhuma (declarada pelo zelador do Hangar em 30/10/2026)</p>`, new_value: ESCOPO, actor: HUMANO });
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /outro ator tirou da descrição uma declaração/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

// ---------- D5: a exceção estreita da J58 ----------

test('PAINEL-62 D5: A bloqueia B — o preparo de A passa com B só trocando o nome do estado; qualquer outra mudança em B recusa', async () => {
  let b;
  const r = await jobBacklog({ preparar: (c, alvo) => {
    b = c.plane.novaCarta({ nome: 'B espera A', descricao: `${ESCOPO}<p>Depende de: PAINEL-${alvo.sequence_id}</p>` });
    c.plane.relacionar(b, alvo);
  } });
  try {
    assert.equal(r.v.resultado, 'APLICADO', JSON.stringify(r.v));
    assert.deepEqual(b.labels, []);
  } finally { await r.c.limpar(); }
  const antes = new Map([['a', { pronta: false, motivos: [MOTIVO_DECLARACAO, MOTIVO_ESTADO].sort() }], ['b', { pronta: false, motivos: ['dependência PAINEL-1: Backlog'] }]]);
  const depois = motivosB => new Map([['a', { pronta: true, motivos: [] }], ['b', { pronta: false, motivos: motivosB }]]);
  const preparo = { tipo: 'preparo', codigoAlvo: 'PAINEL-1' };
  assert.equal(violaProntidao(antes, depois(['dependência PAINEL-1: Todo']), 'a', preparo), null);
  assert.match(violaProntidao(antes, depois(['dependência PAINEL-1: Todo', 'rascunho']), 'a', preparo), /outra carta/);
  assert.match(violaProntidao(antes, depois(['dependência PAINEL-10: Todo']), 'a', preparo), /outra carta/);
  assert.match(violaProntidao(antes, new Map([['a', { pronta: true, motivos: [] }], ['b', { pronta: true, motivos: [] }]]), 'a', preparo), /outra carta/);
  assert.match(violaProntidao(antes, depois(['dependência PAINEL-1: Todo']), 'a'), /própria carta mais perto/, 'sem o tipo, a exceção não existe');
});

test('PAINEL-62 D5: a exceção é do TIPO — ATUALIZAR anexar "Sem dependências." segue recusado pela J58', async () => {
  const r = await jobBacklog({ estadoNome: 'Todo', responder: alvo => ({ vereditos: [{ carta: `PAINEL-${alvo.sequence_id}`, veredito: 'ATUALIZAR',
    novoTrecho: 'Sem dependências.', comentario: 'A carta não declara dependências; o estado do projeto confirma.', evidencias: EVIDENCIA }] }) });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /a escrita deixaria a própria carta mais perto do READY TO DEV/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D5: estreita — estado "Em espera" ou outro motivo além dos dois → MANTER, nada escrito; a J58 recusa outro motivo que some', async () => {
  const r = await jobBacklog({ estadoNome: 'Em espera' });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /prontidão ao vivo recusou: estado bloqueado/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
  const antes = new Map([['a', { pronta: false, motivos: [MOTIVO_ESTADO, 'estado bloqueado'] }]]);
  assert.match(violaProntidao(antes, new Map([['a', { pronta: true, motivos: [] }]]), 'a', { tipo: 'preparo', codigoAlvo: 'PAINEL-1' }), /motivo além do estado e da declaração/);
});

// ---------- D4: o juiz real antes ----------

test('PAINEL-62 D4: sem escritorGate na identidade do projeto, o preparo não sai — 0 PATCH', async () => {
  const r = await jobBacklog({ preparar: c => { delete c.servico.identidade(PAINEL.plane).escritorGate; } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /identidade de escrita restrita indisponível/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

// ---------- D12: diário honesto ----------

test('PAINEL-62 D12: humano mexe entre o preparo e o gate → PREPARADO_SEM_GATE, com motivo e comentário [ZELADOR/v1] na carta', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => {
    c.plane.falhas.antesDoComentario = async (carta, corpo) => {
      if (carta.id === alvo.id && String(corpo.external_id).endsWith(':recibo:APLICADO')) c.plane.comentar(alvo.id, { html: '<p>Espera, vou rever o escopo.</p>', autor: HUMANO });
    };
  } });
  try {
    assert.equal(r.v.resultado, 'PREPARADO_SEM_GATE', JSON.stringify(r.v));
    assert.match(r.v.motivo, /preparo aplicado, mas o READY TO DEV não saiu: atividade de outro ator/);
    assert.equal(r.alvo.state.name, 'Todo');
    assert.deepEqual(r.alvo.labels, []);
    const aviso = r.c.plane.comentarios.get(r.alvo.id).find(x => x.actor === ZELADOR_ATOR && /PREPARADO_SEM_GATE/.test(x.comment_html));
    assert.ok(aviso, 'comentário do zelador explicando');
    assert.match(aviso.comment_html, /^<p>\[ZELADOR\/v1 /);
    // J10 da correção: a chave do aviso é a da intenção do preparo, não a digital D1.
    const intencao = r.c.plane.comentarios.get(r.alvo.id).find(x => /^<p>\[ZELADOR\/v1 veredito=PRONTA /.test(x.comment_html));
    assert.equal(aviso.external_id, `${intencao.external_id}:sem-gate`);
    const fim = (await r.c.lerDiario()).find(l => l.tipo === 'JOB_FIM');
    assert.equal(fim.contagem.preparadosSemGate, 1);
    assert.equal(fim.contagem.recusados, 0);
  } finally { await r.c.limpar(); }
});

// ---------- D11: a reconciliação nunca rola o preparo para a frente ----------

test('PAINEL-62 D11: queda entre a intenção e o PATCH → a reconciliação fecha ABORTADO, sem PATCH', async () => {
  let passada = 0;
  const r = await jobBacklog({ preparar: c => { c.plane.falhas.mudarDepoisDoComentario = true; },
    responder: alvo => { passada += 1; return { vereditos: passada === 1 ? [pronta(alvo)] : [] }; } });
  try {
    assert.equal(r.job.resultado, 'ERRO', JSON.stringify(r.job));
    assert.equal((await r.c.zelador.diario.pendentes()).length, 1);
    r.c.plane.falhas.mudarDepoisDoComentario = false;
    r.c.avancar(31 * MIN);
    await r.c.zelador.rodarUmaVez();
    const rec = (await r.c.lerDiario()).find(l => l.tipo === 'RECONCILIADO');
    assert.deepEqual([rec.resultado, rec.motivo], ['ABORTADO', 'preparo não rola para a frente']);
    assert.deepEqual(await r.c.zelador.diario.pendentes(), []);
    assert.deepEqual(patches(r.c.plane), []);
    assert.equal(r.alvo.state.name, 'Backlog');
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D11: queda entre o PATCH e o recibo → reconciliação APLICADO; o PRONTA seguinte, com preparo vazio, marca o gate', async () => {
  const r = await jobBacklog({ descricao: `${ESCOPO}<p>Sem dependências.</p>`, preparar: c => {
    c.plane.falhas.antesDoComentario = async (_carta, corpo) => { if (String(corpo.external_id).includes(':recibo:')) throw new Error('queda antes do recibo'); };
  } });
  try {
    assert.equal(r.job.resultado, 'ERRO', JSON.stringify(r.job));
    assert.equal(r.alvo.state.name, 'Todo', 'o PATCH chegou (só o estado: a carta já declarava)');
    r.c.plane.falhas.antesDoComentario = null;
    r.c.avancar(31 * MIN);
    await r.c.zelador.rodarUmaVez();
    const rec = (await r.c.lerDiario()).find(l => l.tipo === 'RECONCILIADO');
    assert.deepEqual([rec.resultado, rec.motivo], ['APLICADO', 'mudança já estava feita']);
    assert.equal((await vereditoDe(r.c, r.alvo)).resultado, 'APLICADO');
    const id = `PAINEL-${r.alvo.sequence_id}`;
    assert.deepEqual(patches(r.c.plane), [`patch:${id}:state`, `patch:${id}:labels`]);
    assert.deepEqual(r.alvo.labels.map(l => l.name), ['READY TO DEV']);
  } finally { await r.c.limpar(); }
});

test('PAINEL-62 D11: PENDENTE adulterado no disco (descricaoNova diferente da recalculada) → ABORTADO, nada escrito', async () => {
  let passada = 0;
  const c = await montarCenario({ responder: (_e, { commitFeito }) => {
    passada += 1;
    return { vereditos: passada === 1 ? [{ carta: 'FALSO-1', veredito: 'ATUALIZAR', novoTrecho: 'O exportador CSV saiu no commit citado.',
      comentario: 'Anexar o estado do exportador, que está no ramo principal.', evidencias: [{ tipo: 'commit', sha: commitFeito }] }] : [] };
  } });
  try {
    const alvo = c.plane.novaCarta();
    c.plane.falhas.mudarDepoisDoComentario = true;
    assert.equal((await c.zelador.rodarUmaVez()).resultado, 'ERRO');
    c.plane.falhas.mudarDepoisDoComentario = false;
    const indice = path.join(c.diretorio, 'zelador', 'pendentes.jsonl');
    const linhas = (await fs.readFile(indice, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
    assert.equal(linhas.length, 1);
    linhas[0].descricaoNova = '<p>Sem dependências.</p><p>Texto que ninguém conferiu.</p>';
    await fs.writeFile(indice, `${JSON.stringify(linhas[0])}\n`);
    c.avancar(31 * MIN);
    await c.zelador.rodarUmaVez();
    const rec = (await c.lerDiario()).find(l => l.tipo === 'RECONCILIADO');
    assert.equal(rec.resultado, 'ABORTADO', JSON.stringify(rec));
    assert.match(rec.motivo, /difere da recalculada ao vivo/);
    assert.deepEqual(patches(c.plane), []);
    assert.equal(alvo.description_html, '<p>Sem dependências.</p>');
  } finally { await c.limpar(); }
});

// ---------- D3, D1: B7 do preparo e a CLI que nunca o produz ----------

test('PAINEL-62 D3: B7 do preparo — as linhas marcadas depois são as de antes mais exatamente a linha fixa', () => {
  const preparo = { tipo: 'preparo', estado: true, declarar: true };
  const agoraMs = Date.parse('2026-10-31T15:00:00Z');
  assert.equal(novaDescricao(`${ESCOPO}<p>Depende de: nada formal (DONO decide)</p>`, preparo, { agoraMs }),
    `${ESCOPO}<p>Depende de: nada formal (DONO decide)</p><p>${LINHA}</p>`);
  // Parágrafo sem fechamento: a linha fixa colaria nele e nasceria outra linha marcada.
  assert.throws(() => novaDescricao('<p>Escopo: exportar CSV', preparo, { agoraMs }), /tocaria outra linha com marcador/);
  assert.throws(() => novaDescricao('<p>Escopo</p><p>Ver as dependências:', preparo, { agoraMs }), /tocaria outra linha com marcador/);
  assert.throws(() => novaDescricao(ESCOPO, { tipo: 'preparo', estado: true, declarar: false }, { agoraMs }), /sem declaração/);
});

test('PAINEL-62 D1: nenhum JSON da CLI produz o preparo; a lista fechada aceita só a forma do painel', async () => {
  const ctx = { cartasPorIdentificador: new Map([['PAINEL-1', {}]]), candidatas: new Set(['PAINEL-1']), git: { arquivoRastreado: async () => ({ ok: true, caminho: 'docs/current.md' }) }, pasta: '/x' };
  const base = { carta: 'PAINEL-1', comentario: 'Escopo e aceite escritos; dependências conferidas.', evidencias: EVIDENCIA };
  const tentativas = [
    { ...base, veredito: 'PREPARO' },
    { ...base, veredito: 'PRONTA', tipo: 'preparo' },
    { ...base, veredito: 'PRONTA', mudanca: { tipo: 'preparo', estado: true, declarar: true } },
    { ...base, veredito: 'PRONTA', estado: true, declarar: true },
    { ...base, veredito: 'ATUALIZAR', novoTrecho: LINHA },
  ];
  for (const t of tentativas) {
    const v = await validarVeredito(t, ctx);
    assert.notEqual(v.mudanca?.tipo, 'preparo', JSON.stringify(t));
    assert.equal(v.veredito, 'MANTER', JSON.stringify(v));
  }
  for (const veredito of ['MANTER', 'ATUALIZAR', 'FECHAR', 'CANCELAR', 'IA_DECIDE', 'DONO', 'PRONTA']) {
    const v = await validarVeredito({ ...base, veredito, ...(veredito === 'ATUALIZAR' ? { novoTrecho: 'Texto novo e inocente.' } : {}) }, ctx);
    assert.notEqual(v.mudanca?.tipo, 'preparo', veredito);
  }
  assert.equal(mudancaNaListaFechada({ tipo: 'preparo', estado: true, declarar: false }), true);
  assert.equal(mudancaNaListaFechada({ tipo: 'preparo', estado: false, declarar: false }), false);
  assert.equal(mudancaNaListaFechada({ tipo: 'preparo', estado: 'sim', declarar: true }), false);
  assert.equal(mudancaNaListaFechada({ tipo: 'preparo', estado: true, declarar: true, texto: 'x' }), false);
});
