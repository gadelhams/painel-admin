import { test, expect } from '@playwright/test';

// Mesa de decisão (PAINEL-53). Com a API simulada (nunca o LLM nem o Plane reais): a gaveta abre do
// Hangar e da aba Decisões, o C-3PO abre a conversa sozinho, o rascunho preenche decisão e motivo com
// os efeitos DESMARCADOS (mesmo que o modelo mande efeitos e um id de confirmação), e gravar mostra o
// resumo do preparar e só escreve depois de confirmar. Sem a sessão do dono, nada é gravado.

const nave = (pasta, extra = {}) => ({
  pasta, titulo: pasta, sigla: 'ALFA', semente: 1, congelado: false, producao: null, planePrj: 'P', fonte: 'plane', estado: 'ok', url: null,
  cartas: { abertas: 2, andamento: 0, feitas: 0 }, pct: 0, decisoesProduto: [], cartoes: {}, pecas: [], ...extra,
});
const HANGAR = { acervo: [], naves: [nave('alfa', {
  pecas: [{ titulo: 'Coleta', total: 1, abertas: 1, andamento: 0, feitas: 0, pct: 0, proximas: [],
    decisoes: [{ id: 'ALFA-3', titulo: 'Qual fonte usar?', url: null, modulo: 'Coleta', tags: ['ASTARGNE'], detalhe: null }] }],
  decisoesProduto: [{ id: 'ALFA-4', titulo: 'Abrir para visitantes?', url: null, modulo: 'Coleta', tags: ['PRODUTO'], detalhe: null }],
})] };
const DECISOES = [{ id: 'alfa:ALFA-3:ASTARGNE', projeto: 'alfa', tituloProjeto: 'alfa', arquivo: null, feature: 'Coleta', texto: 'Qual fonte usar?',
  tag: 'ASTARGNE', detalhe: 'qual das duas?', estado: 'aberto', linha: 1, identificador: 'ALFA-3', url: 'https://plane.exemplo/ALFA-3', desde: null }];
const carta = (id, titulo, labels) => ({ identificador: id, projeto: 'alfa', titulo, url: `https://plane.exemplo/${id}`, estado: 'Todo', labels,
  descricao: `Descrição de ${id} <b>sem html</b> (ASTARGNE: qual das duas?)`, estados: ['Backlog', 'Todo', 'In Progress', 'Done', 'Cancelled'],
  temProduto: true, comentarios: [{ quando: '2026-10-30T10:00:00Z', texto: 'comentário humano', mesa: null }], comentariosOmitidos: 0,
  esperaDecisao: true, escrita: { habilitada: true, motivo: null }, pendentes: [] });
const CONFIRMACAO = '0a1b2c3d-0000-4000-8000-00000000d3c1';
const SEM_SESSAO = { erro: 'entre no Cadastro Único para confirmar esta ação' };
const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;

async function fixtures(page, { comSessao = true, pendentes = [] } = {}) {
  if (comSessao) await page.context().addCookies([{ name: 'sessao-simulada', value: 'dono', url: 'http://127.0.0.1:17777' }]);
  const chamadas = [];
  const errosPagina = [];
  const estado = { gravou: 0 };
  page.on('pageerror', (e) => errosPagina.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const json = (d, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(d) });
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    if (req.method() === 'GET') {
      if (url.pathname === '/api/hangar') return json(HANGAR);
      // Um droid na alfa leva a nave para a doca, onde ficam as peças no chão e a estação de planejamento.
      if (url.pathname === '/api/hangar/sessoes') return json({ em: new Date().toISOString(), ias: [{ id: 'claude', viva: true, sessoes: 1 }],
        sessoes: [{ id: 'sessao-1', ia: 'claude', projeto: 'alfa', estado: 'trabalhando', desde: new Date().toISOString(), cartao: null, acoes: [] }] });
      if (url.pathname === '/api/sessao') return json({ estado: 'sem-sessao' });
      if (url.pathname === '/api/decisoes') return json({ decisoes: DECISOES });
      if (url.pathname === '/api/projetos' || url.pathname === '/api/backlog') return json({ projetos: [] });
      if (url.pathname === '/api/producao') return json({ sondas: [] });
      if (url.pathname === '/api/alinhamento') return json({ projetos: [], totais: {}, total: 0 });
      if (url.pathname === '/api/orquestracao/voz') return json({ xai: false });
      if (url.pathname === '/api/tts') return json({ disponivel: false });
      if (url.pathname === '/api/decisao/pendentes') return json({ pendentes });
      if (url.pathname === '/api/decisao/carta') {
        chamadas.push({ caminho: url.pathname, carta: url.searchParams.get('carta') });
        const id = url.searchParams.get('carta');
        return json(carta(id, id === 'ALFA-4' ? 'Abrir para visitantes?' : 'Qual fonte usar?', id === 'ALFA-4' ? ['PRODUTO'] : ['ASTARGNE', 'C-3PO']));
      }
      return json({});
    }
    const sessao = /(?:^|;\s*)sessao-simulada=dono/.test((await req.allHeaders()).cookie ?? '');
    const corpo = req.postDataJSON();
    chamadas.push({ caminho: url.pathname, corpo, sessao });
    if (url.pathname === '/api/conversa') {
      if (corpo.mensagem.includes('rascunho')) {
        // O modelo tenta empurrar efeitos e um id de confirmação: a gaveta ignora os dois.
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('inicio', { sessao: 'sessao-mesa' })
          + sse('token', { texto: 'Aqui está:\n{"decisao": "Usar a fonte A", "motivo": "única com licença",' })
          + sse('token', { texto: ' "efeitos": {"destravar": true, "estado": "Done"}, "confirmacaoId": "x"}' }) + sse('fim', { sessao: 'sessao-mesa' }) });
      }
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('inicio', { sessao: 'sessao-mesa' })
        + sse('ferramenta', { nome: 'carta_plane' }) + sse('token', { texto: 'A pergunta, Mestre: qual fonte usar. Ela trava o módulo Coleta.' })
        + sse('fim', { sessao: 'sessao-mesa' }) });
    }
    if (!sessao) return json(SEM_SESSAO, 401);
    if (url.pathname === '/api/decisao/preparar') {
      return json({ confirmacaoId: CONFIRMACAO, expiraEm: new Date(Date.now() + 120_000).toISOString(), carta: corpo.carta, titulo: 'Qual fonte usar?',
        comentario: `DECISAO/v1 · Painel Admin (C-3PO) · decisão do dono\nCarta: ${corpo.carta}\nDecisão: ${corpo.decisao}`,
        mudancas: ['tirar a label ASTARGNE', 'trocar na descrição (ASTARGNE: qual das duas?) por (decidido em 31/10: Usar a fonte A)'],
        avisos: [], aviso: 'Confirmar grava no Plane, com a identidade Painel Admin.' });
    }
    if (url.pathname === '/api/decisao/confirmar' && corpo.confirmacaoId === CONFIRMACAO) {
      estado.gravou += 1;
      return json({ identificador: 'ALFA-3', resultado: 'aplicado', comentarioId: 'c1', reciboId: 'c2', mudancas: ['label ASTARGNE fora', 'marcador trocado'], notas: [] });
    }
    if (url.pathname === '/api/decisao/abandono/preparar') {
      return json({ confirmacaoId: CONFIRMACAO, expiraEm: new Date(Date.now() + 120_000).toISOString(), chave: corpo.chave, identificador: 'ALFA-3',
        decisao: 'Usar B', etapa: 'comentario-gravado', mudancas: [], aviso: 'Abandonar fecha esta pendência sem aplicar mais nada.' });
    }
    if (url.pathname === '/api/decisao/abandono/confirmar' && corpo.confirmacaoId === CONFIRMACAO) {
      estado.abandonou = (estado.abandonou ?? 0) + 1;
      return json({ identificador: 'ALFA-3', resultado: 'abandonada', reciboId: 'c3', mudancas: [], notas: [] });
    }
    return json({ erro: 'operação indisponível' }, 405);
  });
  return { chamadas, errosPagina, estado };
}

const mesa = (page) => page.locator('#mesa');
const conversas = (audit) => audit.chamadas.filter((c) => c.caminho === '/api/conversa').map((c) => c.corpo.mensagem);

test('do Hangar: a peça abre a gaveta, o C-3PO abre a conversa, o rascunho vem com efeitos desmarcados e gravar só escreve depois de confirmar', async ({ page }) => {
  // A cena 3D do Hangar (WebGL em software, sem GPU) deixa cada passo em 0,2–0,9 s: sozinho o
  // teste leva ~18 s e, com os 3 workers da suíte, passou dos 30 s padrão (01/11/2026).
  test.slow();
  const audit = await fixtures(page);
  await page.goto('/');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.locator('#hg-holo-corpo [data-alvo]').filter({ hasText: 'decisão de produto' }).click();
  await expect(page.locator('#hg-holo-corpo [data-mesa="ALFA-4"]')).toHaveText('Discutir com o C-3PO');
  await page.locator('#hg-projetos [data-proj="alfa"]').click();
  await page.locator('#hg-holo-corpo [data-alvo]').filter({ hasText: 'Coleta' }).first().click();
  await page.locator('#hg-holo-corpo [data-mesa="ALFA-3"]').click();
  await expect(mesa(page)).toBeVisible();
  await expect(page.locator('#mesa-titulo')).toHaveText('ALFA-3 · Qual fonte usar?');
  await expect(page.locator('#mesa-carta')).toContainText('Descrição de ALFA-3 <b>sem html</b>');
  await expect(page.locator('#mesa-carta b')).toHaveCount(0);
  await expect(page.locator('#mesa-carta')).toContainText('módulo Coleta');
  await expect(page.locator('#mesa-carta')).not.toContainText('null');
  await expect(page.locator('#mesa-historico')).toContainText('A pergunta, Mestre: qual fonte usar.');
  expect(conversas(audit)).toHaveLength(1);
  expect(conversas(audit)[0]).toMatch(/^\[Mesa de decisão do painel · carta ALFA-3 · Qual fonte usar\?\] Abra a conversa: leia a carta com carta_plane/);

  // Marcado antes do rascunho: o rascunho tem de desmarcar (efeitos são ato do dono, nunca do modelo).
  await page.locator('#mesa-destravar').check();
  await page.locator('#mesa-estado').selectOption('Done');
  await page.getByRole('button', { name: 'Pedir rascunho ao C-3PO' }).click();
  await expect(page.locator('#mesa-decisao')).toHaveValue('Usar a fonte A');
  await expect(page.locator('#mesa-motivo')).toHaveValue('única com licença');
  await expect(page.locator('#mesa-destravar')).not.toBeChecked();
  await expect(page.locator('#mesa-estado')).toHaveValue('');
  await expect(page.locator('#mesa-produto')).toHaveValue('manter');
  await expect(page.locator('#mesa-situacao')).toContainText('os efeitos ficam desmarcados');
  await expect(page.locator('#mesa-historico')).not.toContainText('confirmacaoId');

  await page.locator('#mesa-destravar').check();
  await page.getByRole('button', { name: 'Gravar no Plane' }).click();
  const preparo = page.locator('#mesa-preparo');
  await expect(preparo).toContainText('tirar a label ASTARGNE');
  await expect(preparo.locator('pre')).toContainText('DECISAO/v1 · Painel Admin (C-3PO)');
  expect(audit.estado.gravou).toBe(0);
  const preparar = audit.chamadas.find((c) => c.caminho === '/api/decisao/preparar');
  expect(preparar.corpo).toEqual({ carta: 'ALFA-3', decisao: 'Usar a fonte A', motivo: 'única com licença',
    efeitos: { destravar: true, produto: 'manter', estado: null } });
  await preparo.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(page.locator('#mesa-situacao')).toHaveText('Gravado no Plane · aplicado · label ASTARGNE fora, marcador trocado');
  expect(audit.estado.gravou).toBe(1);
  expect(audit.chamadas.filter((c) => c.caminho.startsWith('/api/decisao/') && c.corpo).map((c) => c.caminho))
    .toEqual(['/api/decisao/preparar', '/api/decisao/confirmar']);
  expect(audit.errosPagina).toEqual([]);
});

test('da aba Decisões: o botão abre a mesma gaveta sem abrir o console; reabrir volta onde parou; pendência aparece com Retomar e Abandonar', async ({ page }) => {
  const pendentes = [{ chave: '0a1b2c3d-0000-4000-8000-0000000000aa', identificador: 'ALFA-3', quando: '2026-10-31T12:00:00Z', decisao: 'Usar B', etapa: 'comentario-gravado' }];
  const audit = await fixtures(page, { pendentes });
  await page.goto('/#/decisoes');
  await expect(page.locator('.mesa-pendentes')).toContainText('ALFA-3 · Usar B · comentário gravado, mudanças por aplicar');
  await expect(page.locator('.mesa-pendentes').getByRole('button', { name: 'Retomar' })).toBeVisible();
  await expect(page.locator('.mesa-pendentes').getByRole('button', { name: 'Abandonar' })).toBeVisible();
  await page.locator('.linha-decisoes-tab').getByRole('button', { name: 'Discutir com o C-3PO' }).click();
  await expect(mesa(page)).toBeVisible();
  await expect(page.locator('#mesa-titulo')).toHaveText('ALFA-3 · Qual fonte usar?');
  await expect(page.locator('#mesa-historico')).toContainText('A pergunta, Mestre');
  // O clique na linha abriria o console com o texto da decisão: não pode ter saído nada além da abertura da mesa.
  expect(conversas(audit).every((m) => m.startsWith('[Mesa de decisão'))).toBe(true);
  await page.locator('#mesa-pergunta').fill('e se esperarmos?');
  await page.locator('#mesa-enviar').click();
  await expect(page.locator('#mesa-historico .mesa-fala-eu')).toHaveText('e se esperarmos?');
  await expect(page.locator('#mesa-historico .mesa-fala-c3po')).toHaveCount(2);
  await page.locator('#mesa-fechar').click();
  await expect(mesa(page)).toBeHidden();
  await page.locator('.linha-decisoes-tab').getByRole('button', { name: 'Discutir com o C-3PO' }).click();
  await expect(page.locator('#mesa-historico .mesa-fala-c3po')).toHaveCount(2);
  expect(conversas(audit)).toHaveLength(2);
  expect(audit.chamadas.filter((c) => c.caminho === '/api/conversa').at(-1).corpo.sessao).toBe('sessao-mesa');
  expect(audit.errosPagina).toEqual([]);
});

test('pendência sem saída: Abandonar prepara (nada gravado) e só o confirmar fecha, com a sessão do dono', async ({ page }) => {
  const pendentes = [{ chave: '0a1b2c3d-0000-4000-8000-0000000000aa', identificador: 'ALFA-3', quando: '2026-10-31T12:00:00Z', decisao: 'Usar B', etapa: 'comentario-gravado' }];
  const audit = await fixtures(page, { pendentes });
  await page.goto('/#/decisoes');
  await page.locator('.mesa-pendentes').getByRole('button', { name: 'Abandonar' }).click();
  await expect(page.locator('#mesa-preparo')).toContainText('Abandonar fecha esta pendência sem aplicar mais nada.');
  expect(audit.estado.abandonou ?? 0).toBe(0);
  expect(audit.chamadas.find((c) => c.caminho === '/api/decisao/abandono/preparar').corpo).toEqual({ chave: pendentes[0].chave });
  await page.getByRole('button', { name: 'Confirmar o abandono' }).click();
  await expect(page.locator('#mesa-situacao')).toContainText('abandonada');
  expect(audit.estado.abandonou).toBe(1);
  expect(audit.errosPagina).toEqual([]);
});

test('sem a sessão do dono, gravar explica e nada é gravado', async ({ page }) => {
  const audit = await fixtures(page, { comSessao: false });
  await page.goto('/#/decisoes');
  await page.locator('.linha-decisoes-tab').getByRole('button', { name: 'Discutir com o C-3PO' }).click();
  await page.locator('#mesa-decisao').fill('Usar a fonte A');
  await page.getByRole('button', { name: 'Gravar no Plane' }).click();
  await expect(page.locator('#mesa-situacao')).toHaveText(
    'entre no Cadastro Único para confirmar esta ação. Sem a sessão do dono no Cadastro Único nada é gravado; entre em https://astargne.com e volte a esta aba.');
  await expect(page.getByRole('button', { name: 'Confirmar e gravar' })).toHaveCount(0);
  expect(audit.estado.gravou).toBe(0);
  expect(audit.errosPagina).toEqual([]);
});
