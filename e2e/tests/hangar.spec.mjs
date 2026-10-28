import { test, expect } from '@playwright/test';

// Hangar (28/10/2026): a entrada do painel. Com a API simulada, prova que a
// raiz abre o Hangar, que droids e naves vêm só de GET, que a encomenda vira
// texto de pedido (nenhuma escrita) e que sair da aba para o poll de 5 s.

const CARTA = '00000000-0000-4000-8000-000000000003';
const nave = (pasta, extra = {}) => ({
  pasta, titulo: pasta, sigla: 'ALFA', semente: 1, congelado: false, producao: null, planePrj: 'P', fonte: 'plane', estado: 'ok', url: 'https://plane.exemplo/alfa',
  cartas: { abertas: 2, andamento: 1, feitas: 1 }, pct: 25, decisoesProduto: [], cartoes: {}, pecas: [], ...extra,
});
const hangar = {
  naves: [
    nave('alfa', {
      pecas: [
        { titulo: 'Coleta', total: 3, abertas: 1, andamento: 1, feitas: 1, pct: 33, proximas: [{ id: 'ALFA-2', titulo: 'Busca <b>rápida</b>', url: null }],
          decisoes: [{ id: 'ALFA-3', titulo: 'Qual fonte usar?', url: null, modulo: 'Coleta', tags: ['ASTARGNE'], detalhe: null }] },
        { titulo: 'Busca', total: 1, abertas: 1, andamento: 0, feitas: 0, pct: 0, proximas: [], decisoes: [] },
      ],
      decisoesProduto: [{ id: 'ALFA-4', titulo: 'Abrir para visitantes?', url: null, modulo: 'Busca', tags: ['ASTARGNE'], detalhe: null }],
      cartoes: { [CARTA]: [0, 'ALFA-3', 'Qual fonte usar?'] },
    }),
    nave('beta', { sigla: null, estado: 'sem_backlog', fonte: null, url: null, pct: 0, cartas: { abertas: 0, andamento: 0, feitas: 0 } }),
  ],
  acervo: [{ id: 'padroes', titulo: 'Padrões', itens: ['PADROES-BACKLOG.md'] }, { id: 'orientacoes', titulo: 'Orientações', itens: [] }, { id: 'skills', titulo: 'Skills', itens: ['fecho-de-entrega'] }, { id: 'licoes', titulo: 'Lições vivas', itens: [] }],
};
const agora = () => new Date().toISOString();
const sessoes = () => ({
  em: agora(),
  ias: [{ id: 'claude', viva: true, sessoes: 1 }, { id: 'codex', viva: false, sessoes: 0 }, { id: 'grok', viva: false, sessoes: 0 }],
  sessoes: [{ id: 'sessao-1', ia: 'claude', projeto: 'alfa', estado: 'trabalhando', desde: agora(), cartao: CARTA,
    acoes: [{ em: agora(), tipo: 'editar', ferramenta: 'Edit', arquivo: 'src/coleta.js' }, { em: agora(), tipo: 'consultar', ferramenta: 'Skill', setor: 'skills', item: 'fecho-de-entrega' }] }],
});

async function fixtures(page) {
  const chamadas = [];
  const errosPagina = [];
  page.on('pageerror', (e) => errosPagina.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    chamadas.push({ metodo: req.method(), caminho: url.pathname, em: Date.now() });
    const json = (d) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (url.pathname === '/api/hangar') return json(hangar);
    if (url.pathname === '/api/hangar/sessoes') return json(sessoes());
    if (url.pathname === '/api/projetos') return json({ projetos: [] });
    if (url.pathname === '/api/backlog') return json({ projetos: [] });
    if (url.pathname === '/api/decisoes') return json({ decisoes: [] });
    if (url.pathname === '/api/producao') return json({ sondas: [] });
    if (url.pathname === '/api/alinhamento') return json({ projetos: [], totais: {}, total: 0 });
    if (url.pathname === '/api/orquestracao/voz') return json({ xai: false });
    if (url.pathname === '/api/tts') return json({ disponivel: false });
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

test('encomenda vira pedido em texto, sem escrita; abrir no painel leva ao projeto', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('[data-berco]').click();
  await page.locator('#hg-form-encomenda button[type=submit]').click();
  await expect(page.locator('#hg-enc-erro')).toHaveText('Falta o nome do projeto.');
  await page.fill('#hg-enc-nome', 'Bot de Receitas');
  await page.fill('#hg-enc-mod', 'Coleta\nBusca');
  await page.locator('#hg-form-encomenda button[type=submit]').click();
  await page.locator('[data-acao=confirmar]').click();
  await expect(page.locator('#hg-pedido')).toContainText('Módulos no Plane, nesta ordem: 1) Coleta; 2) Busca');
  expect(audit.chamadas.filter((c) => c.metodo !== 'GET')).toEqual([]);
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.locator('#hg-holo-corpo a', { hasText: 'abrir no painel' }).click();
  await expect(page).toHaveURL(/#\/projeto\/alfa$/);
  await expect(page.locator('#aba-projetos')).toBeVisible();
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
