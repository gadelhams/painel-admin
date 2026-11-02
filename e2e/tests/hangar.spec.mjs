import { test, expect } from '@playwright/test';

// Hangar (28/10/2026): a entrada do painel. Com a API simulada, prova que a
// raiz abre o Hangar, que droids e naves vêm só de GET, que a encomenda é
// registrada por preparar + confirmar (PAINEL-50) e que sair da aba para o poll de 5 s.

const CARTA = '00000000-0000-4000-8000-000000000003';
const nave = (pasta, extra = {}) => ({
  pasta, titulo: pasta, sigla: 'ALFA', semente: 1, congelado: false, producao: null, planePrj: 'P', fonte: 'plane', estado: 'ok', url: 'https://plane.exemplo/alfa',
  cartas: { abertas: 2, andamento: 1, feitas: 1 }, pct: 25, decisoesProduto: [], cartoes: {}, pecas: [], ...extra,
});
const hangar = {
  naves: [
    nave('alfa', {
      jogoNativo: 'Jogo X pela Steam',
      pecas: [
        { titulo: 'Coleta', total: 3, abertas: 1, andamento: 1, feitas: 1, pct: 33, proximas: [{ id: 'ALFA-2', titulo: 'Busca <b>rápida</b>', url: null }],
          decisoes: [{ id: 'ALFA-3', titulo: 'Qual fonte usar?', url: null, modulo: 'Coleta', tags: ['ASTARGNE'], detalhe: null }] },
        { titulo: 'Busca', total: 1, abertas: 1, andamento: 0, feitas: 0, pct: 0, proximas: [], decisoes: [] },
      ],
      decisoesProduto: [{ id: 'ALFA-4', titulo: 'Abrir para visitantes?', url: null, modulo: 'Busca', tags: ['ASTARGNE'], detalhe: null }],
      cartoes: { [CARTA]: [0, 'ALFA-3', 'Qual fonte usar?'] },
      identificadores: { 'ALFA-3': CARTA },
    }),
    nave('beta', { sigla: null, planePrj: null, estado: 'sem_backlog', fonte: null, url: null, pct: 0, cartas: { abertas: 0, andamento: 0, feitas: 0 } }),
  ],
  acervo: [{ id: 'padroes', titulo: 'Padrões', itens: ['PADROES-BACKLOG.md'] }, { id: 'orientacoes', titulo: 'Orientações', itens: [] }, { id: 'skills', titulo: 'Skills', itens: ['fecho-de-entrega'] }, { id: 'licoes', titulo: 'Lições vivas', itens: [] }],
};
const T = (provedor, modelo, esforco) => ({ provedor, modelo, esforco });
const frota = { estado: 'ok', versao: 5, hash: 'f'.repeat(64), papeis: { executor: ['orquestracao', 'codificacao_testes', 'validacao'], zelador: ['zelador'] },
  conteudo: { executor: { orquestracao: T('claude', 'claude-opus-5', 'max'), codificacao_testes: T('openai', 'gpt-6-astra', 'xhigh'), validacao: T('claude', 'claude-opus-5', 'high') },
    zelador: { zelador: T('claude', 'claude-opus-5', 'medium') } } };
const agora = () => new Date().toISOString();
const sessoes = (extra = []) => ({
  em: agora(),
  ias: [{ id: 'claude', viva: true, sessoes: 1 }, { id: 'codex', viva: false, sessoes: 0 }, { id: 'grok', viva: false, sessoes: 0 }],
  sessoes: [{ id: 'sessao-1', ia: 'claude', projeto: 'alfa', estado: 'trabalhando', desde: agora(), cartao: CARTA,
    acoes: [{ em: agora(), tipo: 'editar', ferramenta: 'Edit', arquivo: 'src/coleta.js' }, { em: agora(), tipo: 'consultar', ferramenta: 'Skill', setor: 'skills', item: 'fecho-de-entrega' }] }, ...extra],
});

async function fixtures(page, { sessao = { estado: 'sem-sessao' }, droidsExtra = [], semSso = false, zelador = { atual: null, porProjeto: {}, diario: [] }, playInicial = {} } = {}) {
  const chamadas = [];
  const encomendas = [];
  const errosPagina = [];
  const nativo = { projeto: 'P', pasta: 'alfa', titulo: 'alfa', jogo: 'Jogo X pela Steam', liberada: false, ate: null, desde: null };
  const play = { projeto: 'P', pasta: 'alfa', titulo: 'alfa', sigla: 'ALFA', situacao: 'desligado', desde: null, suspenso: null, emCurso: null, despacho: null, ...playInicial };
  page.on('pageerror', (e) => errosPagina.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    chamadas.push({ metodo: req.method(), caminho: url.pathname, em: Date.now() });
    const json = (d) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (url.pathname === '/api/sessao') return json(sessao);
    if (url.pathname === '/api/hangar') return json(hangar);
    if (url.pathname === '/api/hangar/sessoes') return json(sessoes(droidsExtra));
    if (url.pathname === '/api/projetos') return json({ projetos: [] });
    if (url.pathname === '/api/backlog') return json({ projetos: [] });
    if (url.pathname === '/api/decisoes') return json({ decisoes: [] });
    if (url.pathname === '/api/producao') return json({ sondas: [] });
    if (url.pathname === '/api/alinhamento') return json({ projetos: [], totais: {}, total: 0 });
    if (url.pathname === '/api/orquestracao/voz') return json({ xai: false });
    if (url.pathname === '/api/orquestracao/frota') return json(frota);
    if (url.pathname === '/api/tts') return json({ disponivel: false });
    // Liberação nativa simulada: o preparar devolve o desafio, o confirmar grava e o GET passa a mostrar.
    if (url.pathname === '/api/orquestracao/nativo') return json({ legivel: true, horas: [2, 4, 8, 12], projetos: [nativo] });
    if (url.pathname === '/api/orquestracao/nativo/preparar') {
      const corpo = chamadas.at(-1).corpo = req.postDataJSON();
      const ate = corpo.horas ? new Date(Date.now() + corpo.horas * 3_600_000).toISOString() : null;
      return json({ confirmacaoId: 'c1', expiraEm: new Date(Date.now() + 120_000).toISOString(), ligar: corpo.horas > 0, ate, jaEstava: false, aviso: 'Só ligue com a Steam livre.' });
    }
    if (url.pathname === '/api/orquestracao/nativo/confirmar') {
      chamadas.at(-1).corpo = req.postDataJSON();
      const ultimo = chamadas.filter((c) => c.caminho === '/api/orquestracao/nativo/preparar').at(-1).corpo;
      Object.assign(nativo, ultimo.horas ? { liberada: true, ate: new Date(Date.now() + ultimo.horas * 3_600_000).toISOString() } : { liberada: false, ate: null });
      return json({ nome: 'alfa', ...nativo });
    }
    // Encomendas simuladas: o preparar devolve o resumo (com o texto como veio), o confirmar acrescenta a pendente.
    if (url.pathname === '/api/hangar/encomendas') return json({ legivel: true, pendentes: encomendas, atendidas: 0, ignoradas: 0, truncadasNoMeio: 0, truncadaNoFim: false });
    if (url.pathname === '/api/hangar/encomendas/preparar') {
      const corpo = chamadas.at(-1).corpo = req.postDataJSON();
      if (semSso) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ erro: 'entre no Cadastro Único para confirmar esta ação' }) });
      return json({ confirmacaoId: 'e1', expiraEm: new Date(Date.now() + 120_000).toISOString(), ...corpo, aviso: 'Confirmar só registra o pedido no painel.' });
    }
    if (url.pathname === '/api/hangar/encomendas/confirmar') {
      chamadas.at(-1).corpo = req.postDataJSON();
      const { nome, sigla, modulos } = chamadas.filter((c) => c.caminho === '/api/hangar/encomendas/preparar').at(-1).corpo;
      const e = { id: '00000000-0000-4000-8000-0000000000e1', quando: '2026-10-31T12:00:00.000Z', nome, sigla, modulos, estado: 'pedida' };
      encomendas.push(e);
      return json(e);
    }
    // Play por nave simulado (F3): preparar devolve o desafio; confirmar grava e o GET passa a mostrar.
    if (url.pathname === '/api/orquestracao/play') return json({ legivel: true, agora: agora(), projetos: [play], observacao: '' });
    if (url.pathname === '/api/orquestracao/play/preparar') {
      const corpo = chamadas.at(-1).corpo = req.postDataJSON();
      return json({ confirmacaoId: 'p1', expiraEm: new Date(Date.now() + 120_000).toISOString(), nome: 'alfa', ligar: corpo.ligar, situacao: play.situacao,
        jaEstava: false, emCurso: null, aviso: corpo.ligar ? 'Confirmar liga o play: o zelador passa a limpar as cartas.' : 'Confirmar desliga o play agora.' });
    }
    if (url.pathname === '/api/orquestracao/play/confirmar') {
      chamadas.at(-1).corpo = req.postDataJSON();
      const ultimo = chamadas.filter((c) => c.caminho === '/api/orquestracao/play/preparar').at(-1).corpo;
      Object.assign(play, { situacao: ultimo.ligar ? 'ligado' : 'desligado', desde: ultimo.ligar ? agora() : null });
      return json({ nome: 'alfa', projeto: 'P', situacao: play.situacao, desde: play.desde });
    }
    if (url.pathname === '/api/orquestracao/zelador') return json(zelador);
    // C-3PO simulado: nunca o LLM real em teste. Responde em SSE e devolve a sessão.
    if (url.pathname === '/api/conversa' && req.method() === 'POST') {
      chamadas.at(-1).corpo = req.postDataJSON();
      const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('inicio', { sessao: 'sessao-teste' }) + sse('token', { texto: 'Oh, céus! ' }) + sse('token', { texto: 'A nave <b>alfa</b> vai bem.' }) + sse('fim', { sessao: 'sessao-teste' }) });
    }
    return json({});
  });
  return { chamadas, errosPagina };
}

test('a raiz abre o Hangar com droids e naves só por GET', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('.barra-abas .aba.ativa')).toHaveText('Hangar');
  await expect(page.locator('#hg-droids [data-droid]')).toHaveCount(1);
  await expect(page.locator('#hg-droids')).toContainText('C1');
  await expect(page.locator('#hg-droids')).toContainText('ALFA-3');
  await expect(page.locator('#hg-projetos [data-proj]')).toHaveCount(2);
  await expect(page.locator('#hg-projetos')).toContainText('Nas docas · 1 de 4');
  // Cena 3D ou, sem WebGL no headless, o aviso honesto; nunca erro.
  await expect(page.locator('#hg-camada canvas, #hg-aviso')).toHaveCount(1);
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

// PAINEL-57: a ponte REST do CKBL e o commit citam a carta por SIGLA-N; o
// índice reverso da nave a troca pelo UUID e ela aparece igual à do MCP.
test('carta citada por SIGLA-N aparece igual à citada por UUID; fora do backlog, pelo identificador', async ({ page }) => {
  const ponte = (id, cartao) => ({ id, ia: 'codex', projeto: 'alfa', estado: 'trabalhando', desde: agora(), cartao,
    acoes: [{ em: agora(), tipo: 'cartao', ferramenta: 'exec', programa: 'node', itemPlane: cartao }] });
  const audit = await fixtures(page, { droidsExtra: [ponte('sessao-2', 'ALFA-3'), ponte('sessao-3', 'ALFA-99')] });
  await page.goto('/');
  await expect(page.locator('#hg-droids [data-droid]')).toHaveCount(3);
  await expect(page.locator('#hg-droids [data-droid="sessao-2"]')).toContainText('ALFA-3');
  await expect(page.locator('#hg-droids [data-droid="sessao-2"]')).toContainText('Qual fonte usar?');
  await expect(page.locator('#hg-droids [data-droid="sessao-3"]')).toContainText('ALFA-99');
  await page.locator('#hg-droids [data-droid="sessao-2"]').click();
  await expect(page.locator('#hg-holo-fala')).toContainText('ALFA-3: Qual fonte usar?', { timeout: 10_000 });
  expect(audit.errosPagina).toEqual([]);
});

test('popup do C-3PO: título do Plane escapado e a decisão de produto explicada', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await expect(page.locator('#hg-holo')).toBeVisible();
  await expect(page.locator('#hg-holo-titulo')).toContainText('alfa');
  await page.locator('#hg-holo-corpo [data-alvo]').filter({ hasText: 'decisão de produto' }).click();
  await expect(page.locator('#hg-holo-fala')).toContainText('label PRODUTO', { timeout: 10_000 });
  await expect(page.locator('#hg-holo-corpo')).toContainText('Abrir para visitantes?');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.locator('#hg-holo-corpo [data-alvo]').filter({ hasText: 'Casco' }).first().click();
  await expect(page.locator('#hg-holo-corpo')).toContainText('Busca <b>rápida</b>');
  await expect(page.locator('#hg-holo-corpo b', { hasText: 'rápida' })).toHaveCount(0);
  expect(audit.errosPagina).toEqual([]);
});

test('encomenda: preparar mostra o resumo escapado, confirmar registra e a vaga mostra "pedida"; abrir no painel leva ao projeto', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('[data-berco]').click();
  await page.locator('#hg-form-encomenda button[type=submit]').click();
  await expect(page.locator('#hg-enc-erro')).toHaveText('Falta o nome do projeto.');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  await page.fill('#hg-enc-nome', 'Bot de <b>Receitas</b>');
  await page.fill('#hg-enc-sigla', 'recei');
  await page.fill('#hg-enc-mod', 'Coleta\n\nBusca');
  await page.locator('#hg-form-encomenda button[type=submit]').click();
  // Preparar: o resumo vem do servidor; nada gravado ainda.
  await expect(page.locator('#hg-holo-titulo')).toContainText('Bot de <b>Receitas</b>');
  await expect(page.locator('#hg-holo-titulo b', { hasText: 'Receitas' })).toHaveCount(0);
  await expect(page.locator('#hg-holo-titulo')).toContainText('sigla RECEI');
  await expect(page.locator('#hg-holo-corpo')).toContainText('Coleta');
  await expect(page.locator('#hg-enc-aviso')).toHaveText('Confirmar só registra o pedido no painel.');
  const preparo = audit.chamadas.filter((c) => c.metodo === 'POST');
  expect(preparo.map((c) => [c.caminho, c.corpo])).toEqual([['/api/hangar/encomendas/preparar', { nome: 'Bot de <b>Receitas</b>', sigla: 'RECEI', modulos: ['Coleta', 'Busca'] }]]);
  // Confirmar: registra e a vaga passa a mostrar a pendente.
  await page.locator('[data-acao=confirmar]').click();
  await expect(page.locator('#hg-enc-registrada')).toHaveText('pedida em 31/10/2026, aguardando o orquestrador');
  expect(audit.chamadas.filter((c) => c.metodo === 'POST').map((c) => [c.caminho, c.corpo]).at(-1)).toEqual(['/api/hangar/encomendas/confirmar', { confirmacaoId: 'e1' }]);
  await expect(page.locator('#hg-projetos [data-encomenda]')).toHaveText('Bot de <b>Receitas</b> · pedida em 31/10/2026, aguardando o orquestrador');
  await page.locator('[data-acao=voltar]').click();
  await expect(page.locator('#hg-enc-pendentes')).toContainText('pedida em 31/10/2026, aguardando o orquestrador');
  await expect(page.locator('#hg-enc-pendentes b', { hasText: 'Receitas' })).toHaveCount(1);
  await expect(page.locator('#hg-enc-pendentes b b')).toHaveCount(0);
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.locator('#hg-holo-corpo a', { hasText: 'abrir no painel' }).click();
  await expect(page).toHaveURL(/#\/projeto\/alfa$/);
  await expect(page.locator('#aba-projetos')).toBeVisible();
  expect(audit.errosPagina).toEqual([]);
});

test('encomenda sem sessão do Cadastro Único: o preparar recusa, o aviso aparece e nada é confirmado', async ({ page }) => {
  const audit = await fixtures(page, { semSso: true });
  await page.goto('/');
  await page.locator('[data-berco]').click();
  await page.fill('#hg-enc-nome', 'Bot');
  await page.fill('#hg-enc-mod', 'Coleta');
  await page.locator('#hg-form-encomenda button[type=submit]').click();
  await expect(page.locator('#hg-enc-erro')).toHaveText('entre no Cadastro Único para confirmar esta ação Entre em https://astargne.com/login e volte a esta aba.');
  await expect(page.locator('#hg-form-encomenda')).toBeVisible();
  expect(audit.chamadas.filter((c) => c.caminho === '/api/hangar/encomendas/confirmar')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('fora da aba o Hangar para o poll de sessões', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('#hg-droids [data-droid]')).toHaveCount(1);
  await page.locator('.barra-abas .aba', { hasText: 'Backlog' }).click();
  const marco = Date.now();
  await page.waitForTimeout(6_500);
  expect(audit.chamadas.filter((c) => c.caminho === '/api/hangar/sessoes' && c.em > marco)).toEqual([]);
  await page.locator('.barra-abas .aba', { hasText: 'Hangar' }).click();
  await expect.poll(() => audit.chamadas.filter((c) => c.caminho === '/api/hangar/sessoes' && c.em > marco).length).toBeGreaterThan(0);
  expect(audit.errosPagina).toEqual([]);
});

test('fábrica mostra a frota atual em leitura no popup do C-3PO, sem editar nem escrever', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('#hg-droids [data-droid]')).toHaveCount(1);
  await page.locator('#hg-fabricas [data-fab="codex"]').click();
  await expect(page.locator('#hg-holo')).toBeVisible();
  await expect(page.locator('#hg-holo-titulo')).toContainText('Fábrica Codex');
  await expect(page.locator('#hg-holo-corpo')).toContainText('Frota v5 · só leitura');
  await expect(page.locator('#hg-holo-corpo')).toContainText('codificação');
  await expect(page.locator('#hg-holo-corpo')).toContainText('openai/gpt-6-astra/xhigh');
  await expect(page.locator('#hg-holo-corpo')).toContainText('claude/claude-opus-5/medium');
  await expect(page.locator('#hg-holo-corpo select, #hg-holo-corpo input')).toHaveCount(0);
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('popup do C-3PO conversa sobre o objeto clicado: contexto na pergunta, resposta em texto e sessão do /c3po/', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await expect(page.locator('#hg-holo')).toBeVisible();
  await page.fill('#hg-conversa-pergunta', 'O que falta nesta nave?');
  await page.locator('#hg-conversa-enviar').click();
  await expect(page.locator('#hg-conversa-resp .hg-conversa-c3po')).toHaveText('Oh, céus! A nave <b>alfa</b> vai bem.');
  await expect(page.locator('#hg-conversa-resp b')).toHaveCount(0);
  await expect(page.locator('#hg-conversa-resp .hg-conversa-eu')).toHaveText('O que falta nesta nave?');
  const escritas = audit.chamadas.filter((c) => c.metodo !== 'GET');
  expect(escritas.map((c) => c.caminho)).toEqual(['/api/conversa']);
  expect(escritas[0].corpo.mensagem).toMatch(/^\[No Hangar do painel, olhando: C-3PO · .*alfa.*\] O que falta nesta nave\?$/);
  expect(await page.evaluate(() => sessionStorage.getItem('c3po-sessao'))).toBe('sessao-teste');
  // Segunda pergunta leva a sessão; trocar de objeto limpa a resposta.
  await page.fill('#hg-conversa-pergunta', 'E agora?');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hg-conversa-resp .hg-conversa-c3po')).toHaveCount(2);
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')[1].corpo.sessao).toBe('sessao-teste');
  await page.locator('#hg-projetos [data-proj="beta"]').click();
  await expect(page.locator('#hg-conversa-resp')).toBeHidden();
  await expect(page.locator('a.hg-conversa-mais')).toHaveAttribute('href', '/c3po/');
  expect(audit.errosPagina).toEqual([]);
});

test('nave com jogo nativo: o interruptor Steam livre prepara e confirma em duas ações; nave sem jogo não mostra', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await expect(page.locator('#hg-nativo')).toBeVisible();
  await expect(page.locator('#hg-nativo-jogo')).toHaveText('Jogo X pela Steam');
  await expect(page.locator('#hg-nativo-estado')).toHaveText(/^Desligado/);
  await page.selectOption('#hg-nativo-horas', '2');
  await page.locator('#hg-nativo-caixa').check();
  // Marcar só prepara: nada gravado até a segunda ação.
  await expect(page.locator('#hg-nativo-confirmar')).toHaveText(/^Confirmar: liberar até \d\d:\d\d$/);
  await expect(page.locator('#hg-nativo-aviso')).toHaveText('Só ligue com a Steam livre.');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET').map((c) => c.caminho)).toEqual(['/api/orquestracao/nativo/preparar']);
  expect(audit.chamadas.at(-1).corpo).toEqual({ projeto: 'P', horas: 2 });
  await page.locator('#hg-nativo-confirmar').click();
  await expect(page.locator('#hg-nativo-estado')).toHaveText(/^Liberado até \d\d:\d\d \(faltam (1 h 59 min|2 h)\)/);
  await expect(page.locator('#hg-nativo-caixa')).toBeChecked();
  // Desligar também é preparar + confirmar.
  await page.locator('#hg-nativo-caixa').uncheck();
  await expect(page.locator('#hg-nativo-confirmar')).toHaveText('Confirmar: desligar agora');
  await page.locator('#hg-nativo-confirmar').click();
  await expect(page.locator('#hg-nativo-estado')).toHaveText(/^Desligado/);
  const escritas = audit.chamadas.filter((c) => c.metodo !== 'GET');
  expect(escritas.map((c) => [c.caminho, c.corpo])).toEqual([
    ['/api/orquestracao/nativo/preparar', { projeto: 'P', horas: 2 }], ['/api/orquestracao/nativo/confirmar', { confirmacaoId: 'c1' }],
    ['/api/orquestracao/nativo/preparar', { projeto: 'P', horas: 0 }], ['/api/orquestracao/nativo/confirmar', { confirmacaoId: 'c1' }],
  ]);
  await page.locator('#hg-projetos [data-proj="beta"]').click();
  await expect(page.locator('#hg-nativo')).toBeHidden();
  expect(audit.errosPagina).toEqual([]);
});

test('play da nave (F3): marcar só prepara, confirmar liga por SSO; o droid zelador nasce do job com a cor do papel; o bloqueio só do dono fica em destaque', async ({ page }) => {
  const fim = { quando: agora(), feita: false, abertas: 2, emAndamento: 0, soDono: true,
    categorias: { esperaPuxar: [], tarefaDono: ['ALFA-5'], decisao: ['ALFA-3', 'ALFA-4'], esperaOutraCarta: [], esperaIntegracao: [] } };
  const audit = await fixtures(page, { zelador: { atual: { jobId: 'job-zel-1', projetoId: 'P', pasta: 'alfa', sigla: 'ALFA', provedor: 'claude', fase: 'cli', desde: agora() },
    porProjeto: { P: fim }, diario: [{ tipo: 'JOB_INICIO', jobId: 'job-zel-1', projetoId: 'P', quando: agora() }] } });
  await page.goto('/');
  // O droid zelador aparece na lista com a cor do papel, não a da fábrica.
  const zel = page.locator('#hg-droids [data-droid="zelador:job-zel-1"]');
  await expect(zel).toContainText('Z1');
  await expect(zel).toContainText('Claude · zelador');
  await expect(zel).toHaveAttribute('style', /--cor:#e3a86b/);
  await expect(page.locator('#hg-projetos [data-proj="alfa"]')).toContainText('bloqueio: só o dono');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await expect(page.locator('#hg-play')).toBeVisible();
  await expect(page.locator('#hg-play-estado')).toHaveText(/^Desligado: nenhum droid da frota/);
  await expect(page.locator('#hg-play-bloqueio')).toContainText('Bloqueada: só decisões e tarefas do dono seguram esta nave.');
  await expect(page.locator('#hg-play-bloqueio')).toContainText('Decisão: ALFA-3, ALFA-4');
  await expect(page.locator('#hg-play-bloqueio')).toContainText('Tarefa do dono: ALFA-5');
  await page.locator('#hg-play-caixa').check();
  await expect(page.locator('#hg-play-confirmar')).toHaveText('Confirmar: ligar o play');
  await expect(page.locator('#hg-play-aviso')).toContainText('o zelador passa a limpar as cartas');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET').map((c) => c.caminho)).toEqual(['/api/orquestracao/play/preparar']);
  await page.locator('#hg-play-confirmar').click();
  await expect(page.locator('#hg-play-estado')).toHaveText(/^Ligado: o zelador limpa as cartas/);
  await page.locator('#hg-play-caixa').uncheck();
  await expect(page.locator('#hg-play-confirmar')).toHaveText('Confirmar: desligar agora');
  await page.locator('#hg-play-cancelar').click();
  await expect(page.locator('#hg-play-confirma')).toBeHidden();
  const escritas = audit.chamadas.filter((c) => c.metodo !== 'GET');
  expect(escritas.map((c) => [c.caminho, c.corpo])).toEqual([
    ['/api/orquestracao/play/preparar', { projeto: 'P', ligar: true }], ['/api/orquestracao/play/confirmar', { confirmacaoId: 'p1' }],
    ['/api/orquestracao/play/preparar', { projeto: 'P', ligar: false }],
  ]);
  await page.locator('#hg-projetos [data-proj="beta"]').click();
  await expect(page.locator('#hg-play')).toBeHidden();
  expect(audit.errosPagina).toEqual([]);
});

test('PAINEL-61: play ligado sem agendador diz que nada roda; com agendador, mostra o próximo job e o PRONTA que não foi para o dev', async ({ page }) => {
  const fim = { quando: agora(), feita: false, abertas: 3, emAndamento: 0, soDono: false, contagem: { aplicados: 1, recusados: 1 },
    categorias: { esperaPuxar: ['ALFA-2'], tarefaDono: [], decisao: [], esperaOutraCarta: [], esperaIntegracao: [] },
    prontaRecusadas: [{ carta: 'ALFA-2', resultado: 'MANTER', motivo: 'prontidão ao vivo recusou: estado inadequado para desenvolvimento' }] };
  const zelador = { atual: null, porProjeto: { P: fim }, diario: [], agendando: false, proximoEm: null, motivoOcioso: null,
    instancia: { agenda: false, motivo: 'ORQ_AGENDADOR ausente: esta instância não agenda vigília nem zelador' } };
  const audit = await fixtures(page, { zelador, playInicial: { situacao: 'ligado', desde: agora() } });
  await page.goto('/');
  await expect(page.locator('#hg-projetos [data-proj="alfa"]')).toContainText('play sem agendador');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await expect(page.locator('#hg-play-estado')).toContainText('Mas nada roda: ORQ_AGENDADOR ausente');
  await expect(page.locator('#hg-play-bloqueio')).toContainText('ALFA-2 não foi para o dev: prontidão ao vivo recusou: estado inadequado para desenvolvimento');
  await expect(page.locator('#hg-play-bloqueio')).toContainText('1 mudança(s) aplicada(s), 1 recusada(s)');
  // Agendador de pé: a nave diz quando sai o próximo job e por que a última volta pulou.
  const proximo = new Date(Date.now() + 120_000).toISOString();
  Object.assign(zelador, { agendando: true, proximoEm: proximo, motivoOcioso: 'ALFA: ocupado: sessão claude tocou o projeto nas últimas 120 min',
    instancia: { agenda: true, motivo: null } });
  await page.reload();
  await expect(page.locator('#hg-projetos [data-proj="alfa"]')).not.toContainText('play sem agendador');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  const hhmm = new Date(proximo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  await expect(page.locator('#hg-play-estado')).toContainText(`Próximo job do zelador às ${hhmm}.`);
  await expect(page.locator('#hg-play-estado')).toContainText('Última volta pulada: ocupado: sessão claude tocou o projeto nas últimas 120 min.');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('cabeçalho diz de quem é a sessão SSO: outra conta avisa e manda sair em astargne.com; dono mostra o nome', async ({ page }) => {
  const audit = await fixtures(page, { sessao: { estado: 'outra-conta', nome: 'astargne', email: 'outra@exemplo' } });
  await page.goto('/');
  await expect(page.locator('#sessao-sso .sessao-quem')).toHaveText('astargne · não é o dono');
  await expect(page.locator('#sessao-sso a')).toHaveAttribute('href', 'https://astargne.com');
  await expect(page.locator('#sessao-sso')).toHaveAttribute('data-estado', 'outra-conta');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('cabeçalho no loopback sem sessão aponta para a borda', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('#sessao-sso .sessao-quem')).toHaveText('sem sessão (loopback)');
  await expect(page.locator('#sessao-sso a')).toHaveAttribute('href', 'https://painel.vpn.astargne.com/');
});
