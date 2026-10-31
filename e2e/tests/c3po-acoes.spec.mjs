import { test, expect } from '@playwright/test';

// Fase 3 do C-3PO (31/10/2026): o motor (simulado, nunca o LLM real) devolve uma proposta
// no SSE; o cartão do chat prepara e confirma pelas rotas de duas ações. A "sessão do dono"
// é um cookie simulado que só esta fixture conhece; sem ele preparar e confirmar recusam
// com a mensagem genérica, como o autorizador real, e nada "executa".

const PROPOSTA = { id: '0a1b2c3d-0000-4000-8000-00000000abcd', projeto: 'painel-admin', titulo: 'Painel admin', comandoId: 'testes',
  comando: 'npm test', expiraEm: new Date(Date.now() + 1_800_000).toISOString() };
const CONFIRMACAO = '0a1b2c3d-0000-4000-8000-00000000c0f1';
const SEM_SESSAO = { erro: 'entre no Cadastro Único para confirmar esta ação' };

async function fixtures(page, { comSessao }) {
  if (comSessao) await page.context().addCookies([{ name: 'sessao-simulada', value: 'dono', url: 'http://127.0.0.1:17777' }]);
  const chamadas = [];
  const errosPagina = [];
  const estado = { executou: 0 };
  page.on('pageerror', (e) => errosPagina.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const json = (d, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(d) });
    if (req.method() === 'GET') {
      if (url.pathname === '/api/hangar') return json({ naves: [{ pasta: 'alfa', titulo: 'alfa', sigla: 'ALFA', semente: 1, congelado: false, producao: null, planePrj: 'P', fonte: 'plane', estado: 'ok', url: null, cartas: { abertas: 0, andamento: 0, feitas: 0 }, pct: 0, decisoesProduto: [], cartoes: {}, pecas: [] }], acervo: [] });
      if (url.pathname === '/api/hangar/sessoes') return json({ em: new Date().toISOString(), ias: [], sessoes: [] });
      if (url.pathname === '/api/sessao') return json({ estado: 'sem-sessao' });
      if (url.pathname === '/api/orquestracao/voz') return json({ xai: false });
      if (url.pathname === '/api/tts') return json({ disponivel: false });
      if (url.pathname === '/api/projetos' || url.pathname === '/api/backlog') return json({ projetos: [] });
      if (url.pathname === '/api/decisoes') return json({ decisoes: [] });
      if (url.pathname === '/api/producao') return json({ sondas: [] });
      if (url.pathname === '/api/alinhamento') return json({ projetos: [], totais: {}, total: 0 });
      return json({});
    }
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    const sessao = /(?:^|;\s*)sessao-simulada=dono/.test((await req.allHeaders()).cookie ?? '');
    const chamada = { caminho: url.pathname, corpo: req.postDataJSON(), sessao };
    chamadas.push(chamada);
    if (url.pathname === '/api/conversa') {
      const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: sse('inicio', { sessao: 'sessao-teste' }) + sse('ferramenta', { nome: 'propor_acao' }) + sse('proposta', PROPOSTA)
          + sse('token', { texto: 'Propus rodar os testes, Mestre; a confirmação é sua.' }) + sse('fim', { sessao: 'sessao-teste' }) });
    }
    if (!sessao) return json(SEM_SESSAO, 401);
    if (url.pathname === '/api/acoes/preparar' && chamada.corpo.propostaId === PROPOSTA.id) {
      return json({ confirmacaoId: CONFIRMACAO, expiraEm: new Date(Date.now() + 120_000).toISOString(), projeto: 'painel-admin',
        pasta: '/home/astargne/Work/ProjetosPessoais/painel-admin', comandoId: 'testes', executavel: 'npm', argumentos: ['test'],
        aviso: 'Confirmar roda este comando uma vez, nesta máquina.' });
    }
    if (url.pathname === '/api/acoes/confirmar' && chamada.corpo.confirmacaoId === CONFIRMACAO) {
      estado.executou += 1;
      return json({ projeto: 'painel-admin', codigo: 0, sinal: null, expirou: false, duracaoMs: 41_200, truncada: true,
        saida: '…ℹ tests 247\nℹ pass 247\n<b>sem html</b>' });
    }
    return json({ erro: 'operação indisponível' }, 405);
  });
  return { chamadas, errosPagina, estado };
}

async function perguntarNoC3po(page) {
  // A fixture só serve arquivo: a página do chat é o index.html da pasta.
  await page.goto('/c3po/index.html');
  await page.fill('#entrada', 'rode os testes do painel');
  await page.locator('#enviar').click();
  const cartao = page.locator('#historico .acao-cartao');
  await expect(cartao.locator('.acao-titulo')).toHaveText('Ação proposta: rodar npm test em painel-admin');
  return cartao;
}

test('C-3PO propõe no chat; com a sessão do dono, preparar mostra o comando e só o confirmar executa', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  const cartao = await perguntarNoC3po(page);
  expect(audit.chamadas.map((c) => c.caminho)).toEqual(['/api/conversa']);
  await cartao.getByRole('button', { name: 'Preparar' }).click();
  const lista = cartao.locator('.acao-lista');
  await expect(lista).toContainText('/home/astargne/Work/ProjetosPessoais/painel-admin');
  await expect(lista.locator('dd')).toHaveText(['painel-admin', '/home/astargne/Work/ProjetosPessoais/painel-admin', 'npm', 'test']);
  expect(audit.estado.executou).toBe(0);
  await cartao.getByRole('button', { name: 'Confirmar e rodar' }).click();
  await expect(cartao.locator('.acao-estado')).toHaveText('código de saída 0 · 41.2 s · saída truncada');
  await expect(cartao.locator('.acao-saida')).toContainText('ℹ pass 247');
  await expect(cartao.locator('.acao-saida b')).toHaveCount(0);
  expect(audit.estado.executou).toBe(1);
  expect(audit.chamadas.map((c) => [c.caminho, c.corpo])).toEqual([
    ['/api/conversa', { mensagem: 'rode os testes do painel' }],
    ['/api/acoes/preparar', { propostaId: PROPOSTA.id }],
    ['/api/acoes/confirmar', { confirmacaoId: CONFIRMACAO }],
  ]);
  expect(audit.errosPagina).toEqual([]);
});

test('sem a sessão do dono o cartão explica e nada executa, nem confirmando direto', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: false });
  const cartao = await perguntarNoC3po(page);
  await cartao.getByRole('button', { name: 'Preparar' }).click();
  await expect(cartao.locator('.acao-estado')).toHaveText(
    'entre no Cadastro Único para confirmar esta ação. Sem a sessão do dono no Cadastro Único nada é executado; entre em https://astargne.com e volte a esta aba.');
  await expect(cartao.getByRole('button', { name: 'Confirmar e rodar' })).toHaveCount(0);
  await expect(cartao.getByRole('button', { name: 'Preparar' })).toBeEnabled();
  const direto = await page.evaluate(async (id) => {
    const r = await fetch('/api/acoes/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacaoId: id }) });
    return { status: r.status, corpo: await r.json() };
  }, CONFIRMACAO);
  expect(direto).toEqual({ status: 401, corpo: SEM_SESSAO });
  expect(audit.estado.executou).toBe(0);
  expect(audit.chamadas.filter((c) => c.caminho.startsWith('/api/acoes/')).every((c) => !c.sessao)).toBe(true);
  expect(audit.errosPagina).toEqual([]);
});

test('o popup do Hangar mostra o mesmo cartão e prepara pela mesma rota', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.fill('#hg-conversa-pergunta', 'rode os testes do painel');
  await page.locator('#hg-conversa-enviar').click();
  const cartao = page.locator('#hg-conversa-resp .acao-cartao');
  await expect(cartao.locator('.acao-titulo')).toHaveText('Ação proposta: rodar npm test em painel-admin');
  await cartao.getByRole('button', { name: 'Preparar' }).click();
  await expect(cartao.locator('.acao-lista dd')).toHaveText(['painel-admin', '/home/astargne/Work/ProjetosPessoais/painel-admin', 'npm', 'test']);
  expect(audit.estado.executou).toBe(0);
  expect(audit.chamadas.map((c) => c.caminho)).toEqual(['/api/conversa', '/api/acoes/preparar']);
  expect(audit.errosPagina).toEqual([]);
});
