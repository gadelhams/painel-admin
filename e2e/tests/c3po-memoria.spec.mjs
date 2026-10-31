import { test, expect } from '@playwright/test';

// Memória L1 do C-3PO (PAINEL-8, 31/10/2026): o painel do /c3po/ lê, edita (preparar → confirmar) e
// desfaz; o cartão do chat aceita uma proposta do motor (simulado, nunca o LLM real). A "sessão do
// dono" é um cookie simulado que só esta fixture conhece; sem ele preparar e confirmar recusam com
// a mensagem do autorizador real, e nada é gravado.

const V1 = '# Memória\n\n- o Mestre prefere respostas curtas\n';
const H = (n) => String(n).repeat(64);
const SEM_SESSAO = { erro: 'entre no Cadastro Único para confirmar esta ação' };
const PROPOSTA = { id: '0a1b2c3d-0000-4000-8000-0000000000aa', motivo: 'o Mestre pediu para lembrar do café', base: H(1),
  diff: '@@ -3,1 +3,2 @@\n - o Mestre prefere respostas curtas\n+- café sem açúcar', bytes: 70, expiraEm: new Date(Date.now() + 1_800_000).toISOString() };

async function fixtures(page, { comSessao }) {
  if (comSessao) await page.context().addCookies([{ name: 'sessao-simulada', value: 'dono', url: 'http://127.0.0.1:17777' }]);
  const chamadas = [];
  const errosPagina = [];
  const memoria = { texto: V1, hash: H(1), historico: [] };
  const desafios = new Map();
  page.on('pageerror', (e) => errosPagina.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const json = (d, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(d) });
    if (req.method() === 'GET') {
      if (url.pathname === '/api/c3po/memoria') {
        return json({ estado: 'ok', texto: memoria.texto, hash: memoria.hash, bytes: memoria.texto.length, teto: 8192,
          historico: memoria.historico, erroHistorico: null, pendente: null, aviso: 'Memória L1' });
      }
      if (url.pathname === '/api/tts') return json({ disponivel: false });
      return json({});
    }
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    const sessao = /(?:^|;\s*)sessao-simulada=dono/.test((await req.allHeaders()).cookie ?? '');
    const chamada = { caminho: url.pathname, corpo: req.postDataJSON(), sessao };
    chamadas.push(chamada);
    if (url.pathname === '/api/conversa') {
      const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: sse('inicio', { sessao: 's' }) + sse('ferramenta', { nome: 'propor_memoria' }) + sse('proposta_memoria', PROPOSTA)
          + sse('token', { texto: 'Propus lembrar disso, Mestre; a confirmação é sua.' }) + sse('fim', { sessao: 's' }) });
    }
    if (!sessao) return json(SEM_SESSAO, 401);
    if (url.pathname === '/api/c3po/memoria/preparar') {
      const { base, origem, valor } = chamada.corpo;
      if (base !== memoria.hash) return json({ erro: 'a memória mudou desde que você a abriu; recarregue' }, 409);
      const texto = origem === 'texto' ? valor : origem === 'proposta' ? `${V1}- café sem açúcar\n` : V1;
      const id = `0a1b2c3d-0000-4000-8000-${String(desafios.size + 1).padStart(12, '0')}`;
      desafios.set(id, { texto, origem });
      return json({ confirmacaoId: id, quem: origem === 'proposta' ? 'proposta-aceita' : 'dono', origem, hashBase: memoria.hash, hashNovo: H(2), bytes: texto.length, teto: 8192,
        diff: `@@ -1,3 +1,3 @@\n-${memoria.texto.trim().split('\n').at(-1)}\n+${texto.trim().split('\n').at(-1)}`, linhasRemovidas: 1, linhasAcrescentadas: 1,
        aviso: 'Confirmar grava esta versão da memória do C-3PO; a anterior fica no histórico para desfazer.' });
    }
    if (url.pathname === '/api/c3po/memoria/confirmar') {
      const d = desafios.get(chamada.corpo.confirmacaoId);
      if (!d) return json({ erro: 'confirmação ausente ou expirada' }, 404);
      desafios.delete(chamada.corpo.confirmacaoId);
      const antes = memoria.hash;
      memoria.texto = d.texto;
      memoria.hash = String(memoria.historico.length + 2).repeat(64);
      memoria.historico.unshift({ quando: '2026-10-31T21:00:00.000Z', quem: d.origem === 'proposta' ? 'proposta-aceita' : 'dono',
        origem: d.origem === 'proposta' ? 'c3po' : 'dono', hashAntes: antes, hashDepois: memoria.hash, diff: '+nova', linhasAcrescentadas: 1, linhasRemovidas: 1 });
      return json({ quem: 'dono', hash: memoria.hash, hashAntes: antes, bytes: d.texto.length, diff: '+nova' });
    }
    return json({ erro: 'operação indisponível' }, 405);
  });
  return { chamadas, errosPagina, memoria };
}

test('painel da memória: com a sessão do dono, editar prepara o diff e só o confirmar grava; desfazer pelo mesmo caminho', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  await page.goto('/c3po/index.html#memoria');
  const painel = page.locator('#memoria');
  await expect(painel).toBeVisible();
  await expect(page.locator('#mem-texto')).toHaveValue(V1);
  await expect(page.locator('#mem-resumo')).toContainText('em dia');
  await page.fill('#mem-texto', `${V1}- reunião às sextas\n`);
  await page.getByRole('button', { name: 'Preparar edição' }).click();
  await expect(page.locator('#mem-confirmacao .mem-diff .mem-mais')).toHaveText('+- reunião às sextas\n');
  expect(audit.memoria.texto).toBe(V1);
  await page.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(page.locator('#mem-estado')).toHaveText(`memória gravada (versão ${'2'.repeat(12)})`);
  await expect(page.locator('#mem-texto')).toHaveValue(`${V1}- reunião às sextas\n`);
  await expect(page.locator('#mem-historico li')).toHaveCount(1);
  await expect(page.locator('#mem-historico .mem-quem')).toContainText('o Mestre');
  await page.getByRole('button', { name: 'Desfazer (voltar ao texto de antes)' }).click();
  await page.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(page.locator('#mem-texto')).toHaveValue(V1);
  expect(audit.chamadas.map((c) => [c.caminho, c.corpo])).toEqual([
    ['/api/c3po/memoria/preparar', { base: H(1), origem: 'texto', valor: `${V1}- reunião às sextas\n` }],
    ['/api/c3po/memoria/confirmar', { confirmacaoId: '0a1b2c3d-0000-4000-8000-000000000001' }],
    ['/api/c3po/memoria/preparar', { base: H(2), origem: 'versao', valor: H(1) }],
    ['/api/c3po/memoria/confirmar', { confirmacaoId: '0a1b2c3d-0000-4000-8000-000000000001' }],
  ]);
  expect(audit.errosPagina).toEqual([]);
});

test('sem a sessão do dono o painel explica e nada é gravado, nem confirmando direto', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: false });
  await page.goto('/c3po/index.html');
  await expect(page.locator('#memoria')).toBeHidden();
  await page.getByRole('button', { name: 'Memória do C-3PO' }).click();
  await expect(page.locator('#mem-texto')).toHaveValue(V1);
  await page.fill('#mem-texto', 'apagar tudo\n');
  await page.getByRole('button', { name: 'Preparar edição' }).click();
  await expect(page.locator('#mem-estado')).toHaveText(
    'entre no Cadastro Único para confirmar esta ação. Sem a sessão do dono no Cadastro Único nada é gravado; entre em https://astargne.com e volte a esta aba.');
  await expect(page.getByRole('button', { name: 'Confirmar e gravar' })).toHaveCount(0);
  const direto = await page.evaluate(async () => {
    const r = await fetch('/api/c3po/memoria/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmacaoId: '0a1b2c3d-0000-4000-8000-000000000001' }) });
    return { status: r.status, corpo: await r.json() };
  });
  expect(direto).toEqual({ status: 401, corpo: SEM_SESSAO });
  expect(audit.memoria.texto).toBe(V1);
  expect(audit.chamadas.every((c) => !c.sessao)).toBe(true);
  expect(audit.errosPagina).toEqual([]);
});

test('o C-3PO propõe memória no chat: o cartão mostra o diff e grava só depois de preparar e confirmar', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: true });
  await page.goto('/c3po/index.html');
  await page.fill('#entrada', 'lembre que tomo café sem açúcar');
  await page.locator('#enviar').click();
  const cartao = page.locator('#historico .mem-cartao');
  await expect(cartao.locator('.acao-titulo')).toHaveText('Memória proposta: o Mestre pediu para lembrar do café');
  await expect(cartao.locator('.mem-diff .mem-mais')).toHaveText('+- café sem açúcar\n');
  expect(audit.memoria.texto).toBe(V1);
  await cartao.getByRole('button', { name: 'Preparar' }).click();
  await cartao.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(cartao.locator('.mem-estado')).toHaveText(`memória gravada (versão ${'2'.repeat(12)})`);
  expect(audit.memoria.texto).toBe(`${V1}- café sem açúcar\n`);
  expect(audit.chamadas.map((c) => c.caminho)).toEqual(['/api/conversa', '/api/c3po/memoria/preparar', '/api/c3po/memoria/confirmar']);
  expect(audit.chamadas[1].corpo).toEqual({ base: H(1), origem: 'proposta', valor: PROPOSTA.id });
  expect(audit.errosPagina).toEqual([]);
});
