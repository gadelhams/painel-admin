import { test, expect } from '@playwright/test';

// PAINEL-65 (06/11/2026): o motor (simulado, nunca o LLM real) devolve uma proposta de decisão
// no SSE; o cartão do chat prepara sozinho, mostra o que muda no Plane e grava com UM toque,
// pelas mesmas duas ações da gaveta. A "sessão do dono" é um cookie que só esta fixture
// conhece; sem ele o preparo recusa, o botão de gravar nem aparece e nada é "gravado".

const PROPOSTA = { id: '0a1b2c3d-0000-4000-8000-0000000dec15', carta: 'CAD-21', projeto: 'Cadastro Único',
  decisao: 'Ganha "sair de todos os dispositivos" e a lista de sessões', motivo: 'O dono quer ver onde está logado.\n<b>sem html</b>',
  efeitos: { destravar: true, produto: 'manter', estado: 'Todo' }, expiraEm: new Date(Date.now() + 1_800_000).toISOString() };
const PEDIDO = { carta: PROPOSTA.carta, decisao: PROPOSTA.decisao, motivo: PROPOSTA.motivo, efeitos: PROPOSTA.efeitos };
const SEM_SESSAO = { erro: 'entre no Cadastro Único para confirmar esta ação' };
const MUDANCAS = ['tira a label ASTARGNE', 'estado: Backlog → Todo'];

async function fixtures(page, { comSessao, vencerPrimeiro = false, cartaMuda = false, versaoMuda = false, conflito = null, propostas = 1 }) {
  if (comSessao) await page.context().addCookies([{ name: 'sessao-simulada', value: 'dono', url: 'http://127.0.0.1:17777' }]);
  const chamadas = [];
  const errosPagina = [];
  const estado = { gravou: 0, preparos: 0 };
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
        body: sse('inicio', { sessao: 'sessao-teste' }) + sse('ferramenta', { nome: 'propor_decisao' })
          + Array.from({ length: propostas }, (_, i) => sse('proposta_decisao', { ...PROPOSTA, id: PROPOSTA.id.slice(0, -1) + i })).join('')
          + sse('token', { texto: 'O cartão está pronto, Mestre; propus destravar e levar a Todo.' }) + sse('fim', { sessao: 'sessao-teste' }) });
    }
    if (!sessao) return json(SEM_SESSAO, 401);
    if (url.pathname === '/api/decisao/preparar') {
      estado.preparos += 1;
      const mudancas = cartaMuda && estado.preparos > 1 ? ['tira a label ASTARGNE'] : MUDANCAS;
      return json({ confirmacaoId: `0a1b2c3d-0000-4000-8000-00000000000${estado.preparos}`, expiraEm: new Date(Date.now() + 120_000).toISOString(),
        carta: 'CAD-21', titulo: 'Sessões por dispositivo', comentario: `DECISAO/v1 · preparo ${estado.preparos}\n<i>sem html</i>`, mudancas,
        avisos: ['a carta fica despachável para a frota'], aviso: 'Confirmar grava no Plane.',
        // A digital da carta: muda quando alguém comenta ou edita a descrição, mesmo com o delta igual.
        versao: versaoMuda && estado.preparos > 1 ? 'digital-depois-do-comentario' : 'digital-do-primeiro-preparo' });
    }
    if (url.pathname === '/api/decisao/confirmar') {
      const n = Number(String(chamada.corpo.confirmacaoId).slice(-1));
      if (vencerPrimeiro && n === 1) return json({ erro: 'confirmação expirada' }, 410);
      if (conflito === 'limpo' && n === 1) return json({ erro: 'recusado; nada foi gravado: a carta mudou desde o preparar; prepare de novo' }, 409);
      if (conflito === 'incerto') return json({ erro: 'resultado incerto; veja "aplicação pendente" na aba Decisões e retome ou abandone de lá' }, 409);
      estado.gravou += 1;
      return json({ resultado: 'aplicado', mudancas: MUDANCAS, notas: [] });
    }
    return json({ erro: 'operação indisponível' }, 405);
  });
  return { chamadas, errosPagina, estado };
}

async function decidirNoC3po(page) {
  await page.goto('/c3po/index.html');
  await page.fill('#entrada', 'CAD-21: sim, e seria bom listar os dispositivos logados');
  await page.locator('#enviar').click();
  const cartao = page.locator('#historico .decisao-cartao');
  await expect(cartao.locator('.acao-titulo')).toHaveText('Decisão proposta para CAD-21');
  return cartao;
}

test('C-3PO propõe a decisão; o cartão mostra os efeitos e o que muda, e um toque grava', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  const cartao = await decidirNoC3po(page);
  await expect(cartao.locator('.acao-lista dd')).toHaveText([PROPOSTA.decisao, PROPOSTA.motivo]);
  // O título lido no Plane diz QUAL carta o identificador aponta, antes do toque.
  await expect(cartao.locator('.decisao-carta')).toHaveText('CAD-21 · Sessões por dispositivo');
  await expect(cartao.locator('.acao-lista b')).toHaveCount(0);
  await expect(cartao.locator('.decisao-efeitos li')).toHaveText([
    'Destravar a carta: sai a trava do dono e ela pode ficar despachável para a frota', 'Mudar o estado para Todo']);
  // O preparo é automático (nada é gravado nele) e traz o que o servidor calculou.
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  await expect(cartao.locator('.acao-saida')).toContainText('DECISAO/v1 · preparo 1');
  await expect(cartao.locator('.acao-saida i')).toHaveCount(0);
  await expect(cartao.locator('.decisao-aviso')).toHaveText('a carta fica despachável para a frota');
  expect(audit.estado.gravou).toBe(0);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toHaveText('Gravado no Plane · aplicado · tira a label ASTARGNE, estado: Backlog → Todo');
  await expect(cartao.getByRole('button', { name: 'Gravar no Plane' })).toBeHidden();
  expect(audit.estado.gravou).toBe(1);
  expect(audit.chamadas.map((c) => [c.caminho, c.corpo])).toEqual([
    ['/api/conversa', { mensagem: 'CAD-21: sim, e seria bom listar os dispositivos logados' }],
    ['/api/decisao/preparar', PEDIDO],
    ['/api/decisao/confirmar', { confirmacaoId: '0a1b2c3d-0000-4000-8000-000000000001' }],
  ]);
  expect(audit.errosPagina).toEqual([]);
});

test('sem a sessão do dono o cartão explica, não oferece Gravar e nada é gravado', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: false });
  const cartao = await decidirNoC3po(page);
  await expect(cartao.locator('.acao-estado')).toHaveText(
    'entre no Cadastro Único para confirmar esta ação. Sem a sessão do dono no Cadastro Único nada é gravado; abra o painel por https://painel.vpn.astargne.com, entre e tente de novo.');
  await expect(cartao.getByRole('button', { name: 'Gravar no Plane' })).toBeHidden();
  await expect(cartao.getByRole('button', { name: 'Preparar de novo' })).toBeVisible();
  expect(audit.estado.gravou).toBe(0);
  expect(audit.chamadas.filter((c) => c.caminho.startsWith('/api/decisao/')).every((c) => !c.sessao)).toBe(true);
  expect(audit.errosPagina).toEqual([]);
});

test('preparo vencido no toque: prepara de novo e grava direto se o que muda é o mesmo', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true, vencerPrimeiro: true });
  const cartao = await decidirNoC3po(page);
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('Gravado no Plane · aplicado');
  expect(audit.estado.gravou).toBe(1);
  expect(audit.chamadas.map((c) => c.caminho)).toEqual(['/api/conversa', '/api/decisao/preparar', '/api/decisao/confirmar', '/api/decisao/preparar', '/api/decisao/confirmar']);
  expect(audit.errosPagina).toEqual([]);
});

test('preparo vencido e a carta mudou: mostra o novo e espera outro toque, sem gravar sozinho', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true, vencerPrimeiro: true, cartaMuda: true });
  const cartao = await decidirNoC3po(page);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toHaveText('A carta mudou desde o preparo: confira de novo a carta e o que muda, e toque em Gravar outra vez.');
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(['tira a label ASTARGNE']);
  expect(audit.estado.gravou).toBe(0);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('Gravado no Plane · aplicado');
  expect(audit.estado.gravou).toBe(1);
  expect(audit.errosPagina).toEqual([]);
});

test('o popup do Hangar mostra o mesmo cartão e grava pela mesma rota', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.fill('#hg-conversa-pergunta', 'CAD-21: sim');
  await page.locator('#hg-conversa-enviar').click();
  const cartao = page.locator('#hg-conversa-resp .decisao-cartao');
  await expect(cartao.locator('.acao-titulo')).toHaveText('Decisão proposta para CAD-21');
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('Gravado no Plane · aplicado');
  expect(audit.estado.gravou).toBe(1);
  expect(audit.chamadas.map((c) => c.caminho)).toEqual(['/api/conversa', '/api/decisao/preparar', '/api/decisao/confirmar']);
  expect(audit.errosPagina).toEqual([]);
});

test('preparo vencido e alguém comentou na carta: o delta é o mesmo, mas a versão mudou — não grava sozinho', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true, vencerPrimeiro: true, versaoMuda: true });
  const cartao = await decidirNoC3po(page);
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toHaveText('A carta mudou desde o preparo: confira de novo a carta e o que muda, e toque em Gravar outra vez.');
  await expect(cartao.locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  expect(audit.estado.gravou).toBe(0);
  expect(audit.errosPagina).toEqual([]);
});

test('409 "nada foi gravado": o cartão oferece preparar de novo e o segundo toque grava', async ({ page }) => {
  const limpo = await fixtures(page, { comSessao: true, conflito: 'limpo' });
  const cartao = await decidirNoC3po(page);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('recusado; nada foi gravado: a carta mudou desde o preparar; prepare de novo');
  await cartao.getByRole('button', { name: 'Preparar de novo' }).click();
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('Gravado no Plane · aplicado');
  expect(limpo.estado.gravou).toBe(1);
  expect(limpo.errosPagina).toEqual([]);
});

test('409 de resultado incerto: o cartão manda para a aba Decisões e não oferece repetir', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true, conflito: 'incerto' });
  const cartao = await decidirNoC3po(page);
  await cartao.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(cartao.locator('.acao-estado')).toContainText('resultado incerto; veja "aplicação pendente" na aba Decisões');
  await expect(cartao.getByRole('button', { name: 'Preparar de novo' })).toBeHidden();
  await expect(cartao.getByRole('button', { name: 'Gravar no Plane' })).toBeDisabled();
  expect(audit.estado.gravou).toBe(0);
  expect(audit.errosPagina).toEqual([]);
});

test('rajada de propostas: só as três primeiras preparam sozinhas; as outras esperam o toque em Preparar', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true, propostas: 5 });
  await page.goto('/c3po/index.html');
  await page.fill('#entrada', 'decida tudo');
  await page.locator('#enviar').click();
  const cartoes = page.locator('#historico .decisao-cartao');
  await expect(cartoes).toHaveCount(5);
  await expect(cartoes.locator('.decisao-gravar:visible')).toHaveCount(3);
  await expect(cartoes.nth(4).locator('.acao-estado')).toHaveText('Muitas propostas seguidas: toque em Preparar para ver o que esta muda no Plane.');
  expect(audit.chamadas.filter((c) => c.caminho === '/api/decisao/preparar')).toHaveLength(3);
  await cartoes.nth(4).getByRole('button', { name: 'Preparar', exact: true }).click();
  await expect(cartoes.nth(4).locator('.decisao-mudancas li')).toHaveText(MUDANCAS);
  expect(audit.estado.gravou).toBe(0);
  expect(audit.errosPagina).toEqual([]);
});
