// PAINEL-62, correção: as janelas J1–J11 da varredura pré-aceite (01/11/2026) sobre o preparo do PRONTA — anti-lavagem em todo
// preparo, segunda passada pelo vocabulário, erro comum depois do preparo, cláusulas sem guarda, atividade ilegível, estado alvo pelo
// id. Cada teste fica vermelho com a mutação nomeada (tabela em docs/plano-frota-preparo.md). Plane, CLI e executor falsos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HUMANO } from './fixtures/frota-f4b.js';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { ESTADO_BLOQUEADO, VOCABULARIO_DEPENDENCIA } from '../orquestrador/texto-dependencia.js';
import { ADMIN, ESCOPO, EVIDENCIA, MIN, decidir, pronta, patches, vereditoDe, jobBacklog } from './fixtures/frota-preparo.js';

const SEM = `${ESCOPO}<p>Sem dependências.</p>`;
const semGateNaCarta = r => r.c.plane.comentarios.get(r.alvo.id).filter(x => x.actor === ZELADOR_ATOR && /PREPARADO_SEM_GATE/.test(x.comment_html));

test('J1: o preparo que só tira do Backlog passa pelas mesmas defesas — código do catálogo, comentário, relates_to e prosa sem julgamento → MANTER', async () => {
  const casos = [
    ['Sem dependências + Depende de CAD-31', { descricao: `${SEM}<p>Depende de CAD-31</p>` }, /a descrição cita CAD-31; formalize a relação no Plane/],
    ['comentário humano com código', { descricao: SEM, preparar: (c, alvo) => { c.plane.comentar(alvo.id, { html: '<p>Isso espera o CAD-31 sair.</p>', autor: HUMANO }); } }, /um comentário cita CAD-31/],
    ['relates_to', { descricao: SEM, preparar: (c, alvo) => { c.plane.relacoes.get(alvo.id).relates_to.push(c.plane.novaCarta({ nome: 'Parente' }).id); } }, /relação relates_to na carta/],
    ['Bloqueada pela migração', { descricao: `${SEM}<p>Bloqueada pela migração do banco.</p>` }, /o zelador não julgou: Bloqueada pela migração do banco\./],
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

test('J2: a segunda passada lê o mesmo vocabulário — ATUALIZAR tira "Bloqueada…" ou "Requer…" e o PRONTA seguinte é MANTER', async () => {
  for (const frase of ['Bloqueada pela migração do banco antes.', 'Requer o deploy do servidor novo antes.']) {
    let passada = 0;
    const r = await jobBacklog({ descricao: `${ESCOPO}<p>${frase}</p>`, responder: alvo => {
      passada += 1;
      return { vereditos: [passada === 1
        ? { carta: `PAINEL-${alvo.sequence_id}`, veredito: 'ATUALIZAR', trecho: frase, novoTrecho: 'Escopo revisto pelo zelador.',
          comentario: 'A nota ficou velha; o estado do projeto confirma.', evidencias: EVIDENCIA }
        : pronta(alvo)] };
    } });
    try {
      assert.equal(r.v.resultado, 'APLICADO', `${frase} (1ª passada): ${JSON.stringify(r.v)}`);
      r.c.avancar(31 * MIN);
      await r.c.zelador.rodarUmaVez();
      const v = await vereditoDe(r.c, r.alvo);
      assert.equal(v.resultado, 'MANTER', `${frase}: ${JSON.stringify(v)}`);
      assert.match(v.motivo, /dependência em prosa tirados da descrição pelo zelador/);
      assert.equal(r.alvo.state.name, 'Backlog');
    } finally { await r.c.limpar(); }
  }
});

test('J8/X4: o vocabulário cobre os termos novos e os do estado bloqueado; "depois do almoço" vira linha suspeita, julgável', async () => {
  for (const t of ['blocked by PAINEL', 'requires the new server', 'waiting on infra', 'ship after the migration', 'em espera do banco', 'antes de subir',
    'necessita do banco', 'pendente de revisão', 'Bloqueada', 'Blocked', 'Em espera', 'Aguardando',
    'depois do deploy', 'depois das 18 h', 'antes da migração', 'antes dos testes', 'Só quando o banco migrar', 'assim que sair', 'até que termine',
    'Primeiro o PAINEL-1 no ar', 'primeiro a migração']) assert.match(t, VOCABULARIO_DEPENDENCIA, t);
  for (const t of ['bloqueada', 'blocked', 'em espera', 'aguardando']) assert.match(t, ESTADO_BLOQUEADO);
  for (const t of ['Escopo: exportar CSV. Aceite: suíte verde.', 'O primeiro passo é ler o CSV.', 'Depoimento do cliente.']) assert.doesNotMatch(t, VOCABULARIO_DEPENDENCIA, t);
  const almoco = '<p>Escopo: depois do almoço, exportar CSV. Aceite: suíte verde.</p>';
  const linha = 'Escopo: depois do almoço, exportar CSV. Aceite: suíte verde.';
  const sem = await jobBacklog({ descricao: almoco });
  try {
    assert.equal(sem.v.resultado, 'MANTER', JSON.stringify(sem.v));
    assert.equal(sem.v.motivo, `o zelador não julgou: ${linha}`);
  } finally { await sem.c.limpar(); }
  const com = await jobBacklog({ descricao: almoco, responder: alvo => ({ vereditos: [{ ...pronta(alvo),
    prosaJulgada: [{ linha, porque: '"Depois do almoço" é hora do dia, não outra carta nem trabalho de outro time.' }] }] }) });
  try { assert.equal(com.v.resultado, 'APLICADO', JSON.stringify(com.v)); } finally { await com.c.limpar(); }
  const soQuando = await jobBacklog({ estadoNome: 'Todo', descricao: `${SEM}<p>Só quando a migração do banco terminar.</p>` });
  try {
    assert.equal(soQuando.v.resultado, 'MANTER', JSON.stringify(soQuando.v));
    assert.match(soQuando.v.motivo, /o zelador não julgou: Só quando a migração do banco terminar\./);
  } finally { await soQuando.c.limpar(); }
});

test('J3: erro comum no gate depois do preparo aplicado — PREPARADO_SEM_GATE no diário e na carta, e o erro segue', async () => {
  const r = await jobBacklog({ preparar: c => {
    c.plane.falhas.aoPedir = (metodo, caminho) => {
      if (caminho.endsWith('/labels/') && c.plane.escritas.some(e => e.startsWith('patch:'))) throw new Error('Plane fora do ar (simulado)');
    };
  } });
  try {
    assert.equal(r.job.resultado, 'ERRO', JSON.stringify(r.job));
    assert.equal(r.v?.resultado, 'PREPARADO_SEM_GATE', JSON.stringify(r.v ?? null));
    assert.match(r.v.motivo, /preparo aplicado, mas o READY TO DEV não saiu: erro no gate: Plane fora do ar/);
    assert.equal(r.alvo.state.name, 'Todo');
    assert.equal(semGateNaCarta(r).length, 1);
  } finally { await r.c.limpar(); }
});

test('J4: a carta preparada tem de sair pronta na simulação — rascunho surgido depois do juiz → MANTER, nada escrito', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => {
    const original = c.servico.preavaliar;
    c.servico.preavaliar = async (...a) => { const pre = await original(...a); alvo.is_draft = true; return pre; };
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /a carta preparada não fica pronta: rascunho/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('J4: o estado só sai do grupo backlog — carta em triage não vai para Todo', async () => {
  const r = await jobBacklog({ estadoNome: 'Triage', grupo: 'triage', descricao: SEM });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /fora do Backlog/);
    assert.equal(r.alvo.state.name, 'Triage');
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});

test('J4/J11: J57 do estado — humano levou a carta ao Backlog vinda de In Progress ou de Done → MANTER', async () => {
  for (const de of ['In Progress', 'Done']) {
    const r = await jobBacklog({ descricao: SEM, preparar: (c, alvo) => {
      c.plane.atividade(alvo.id, { field: 'state', old_value: de, new_value: 'Backlog', old_identifier: c.plane.estado(de).id, new_identifier: c.plane.estado('Backlog').id, actor: HUMANO });
    } });
    try {
      assert.equal(r.v.resultado, 'MANTER', `${de}: ${JSON.stringify(r.v)}`);
      assert.match(r.v.motivo, new RegExp(`outro ator pôs a carta no Backlog vinda de ${de}`));
      assert.deepEqual(r.c.plane.escritas, [], de);
    } finally { await r.c.limpar(); }
  }
});

test('J4: sem comentário na carta quando o gate não sai por posse alheia (reserva de outra sessão)', async () => {
  const r = await jobBacklog({ preparar: (c, alvo) => {
    c.plane.falhas.antesDoComentario = async (carta, corpo) => {
      if (carta.id === alvo.id && String(corpo.external_id).endsWith(':recibo:APLICADO')) {
        await c.reservas.reservar({ cartaId: alvo.id, carta: `PAINEL-${alvo.sequence_id}`, quem: 'CODEX', pid: process.pid });
      }
    };
  } });
  try {
    assert.equal(r.v.resultado, 'PREPARADO_SEM_GATE', JSON.stringify(r.v));
    assert.match(r.v.motivo, /reservada por outra sessão/);
    assert.equal(semGateNaCarta(r).length, 0, 'só o diário');
  } finally { await r.c.limpar(); }
});

test('J5: atividade de descrição do zelador ilegível vale do created_at dela — o DECISAO/v1 posterior a reconhece', async () => {
  const r = await jobBacklog({ autorDecisao: ADMIN, estadoNome: 'Todo', descricao: SEM, preparar: (c, alvo) => {
    c.plane.atividade(alvo.id, { field: 'description', old_value: { html: '?' }, new_value: SEM, actor: ZELADOR_ATOR });
  } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /atividade de descrição do zelador ilegível; o dono reconhece com DECISAO\/v1 posterior a 2026-10-31T12:00:00.000Z/);
    decidir(r.c, r.alvo);
    r.c.avancar(25 * 60 * MIN);
    await r.c.zelador.rodarUmaVez();
    assert.equal((await vereditoDe(r.c, r.alvo)).resultado, 'APLICADO');
  } finally { await r.c.limpar(); }
  const semInstante = await jobBacklog({ estadoNome: 'Todo', descricao: SEM, preparar: (c, alvo) => {
    c.plane.atividade(alvo.id, { field: 'name', old_value: 'x', new_value: 'Pronta', actor: HUMANO });
    c.plane.atividade(alvo.id, { field: 'description', old_value: 7, new_value: SEM, actor: ZELADOR_ATOR, created_at: 'ilegível' });
  } });
  try {
    assert.match(semInstante.v.motivo, /posterior a 2026-10-31T12:00:00.000Z/, 'sem instante, vale a atividade legível mais recente');
  } finally { await semInstante.c.limpar(); }
});

test('J5: descrição vazia (null) é legível — o preparo de uma carta sem descrição não trava o próprio gate', async () => {
  const r = await jobBacklog({ descricao: null });
  try {
    assert.equal(r.v.resultado, 'APLICADO', JSON.stringify(r.v));
    assert.deepEqual(r.alvo.labels.map(l => l.name), ['READY TO DEV']);
  } finally { await r.c.limpar(); }
});

test('J9: queda entre a intenção e o PATCH, humano põe a carta noutro unstarted — a reconciliação não chama isso de APLICADO', async () => {
  let passada = 0;
  const r = await jobBacklog({ descricao: SEM, preparar: c => { c.plane.falhas.mudarDepoisDoComentario = true; },
    responder: alvo => { passada += 1; return { vereditos: passada === 1 ? [pronta(alvo)] : [] }; } });
  try {
    assert.equal(r.job.resultado, 'ERRO', JSON.stringify(r.job));
    r.c.plane.falhas.mudarDepoisDoComentario = false;
    const outro = { id: randomUUID(), name: 'Todo 2', group: 'unstarted', sequence: 26000, default: false };
    r.c.plane.estados.push(outro);
    r.alvo.state = { ...outro };
    r.c.avancar(31 * MIN);
    await r.c.zelador.rodarUmaVez();
    const rec = (await r.c.lerDiario()).find(l => l.tipo === 'RECONCILIADO');
    assert.equal(rec.resultado, 'ABORTADO', JSON.stringify(rec));
    assert.deepEqual(patches(r.c.plane), []);
  } finally { await r.c.limpar(); }
});

test('desvio 4: gate DIVERGENTE depois do preparo diz que o preparo foi aplicado', async () => {
  const r = await jobBacklog({ preparar: c => { c.plane.falhas.verificacaoMente = true; } });
  try {
    assert.equal(r.v.resultado, 'DIVERGENTE', JSON.stringify(r.v));
    assert.match(r.v.motivo, /^preparo aplicado; a releitura do gate não conferiu/);
    assert.equal(r.alvo.state.name, 'Todo');
  } finally { await r.c.limpar(); }
});

test('W5: preparo ABORTADO há menos de 24 h não se repete — MANTER sem intenção, PENDENTE nem escrita; depois de 24 h, volta', async () => {
  let dep;
  const r = await jobBacklog({ preparar: (c, alvo) => {
    dep = c.plane.novaCarta({ nome: 'Dependência nova' });
    let feito = false;
    c.plane.falhas.aoPedir = (metodo, caminho) => {
      if (!feito && metodo === 'GET' && caminho.endsWith(`/work-items/${alvo.id}/comments/`)) { feito = true; c.plane.relacionar(alvo, dep); }
    };
  } });
  try {
    assert.equal(r.v.resultado, 'ABORTADO', JSON.stringify(r.v));
    // A relação some (o Plane voltou a concordar): só o freio segura a repetição.
    r.c.plane.relacoes.get(r.alvo.id).blocked_by.length = 0;
    r.c.plane.relacoes.get(dep.id).blocking.length = 0;
    const intencoes = () => r.c.plane.comentarios.get(r.alvo.id).filter(x => /^<p>\[ZELADOR\/v1 veredito=PRONTA /.test(x.comment_html)).length;
    const escritas = r.c.plane.escritas.length;
    r.c.avancar(31 * MIN);
    await r.c.zelador.rodarUmaVez();
    const v = await vereditoDe(r.c, r.alvo);
    assert.equal(v.resultado, 'MANTER', JSON.stringify(v));
    assert.match(v.motivo, /^preparo abortado há menos de 24 h: as relações da carta mudaram/);
    assert.equal(intencoes(), 1, 'nenhuma intenção nova');
    assert.equal(r.c.plane.escritas.length, escritas, 'nada escrito no Plane');
    assert.deepEqual(await r.c.zelador.diario.pendentes(), []);
    r.c.avancar(24 * 60 * MIN);
    await r.c.zelador.rodarUmaVez();
    assert.equal((await vereditoDe(r.c, r.alvo)).resultado, 'APLICADO');
  } finally { await r.c.limpar(); }
});

test('W5: diário do zelador ilegível na consulta do freio → MANTER, nada escrito', async () => {
  const r = await jobBacklog({ preparar: c => { c.zelador.diario.ultimoPreparo = async () => { throw new Error('linha corrompida no meio'); }; } });
  try {
    assert.equal(r.v.resultado, 'MANTER', JSON.stringify(r.v));
    assert.match(r.v.motivo, /diário do zelador ilegível; o preparo não sai/);
    assert.deepEqual(r.c.plane.escritas, []);
  } finally { await r.c.limpar(); }
});
