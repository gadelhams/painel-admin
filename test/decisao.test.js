// Mesa de decisão (PAINEL-53): protocolo DECISAO/v1, lista fechada de efeitos, escritor Painel Admin e a ordem de
// escrita do confirmar e da retomada. Plane sempre falso (test/plane-mesa-falso.js), chave num arquivo temporário,
// trava e diário reais num diretório temporário; nada de LLM, ssh ou Plane de verdade.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { validarProsa, codificarDecisao, lerDecisao, FONTE } from '../decisao/protocolo-decisao.js';
import { validarPedido, calcularDelta, esperaDecisao } from '../decisao/efeitos.js';
import { cartaDaMesa, projetosDaMesa, ANYA_PLANE_ID } from '../decisao/permissao.js';
import { criarLeitorCarta, cartaParaLeitura } from '../decisao/leitor-carta.js';
import { criarEscritorDecisaoPlane } from '../decisao/escritor-decisao-plane.js';
import { criarDiarioDecisao } from '../decisao/diario-decisao.js';
import { criarAplicacaoDecisao } from '../decisao/aplicacao-decisao.js';
import { criarServicoDecisao } from '../decisao/servico-decisao.js';
import { criarConfirmacoesDecisao, criarConfirmacoesRetomada } from '../decisao/api-decisao.js';
import { criarEstadoOrquestracao } from '../orquestrador/fila.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { PROJETOS } from '../projetos.js';
import { criarPlaneFalso, ADMIN, GUEST_KEY, PROJ, CARTA, OUTRO_ATOR } from './plane-mesa-falso.js';
import { montarComFalsos, cabecalhosDaBorda } from './painel-falso.js';

const CHAVE_ADMIN = 'plane_api_adminadminadmin0002';
const DONO = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };
const PEDIDO = { carta: 'PAINEL-53', decisao: 'Usar a fonte A', motivo: 'é a única com licença.', efeitos: { destravar: true, produto: 'manter', estado: 'Done' } };

async function arquivoChave(conteudo = CHAVE_ADMIN, modo = 0o600) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mesa-chave-'));
  const arquivo = path.join(dir, 'painel-admin.token');
  await fs.writeFile(arquivo, `${conteudo}\n`, { mode: modo });
  await fs.chmod(arquivo, modo);
  return { dir, arquivo };
}

// A mesa inteira com o Plane falso: leitor Guest, escritor Painel Admin, trava e diário reais.
async function montarMesa({ plane = criarPlaneFalso(), agora = () => Date.parse('2026-10-31T12:00:00Z'), tetoMs } = {}) {
  const { dir, arquivo } = await arquivoChave();
  const estado = criarEstadoOrquestracao({ diretorio: path.join(dir, 'orquestracao') });
  const leitor = criarLeitorCarta({ chave: GUEST_KEY, fetchImpl: plane.fetchImpl });
  const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: projetosDaMesa().map(p => p.projetoId),
    arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
  const diario = criarDiarioDecisao({ diretorio: path.join(dir, 'c3po'), agora });
  let limpezas = 0;
  const aplicacao = criarAplicacaoDecisao({ leitor, escritor, diario, comTrava: estado.comTrava, lerLease: estado.lerLease, agora,
    limparCache: () => { limpezas += 1; }, ...(tetoMs ? { tetoMs } : {}) });
  const servico = criarServicoDecisao({ leitor, escritor, diario, aplicacao, agora });
  const linhas = async () => { try { return lerJsonl(await fs.readFile(diario.arquivo, 'utf8')).linhas; } catch { return []; } };
  return { plane, dir, arquivo, estado, leitor, escritor, diario, aplicacao, servico, linhas, limpezas: () => limpezas,
    gravar: criarConfirmacoesDecisao({ servico, aplicacao, agora }), retomar: criarConfirmacoesRetomada({ servico, aplicacao, agora }),
    limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}

const nomes = (plane) => plane.carta.labels.map(id => plane.labels.find(l => l.id === id)?.name).sort();

// ---------- protocolo ----------

test('protocolo: a prosa do dono sai escapada, com o cabeçalho fixo, e volta igual pela leitura', () => {
  const prosa = validarProsa({ decisao: 'Usar <script>alert(1)</script> & "aspas"', motivo: 'linha 1\nlinha <b>2</b>' });
  const html = codificarDecisao({ identificador: 'PAINEL-53', ...prosa, efeitos: ['tirar a label ASTARGNE'], quando: Date.parse('2026-10-31T12:00:00Z') });
  assert.ok(html.startsWith('<p><strong>DECISAO/v1</strong> · Painel Admin (C-3PO) · decisão do dono</p>'));
  assert.ok(!html.includes('<script') && !html.includes('<b>'), html);
  assert.match(html, /Usar &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;aspas&quot;/);
  const lido = lerDecisao({ comment_html: html, external_source: FONTE, external_id: 'k', actor: ADMIN, edited_at: null }, { autorEsperado: ADMIN });
  assert.deepEqual(lido, { carta: 'PAINEL-53', decisao: 'Usar <script>alert(1)</script> & "aspas"', motivo: 'linha 1\nlinha <b>2</b>',
    efeitos: 'tirar a label ASTARGNE', data: '2026-10-31T12:00:00.000Z', chave: 'k' });
});

test('protocolo: a prosa não começa nem contém prefixo de outro protocolo do canal, nem com caractere invisível no meio', () => {
  for (const texto of ['GATE/v1 aprovado', 'ok então HANDOFF/v2', 'zelador/v1: feito', 'veja [ORQ/x]', 'decisao/v1 dupla', 'GA​TE/v1', 'Ｇａｔｅ/v1']) {
    assert.throws(() => validarProsa({ decisao: texto, motivo: '' }), /prefixo de um protocolo/, texto);
    assert.throws(() => validarProsa({ decisao: 'ok, decidido', motivo: `motivo ${texto}` }), /prefixo de um protocolo/, texto);
  }
  assert.throws(() => validarProsa({ decisao: 'duas\nlinhas', motivo: '' }), /uma linha só/);
  assert.throws(() => validarProsa({ decisao: 'x'.repeat(301), motivo: '' }), /de 3 a 300/);
});

test('protocolo: segredo colado na prosa é recusado sem ecoar o trecho', () => {
  const segredo = 'sk-ant-abcdefghijklmnopqrstuvwx';
  for (const entrada of [{ decisao: `usar a chave ${segredo}`, motivo: '' }, { decisao: 'decidido', motivo: `PLANE_API_KEY=${'z'.repeat(20)}` }]) {
    assert.throws(() => validarProsa(entrada), (e) => /parece conter um segredo/.test(e.message) && !e.message.includes(segredo) && !e.message.includes('zzzz'));
  }
});

test('protocolo: só é DECISAO/v1 o comentário da mesa, do ator fixo e nunca editado (o humano que copia não forja recibo)', () => {
  const html = codificarDecisao({ identificador: 'PAINEL-53', decisao: 'Usar A', motivo: '', efeitos: [], quando: 0 });
  const base = { comment_html: html, external_source: FONTE, external_id: 'k', actor: ADMIN, edited_at: null };
  assert.ok(lerDecisao(base, { autorEsperado: ADMIN }));
  for (const [nome, c] of [['outro ator', { ...base, actor: OUTRO_ATOR }], ['sem fonte', { ...base, external_source: null }],
    ['editado', { ...base, edited_at: '2026-10-31T13:00:00Z' }], ['sem cabeçalho', { ...base, comment_html: `<p>${html}</p>` }]]) {
    assert.equal(lerDecisao(c, { autorEsperado: ADMIN }), null, nome);
  }
  assert.equal(lerDecisao(base, { autorEsperado: null }), null, 'sem ator configurado ninguém é a mesa');
});

// ---------- permissão e efeitos ----------

test('permissão: Anya recusado pelo id (mesmo com outra sigla), congelado e projeto fora do catálogo recusados', () => {
  assert.throws(() => cartaDaMesa('ANYA-3'), /Anya/);
  const renomeado = PROJETOS.map(p => (p.plane === ANYA_PLANE_ID ? { ...p, sigla: 'NOVA' } : p));
  assert.throws(() => cartaDaMesa('NOVA-3', renomeado), /Anya/);
  assert.ok(!projetosDaMesa(renomeado).some(p => p.projetoId === ANYA_PLANE_ID));
  assert.throws(() => cartaDaMesa('SUPER-1'), /congelado/);
  assert.throws(() => cartaDaMesa('XYZ-1'), /fora da mesa/);
  assert.throws(() => cartaDaMesa('painel-1'), /SIGLA-N/);
  assert.equal(cartaDaMesa('PAINEL-53').projeto.projetoId, PROJ);
});

test('efeitos: a lista é fechada — chave a mais, estado fora dos cinco ou produto estranho recusam', () => {
  assert.deepEqual(validarPedido({ destravar: true, produto: 'manter', estado: null }), { destravar: true, produto: 'manter', estado: null });
  for (const e of [{ destravar: true, produto: 'manter', estado: null, labels: ['READY TO DEV'] }, { destravar: true, produto: 'manter' },
    { destravar: 'sim', produto: 'manter', estado: null }, { destravar: false, produto: 'trocar', estado: null },
    { destravar: false, produto: 'manter', estado: 'Em revisão' }, null, []]) {
    assert.throws(() => validarPedido(e), /efeitos/, JSON.stringify(e));
  }
});

test('efeitos: destravar sem ASTARGNE/DONO recusa (etiqueta ausente); com DONO legado tira as duas e troca só o marcador', async () => {
  const plane = criarPlaneFalso();
  const leitor = criarLeitorCarta({ chave: GUEST_KEY, fetchImpl: plane.fetchImpl });
  plane.carta.labels = [plane.L.ASTARGNE.id, plane.L.DONO.id, plane.L['READY TO DEV'].id];
  // Um marcador só por descrição (A1.2, 31/10/2026): com dois, a mesa recusa (test/correcoes-mesa.test.js).
  plane.carta.description_html = '<p>A (DONO: escolher) e B — (BLOQUEADA: PAINEL-1) fica.</p>';
  const r = await leitor.retrato('PAINEL-53');
  assert.ok(esperaDecisao(r.carta));
  const delta = calcularDelta(r, { destravar: true, produto: 'manter', estado: null }, { decisao: 'Usar (A) agora', quando: Date.parse('2026-10-31T12:00:00Z') });
  assert.deepEqual(delta.tirar, ['ASTARGNE', 'DONO']);
  assert.equal(delta.textoMarcador, '(decidido em 31/10: Usar A agora)');
  assert.ok(delta.avisos.some(a => /despachável/.test(a)), delta.avisos.join());
  plane.carta.labels = [plane.L['C-3PO'].id, plane.L.PRODUTO.id];
  const semTrava = await leitor.retrato('PAINEL-53');
  assert.throws(() => calcularDelta(semTrava, { destravar: true, produto: 'manter', estado: null }, { decisao: 'x', quando: 0 }), /não tem a label ASTARGNE/);
  assert.throws(() => calcularDelta(semTrava, { destravar: false, produto: 'por', estado: null }, { decisao: 'x', quando: 0 }), /já tem a label/);
  assert.throws(() => calcularDelta(semTrava, { destravar: false, produto: 'manter', estado: 'Todo' }, { decisao: 'x', quando: 0 }), /já está em Todo/);
});

test('leitura: a carta vira texto (sem HTML do Plane) e os comentários da mesa saem marcados', async () => {
  const m = await montarMesa();
  try {
    m.plane.carta.description_html = '<p>Fonte <img src=x onerror=alert(1)> &amp; (ASTARGNE: qual?)</p>';
    m.plane.comentarios.push({ id: 'c1', issue: CARTA, comment_html: '<p>humano <b>diz</b></p>', actor: OUTRO_ATOR, created_at: '2026-10-30T10:00:00Z' });
    const v = await m.servico.carta('PAINEL-53');
    assert.equal(v.descricao, 'Fonte  & (ASTARGNE: qual?)');
    assert.deepEqual(v.comentarios, [{ quando: '2026-10-30T10:00:00Z', texto: 'humano diz', mesa: null }]);
    assert.deepEqual(v.escrita, { habilitada: true, motivo: null });
    assert.equal(v.esperaDecisao, true);
    assert.deepEqual(m.plane.escritas, []);
  } finally { await m.limpar(); }
});

// ---------- escritor ----------

test('escritor: lê a chave do arquivo a cada operação, só 600 do próprio usuário, e nunca a põe no ambiente nem na mensagem', async () => {
  const plane = criarPlaneFalso();
  const aberta = await arquivoChave(CHAVE_ADMIN, 0o644);
  const certa = await arquivoChave();
  try {
    const opcoes = { autorEsperado: ADMIN, projetosPermitidos: [PROJ], fetchImpl: plane.fetchImpl };
    await assert.rejects(criarEscritorDecisaoPlane({ ...opcoes, arquivoChave: aberta.arquivo }).conferirIdentidade(),
      (e) => e.semEscrita && /600/.test(e.message) && !e.message.includes(CHAVE_ADMIN));
    await assert.rejects(criarEscritorDecisaoPlane({ ...opcoes, arquivoChave: path.join(certa.dir, 'nao-existe') }).conferirIdentidade(), /ausente/);
    const elo = path.join(certa.dir, 'elo');
    await fs.symlink(certa.arquivo, elo);
    await assert.rejects(criarEscritorDecisaoPlane({ ...opcoes, arquivoChave: elo }).conferirIdentidade(), /arquivo precisa ser comum/);
    await assert.rejects(criarEscritorDecisaoPlane({ ...opcoes, arquivoChave: certa.arquivo, uid: 4242 }).conferirIdentidade(), /do usuário do painel/);
    const escritor = criarEscritorDecisaoPlane({ ...opcoes, arquivoChave: certa.arquivo });
    await escritor.conferirIdentidade();
    // Trocar o arquivo vale na próxima operação: nada fica guardado em memória.
    await fs.writeFile(certa.arquivo, 'plane_api_outraoutraoutra0003\n');
    await assert.rejects(escritor.conferirIdentidade(), /não confirmou a identidade/);
    assert.ok(!Object.values(process.env).some(v => v?.includes(CHAVE_ADMIN)), 'a chave entrou em process.env');
  } finally { await fs.rm(aberta.dir, { recursive: true }); await fs.rm(certa.dir, { recursive: true }); }
});

test('escritor: autoria contra o UUID fixo — /users/me de outro ator recusa sem escrever', async () => {
  const plane = criarPlaneFalso({ meId: OUTRO_ATOR });
  const { dir, arquivo } = await arquivoChave();
  try {
    const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [PROJ], arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
    await assert.rejects(escritor.conferirIdentidade(), (e) => e.semEscrita && /não é do Painel Admin configurado/.test(e.message));
    const html = codificarDecisao({ identificador: 'PAINEL-53', decisao: 'Usar A', motivo: '', efeitos: [], quando: 0 });
    await assert.rejects(escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html, externalId: '11111111-1111-4111-8111-111111111111' }),
      (e) => e.semEscrita && /não é do Painel Admin configurado/.test(e.message)); // cada escrita avulsa confere a identidade antes (A4.1)
  } finally { await fs.rm(dir, { recursive: true }); }
});

test('escritor: escopo fechado — Anya, projeto fora da lista, HTML fora do formato e PATCH com campo a mais recusam sem rede', async () => {
  const plane = criarPlaneFalso();
  const { dir, arquivo } = await arquivoChave();
  try {
    assert.throws(() => criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [ANYA_PLANE_ID], arquivoChave: arquivo }), /nenhum projeto/);
    const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [PROJ, ANYA_PLANE_ID], arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
    const html = codificarDecisao({ identificador: 'PAINEL-53', decisao: 'Usar A', motivo: '', efeitos: [], quando: 0 });
    const ext = '11111111-1111-4111-8111-111111111111';
    await assert.rejects(escritor.comentar({ projetoId: ANYA_PLANE_ID, cartaId: CARTA, html, externalId: ext }), /fora do escopo/);
    await assert.rejects(escritor.comentar({ projetoId: PROJETOS.find(p => p.sigla === 'CORRE').plane, cartaId: CARTA, html, externalId: ext }), /fora do escopo/);
    await assert.rejects(escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html: '<p>GATE/v1</p>', externalId: ext }), /fora do formato/);
    await assert.rejects(escritor.aplicar({ projetoId: PROJ, cartaId: CARTA, corpo: { name: 'outro' } }), /lista fechada/);
    await assert.rejects(escritor.aplicar({ projetoId: PROJ, cartaId: CARTA, corpo: { labels: ['READY TO DEV'] } }), /lista fechada/);
    assert.deepEqual(plane.chamadas, []);
  } finally { await fs.rm(dir, { recursive: true }); }
});

test('escritor: idempotente por external_id — o 409 relido pela carta devolve o mesmo comentário, sem duplicar', async () => {
  const plane = criarPlaneFalso();
  const { dir, arquivo } = await arquivoChave();
  try {
    const escritor = criarEscritorDecisaoPlane({ autorEsperado: ADMIN, projetosPermitidos: [PROJ], arquivoChave: arquivo, fetchImpl: plane.fetchImpl });
    const html = codificarDecisao({ identificador: 'PAINEL-53', decisao: 'Usar A', motivo: '', efeitos: [], quando: 0 });
    const ext = '11111111-1111-4111-8111-111111111111';
    const a = await escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html, externalId: ext });
    const b = await escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html, externalId: ext });
    assert.deepEqual([a.repetido, b.repetido, a.id === b.id], [false, true, true]);
    assert.equal(plane.comentarios.length, 1);
    // Mesmo external_id num comentário de OUTRA carta do projeto: o 409 não vale como prova.
    plane.comentarios[0].issue = '22222222-2222-4222-8222-222222222222';
    await assert.rejects(escritor.comentar({ projetoId: PROJ, cartaId: CARTA, html, externalId: ext }), /fora desta carta/);
  } finally { await fs.rm(dir, { recursive: true }); }
});

// ---------- ordem de escrita ----------

test('ordem: preparar não escreve; confirmar = identidade → releitura → PENDENTE → comentário → releitura → PATCH → verificação → recibo → CONCLUÍDA', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    assert.deepEqual(m.plane.escritas, [], 'o preparar escreveu no Plane');
    assert.deepEqual(await m.linhas(), [], 'o preparar escreveu no diário');
    assert.deepEqual(p.mudancas, ['tirar a label ASTARGNE', 'trocar na descrição (ASTARGNE: qual das duas?) por (decidido em 31/10: Usar a fonte A)', 'estado: Todo → Done']);
    assert.match(p.comentario, /^DECISAO\/v1 · Painel Admin \(C-3PO\) · decisão do dono\nCarta: PAINEL-53\nDecisão: Usar a fonte A/);
    assert.equal(p.confirmacaoId.length, 36);
    m.plane.chamadas.length = 0;
    const r = await m.gravar.confirmar(p.confirmacaoId, DONO);
    assert.equal(r.resultado, 'aplicado');
    const essenciais = m.plane.chamadas.filter(c => /users\/me|^POST|^PATCH|^GET .*\/projects\/[^/]+\/work-items\/[0-9a-f-]{36}\/$/.test(c))
      .map(c => (c.includes('users/me') ? 'identidade' : c.startsWith('POST') ? 'comentario' : c.startsWith('PATCH') ? 'patch' : 'releitura'));
    assert.deepEqual(essenciais, ['identidade', 'releitura', 'comentario', 'releitura', 'patch', 'releitura', 'comentario']);
    assert.deepEqual(m.plane.escritas.map(e => (e.tipo === 'comentario' ? e.html.slice(11, 31) : e.tipo)),
      ['DECISAO/v1</strong> ', 'patch', 'DECISAO-APLICACAO/v1']);
    const chave = m.plane.escritas[0].external_id;
    assert.equal(m.plane.escritas[2].external_id, `${chave}:aplicacao`);
    assert.deepEqual((await m.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE', 'COMENTARIO_GRAVADO', 'DECISAO_CONCLUIDA']);
    assert.deepEqual(nomes(m.plane), ['C-3PO']);
    assert.equal(m.plane.carta.state, m.plane.S.Done.id);
    assert.equal(m.plane.carta.description_html, '<p>Escolher a fonte (decidido em 31/10: Usar a fonte A) antes de seguir.</p>');
    assert.match(m.plane.escritas[2].html, /Resultado: aplicado/);
    assert.equal(m.limpezas(), 1, 'o cache do Plane não foi limpo');
    // A mesma confirmação devolve o resultado guardado e não escreve de novo.
    assert.deepEqual(await m.gravar.confirmar(p.confirmacaoId, DONO), r);
    assert.equal(m.plane.escritas.length, 3);
  } finally { await m.limpar(); }
});

test('carta mudou entre preparar e confirmar: recusa sem escrita, nem no Plane nem no diário', async () => {
  for (const mudar of [(pl) => { pl.carta.labels.push(pl.L.BLOQUEADA.id); }, (pl) => { pl.carta.name = 'outro título'; },
    (pl) => { pl.comentarios.push({ id: 'novo', issue: CARTA, comment_html: '<p>espera</p>', actor: OUTRO_ATOR }); },
    (pl) => { pl.carta.description_html += '<p>mais</p>'; }]) {
    const m = await montarMesa();
    try {
      const p = await m.gravar.preparar(PEDIDO, DONO);
      mudar(m.plane);
      await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO), (e) => e.status === 409 && /nada foi gravado: a carta mudou desde o preparar/.test(e.message));
      assert.deepEqual(m.plane.escritas, []);
      assert.deepEqual(await m.linhas(), []);
    } finally { await m.limpar(); }
  }
});

test('preparar recusa: carta sem decisão do dono e lease ativo da orquestração', async () => {
  const m = await montarMesa();
  try {
    m.plane.carta.labels = [m.plane.L.BLOQUEADA.id];
    await assert.rejects(m.gravar.preparar({ ...PEDIDO, efeitos: { destravar: false, produto: 'manter', estado: null } }, DONO), /não espera decisão/);
    m.plane.carta.labels = [m.plane.L.ASTARGNE.id];
    await m.estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'k-lease' });
    await assert.rejects(m.gravar.preparar(PEDIDO, DONO), (e) => e.status === 409 && /lease ativo/.test(e.message));
    assert.deepEqual(m.plane.escritas, []);
  } finally { await m.limpar(); }
});

test('falha do PATCH é registrada: o resultado vem da releitura (não aplicado), o recibo diz isso e a decisão conclui', async () => {
  for (const [falha, nota] of [[500, /PATCH: Plane recusou a alteração \(HTTP 500\)/], ['timeout', /PATCH: o PATCH não respondeu/], [200, null]]) {
    const m = await montarMesa();
    try {
      const p = await m.gravar.preparar(PEDIDO, DONO);
      m.plane.falhar[`PATCH /workspaces/astargne/projects/${PROJ}/work-items/`] = falha; // 200 sem aplicar nada
      const r = await m.gravar.confirmar(p.confirmacaoId, DONO);
      assert.equal(r.resultado, 'não aplicado', String(falha));
      const fim = (await m.linhas()).at(-1);
      assert.equal(fim.tipo, 'DECISAO_CONCLUIDA');
      if (nota) assert.match(fim.falhaPatch ? `PATCH: ${fim.falhaPatch}` : '', nota);
      assert.match(m.plane.escritas.at(-1).html, /Resultado: não aplicado/);
      assert.ok(nomes(m.plane).includes('ASTARGNE'));
    } finally { await m.limpar(); }
  }
});

test('escritor de fora durante a aplicação: as atividades lidas depois marcam divergente', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    m.plane.antes[`PATCH /workspaces/astargne/projects/${PROJ}/work-items/`] = (pl) => {
      pl.atividades.push({ id: 'a1', field: 'labels', actor: OUTRO_ATOR, created_at: '2026-10-31T12:00:00.123456Z' });
    };
    const r = await m.gravar.confirmar(p.confirmacaoId, DONO);
    assert.equal(r.resultado, 'divergente');
    assert.ok(r.notas.some(n => /1 alteração de outro ator/.test(n)), r.notas.join());
  } finally { await m.limpar(); }
});

test('timeout no comentário de intenção não segue; a retomada usa a mesma chave e o 409 evita duplicar', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    const rotaComentario = `POST /workspaces/astargne/projects/${PROJ}/work-items/${CARTA}/comments/`;
    // O Plane gravou, mas a resposta não chegou.
    m.plane.antes[rotaComentario] = (pl, opcoes) => {
      const corpo = JSON.parse(opcoes.body);
      pl.comentarios.push({ id: '33333333-3333-4333-8333-333333333333', issue: CARTA, actor: ADMIN, edited_at: null, ...corpo });
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    };
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO), /sem confirmação do Plane; nada mais foi feito/);
    assert.ok(!m.plane.chamadas.some(c => c.startsWith('PATCH')), 'seguiu para o PATCH depois do timeout');
    assert.deepEqual((await m.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE']);
    const [pendente] = await m.servico.pendentes();
    assert.equal(pendente.etapa, 'pendente');
    delete m.plane.antes[rotaComentario];
    await assert.rejects(m.gravar.preparar(PEDIDO, DONO), (e) => e.status === 409 && /aplicação pendente desta carta/.test(e.message));
    const prep = await m.retomar.preparar({ chave: pendente.chave }, DONO);
    // A preparação relê a carta (A3.1): o comentário chegou, só a resposta se perdeu.
    assert.match(prep.aviso, /já está na carta/);
    const r = await m.retomar.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'aplicado');
    assert.equal(m.plane.comentarios.filter(c => c.external_id === pendente.chave).length, 1);
    assert.deepEqual((await m.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE', 'COMENTARIO_GRAVADO', 'DECISAO_CONCLUIDA']);
    assert.deepEqual(await m.servico.pendentes(), []);
  } finally { await m.limpar(); }
});

test('retomada: comentário gravado e queda antes do PATCH recomeça do diário; carta mudada sem comentário abandona sem escrever', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    // A 1ª leitura das labels (no confirmar) passa; a 2ª (a releitura depois do comentário) cai.
    let leiturasLabels = 0;
    m.plane.antes[`GET /workspaces/astargne/projects/${PROJ}/labels/`] = () => {
      leiturasLabels += 1;
      if (leiturasLabels === 2) throw Object.assign(new Error('rede'), { name: 'TypeError' });
    };
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO), /rede/);
    assert.deepEqual((await m.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE', 'COMENTARIO_GRAVADO']);
    assert.equal((await m.servico.pendentes())[0].etapa, 'comentario-gravado');
    m.plane.antes = {};
    const [pendente] = await m.servico.pendentes();
    const prep = await m.retomar.preparar({ chave: pendente.chave }, DONO);
    const r = await m.retomar.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'aplicado');
    assert.equal(m.plane.escritas.filter(e => e.tipo === 'comentario').length, 2, 'intenção + recibo, sem duplicar');
  } finally { await m.limpar(); }

  const n = await montarMesa();
  try {
    const p = await n.gravar.preparar(PEDIDO, DONO);
    n.plane.falhar[`POST /workspaces/astargne/projects/${PROJ}/work-items/${CARTA}/comments/`] = 'timeout';
    await assert.rejects(n.gravar.confirmar(p.confirmacaoId, DONO), /sem confirmação/);
    n.plane.falhar = {};
    n.plane.carta.labels.push(n.plane.L.BLOQUEADA.id);
    const [pendente] = await n.servico.pendentes();
    const prep = await n.retomar.preparar({ chave: pendente.chave }, DONO);
    const r = await n.retomar.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.resultado, 'abandonada');
    assert.deepEqual(n.plane.escritas, []);
    assert.deepEqual((await n.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE', 'DECISAO_ABANDONADA']);
  } finally { await n.limpar(); }
});

test('recusa explícita do Plane ao comentário (4xx) fecha a pendência como abandonada e não segue', async () => {
  const m = await montarMesa();
  try {
    const p = await m.gravar.preparar(PEDIDO, DONO);
    m.plane.falhar[`POST /workspaces/astargne/projects/${PROJ}/work-items/${CARTA}/comments/`] = 400;
    await assert.rejects(m.gravar.confirmar(p.confirmacaoId, DONO), /nada foi gravado: Plane recusou o comentário \(HTTP 400\)/);
    assert.deepEqual((await m.linhas()).map(l => l.tipo), ['DECISAO_PENDENTE', 'DECISAO_ABANDONADA']);
    assert.deepEqual(await m.servico.pendentes(), []);
  } finally { await m.limpar(); }
});

// ---------- fronteira HTTP (painel montado) ----------

async function pedir(painel, metodo, caminho, { corpo, sessao = true } = {}) {
  const req = Object.assign(Readable.from(corpo === undefined ? [] : [Buffer.from(JSON.stringify(corpo))]),
    { method: metodo, url: caminho, headers: cabecalhosDaBorda({ sessao }) });
  let texto = '';
  const res = { status: null, cabecalhos: {}, headersSent: false, setHeader(k, v) { this.cabecalhos[k.toLowerCase()] = v; },
    writeHead(s, h) { this.status = s; this.headersSent = true; Object.assign(this.cabecalhos, h ?? {}); }, write(t) { texto += t; }, end(t) { if (t) texto += t; } };
  await painel.atender(req, res);
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

test('HTTP: sem PLANE_ADMIN_ACTOR_ID a gaveta lê e diz por quê; preparar com sessão recusa 503 sem tocar no Plane', async () => {
  const plane = criarPlaneFalso();
  const { painel, limpar } = await montarComFalsos({ ambiente: { ORQ_OWNER_USER_ID: '1', PLANE_API_KEY: GUEST_KEY }, externos: { fetchPlane: plane.fetchImpl } });
  try {
    const carta = await pedir(painel, 'GET', '/api/decisao/carta?carta=PAINEL-53', { sessao: false });
    assert.equal(carta.status, 200);
    assert.deepEqual(carta.corpo.escrita, { habilitada: false, motivo: 'PLANE_ADMIN_ACTOR_ID ausente no .env: a mesa fica só leitura' });
    plane.chamadas.length = 0;
    const r = await pedir(painel, 'POST', '/api/decisao/preparar', { corpo: PEDIDO });
    assert.deepEqual(r, { status: 503, corpo: { erro: 'PLANE_ADMIN_ACTOR_ID ausente no .env: a mesa fica só leitura' } });
    assert.deepEqual(plane.chamadas, []);
    assert.equal((await pedir(painel, 'GET', '/api/decisao/carta?carta=ANYA-1', { sessao: false })).status, 422);
  } finally { await limpar(); }
});

test('HTTP: com sessão do dono, preparar mostra o que muda e só o confirmar grava; campo a mais no corpo recusa', async () => {
  const plane = criarPlaneFalso();
  const { arquivo, dir } = await arquivoChave();
  const { painel, limpar } = await montarComFalsos({ ambiente: { ORQ_OWNER_USER_ID: '1', PLANE_API_KEY: GUEST_KEY, PLANE_ADMIN_ACTOR_ID: ADMIN },
    externos: { fetchPlane: plane.fetchImpl, arquivoChaveAdmin: arquivo } });
  try {
    assert.equal((await pedir(painel, 'POST', '/api/decisao/preparar', { corpo: { ...PEDIDO, extra: 1 } })).status, 422);
    const semSessao = await pedir(painel, 'POST', '/api/decisao/preparar', { corpo: PEDIDO, sessao: false });
    assert.equal(semSessao.status, 401);
    const p = await pedir(painel, 'POST', '/api/decisao/preparar', { corpo: PEDIDO });
    assert.equal(p.status, 200);
    assert.deepEqual(plane.escritas, []);
    assert.ok(!JSON.stringify(p.corpo).includes(CHAVE_ADMIN));
    const c = await pedir(painel, 'POST', '/api/decisao/confirmar', { corpo: { confirmacaoId: p.corpo.confirmacaoId } });
    assert.equal(c.status, 200);
    assert.equal(c.corpo.resultado, 'aplicado');
    assert.equal(plane.escritas.length, 3);
    const depois = await pedir(painel, 'GET', '/api/decisao/carta?carta=PAINEL-53', { sessao: false });
    assert.deepEqual(depois.corpo.comentarios.map(x => x.mesa), ['decisao', 'recibo']);
    assert.equal(depois.corpo.esperaDecisao, false);
  } finally { await limpar(); await fs.rm(dir, { recursive: true }); }
});
