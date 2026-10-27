import { test, expect } from '@playwright/test';
import { aguardarTresPapeis } from '../esperar-modelos.mjs';
import { classificarPedido } from '../politica-post.mjs';

const PROJETO_PLAYER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const PROJETO_PAINEL = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const CARTA_PLAYER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const VERSAO = '2026-10-22T10:00:00Z';
const PAPEIS = ['orquestracao', 'codificacao_testes', 'validacao'];
const candidato = {
  id: CARTA_PLAYER, identificador: 'PLAYER-38', titulo: 'Proxy de mídia (fixture)',
  projeto: 'PLAYER', projetoId: PROJETO_PLAYER, estado: 'Todo',
  url: 'https://plane.vpn.astargne.com/PLAYER-38/', atualizadoEm: VERSAO,
  labels: ['READY TO DEV'], dependencias: [], elegivel: true, motivos: [], gate: 'READY TO DEV',
  agentesDisponiveis: [{ id: 'Claude', modelo: 'claude-opus-5', esforco: 'max' },
    { id: 'OpenAI', modelo: 'gpt-6-astra', esforco: 'extreme high' }],
  lease: null, leaseSituacao: 'livre', tentativa: null, historico: [], comandos: ['testes', 'portao'],
};
const bloqueada = (id, identificador, labels, motivos, dependencias = []) => ({
  ...candidato, id, identificador, titulo: `${identificador} (fixture)`, labels,
  motivos, dependencias, elegivel: false, gate: labels.length === 1 ? labels[0] : null,
  agentesDisponiveis: [], comandos: [],
});
const fila = {
  modo: 'leitura-e-simulacao', execucaoHabilitada: false, atualizadoEm: VERSAO,
  projetos: [
    { id: PROJETO_PLAYER, nome: 'PLAYER', acessivel: true, cartas: 3, candidatas: 3, elegiveis: 1 },
    { id: PROJETO_PAINEL, nome: 'PAINEL', acessivel: true, cartas: 1, candidatas: 0, elegiveis: 0 },
  ],
  itens: [candidato,
    bloqueada('11111111-1111-4111-8111-111111111111', 'PLAYER-98',
      ['READY TO DEV', 'READY TO TEST'], ['dois gates de prontidão']),
    bloqueada('22222222-2222-4222-8222-222222222222', 'PLAYER-99',
      ['READY TO DEV'], ['dependência PLAYER-36: pendente'],
      [{ id: 'PLAYER-36', estado: 'pendente', motivo: 'aguarda F0' }]),
    { ...bloqueada('33333333-3333-4333-8333-333333333333', 'PAINEL-999', [],
      ['sem gate de prontidão', 'contrato local ausente', 'nenhum agente elegível']),
      projeto: 'PAINEL', projetoId: PROJETO_PAINEL },
  ],
};
const triagemDev = {
  atualizadoEm: VERSAO, total: 1, folhas: 1,
  categorias: [
    { codigo: 'DEPENDENCIA_NAO_AUDITADA', nome: 'Dependências sem prova formal', total: 1 },
    { codigo: 'ESTADO_INADEQUADO', nome: 'Estado não adequado ao DEV', total: 1 },
  ],
  itens: [{ id: '33333333-3333-4333-8333-333333333333', identificador: 'PAINEL-999',
    projetoId: PROJETO_PAINEL, principal: 'DEPENDENCIA_NAO_AUDITADA',
    categorias: ['DEPENDENCIA_NAO_AUDITADA', 'ESTADO_INADEQUADO'] }],
};

async function fixtures(page, { preparar = 'sem-sso', atrasoModelosMs = 0, opcoesModelos = null } = {}) {
  const chamadas = [];
  const inesperadas = [];
  const errosPagina = [];
  page.on('pageerror', erro => errosPagina.push(erro.message));
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:17777') {
      inesperadas.push(`${req.method()} ${url.origin}${url.pathname}`);
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    let corpo = null;
    if (req.postData()) {
      try { corpo = req.postDataJSON(); } catch { corpo = null; }
    }
    chamadas.push({ metodo: req.method(), caminho: url.pathname, corpo });
    const responder = async (dados, status = 200) => route.fulfill({ status,
      contentType: 'application/json; charset=utf-8', body: JSON.stringify(dados) });
    if (req.method() === 'GET') {
      if (url.pathname === '/api/projetos') return responder({ projetos: [] });
      if (url.pathname === '/api/backlog') return responder({ projetos: [] });
      if (url.pathname === '/api/decisoes') return responder({ decisoes: [] });
      if (url.pathname === '/api/producao') return responder({ sondas: [] });
      if (url.pathname === '/api/tts') return responder({ disponivel: false, motivo: 'fixture' });
      if (url.pathname === '/api/contas/apps') return responder({ apps: [] });
      if (url.pathname === '/api/contas/usuarios') return responder({ usuarios: [] });
      if (url.pathname === '/api/contas/convites') return responder({ convites: [] });
      if (url.pathname === '/api/orquestracao') return responder(fila);
      if (url.pathname === '/api/orquestracao/triagem-dev') return responder(triagemDev);
      if (url.pathname === '/api/orquestracao/modelos') {
        if (atrasoModelosMs) await new Promise(resolve => setTimeout(resolve, atrasoModelosMs));
        return responder({
        carta: 'PLAYER-38', projetoId: PROJETO_PLAYER, versaoCarta: VERSAO,
        perfil: null, podeRegistrar: true, impedimentos: [], papeis: PAPEIS,
        opcoes: opcoesModelos ?? [
          { provedor: 'claude', modelo: 'claude-opus-5', esforcoPadrao: 'max', esforcos: ['max'], disponivel: true },
          { provedor: 'openai', modelo: 'gpt-6-astra', esforcoPadrao: 'xhigh', esforcos: ['xhigh'], disponivel: true },
        ],
      });
      }
      if (url.pathname === '/api/orquestracao/prontidao') return responder({
        pendenciasDoGate: ['Dependências ainda não concluídas'],
        pendenciasTecnicas: ['contrato local ausente'], gatePodeSerMarcado: false,
        podeRegistrarGate: false,
      });
      if (url.pathname === '/api/orquestracao/consumo') return responder({
        claude: { disponivel: false, motivo: 'fonte indisponível' },
        openai: { disponivel: false, motivo: 'fonte indisponível' },
      });
      if (url.pathname === '/api/orquestracao/canal') return responder({ interacoes: [], handoffs: [] });
    }
    if (req.method() === 'POST' && url.pathname === '/api/orquestracao/modelos/validar') {
      return responder({ carta: 'PLAYER-38', impedimentosExecucao: ['portão real desligado'] });
    }
    if (req.method() === 'POST' && url.pathname === '/api/orquestracao/modelos/preparar') {
      if (preparar === 'sem-sso') return responder({ erro: 'entre no Cadastro Único para confirmar esta ação' }, 401);
      return responder({ carta: 'PLAYER-38', versaoCarta: VERSAO,
        confirmacaoId: '44444444-4444-4444-8444-444444444444', selecoes: corpo.selecoes,
        aviso: 'Fixture: nenhuma escrita foi feita.', expiraEm: '2099-01-01T00:00:00Z' });
    }
    inesperadas.push(`${req.method()} ${url.pathname}`);
    return responder({ erro: 'ação não simulada' }, 405);
  });
  return { chamadas, inesperadas, errosPagina };
}

async function abrirOrquestracao(page) {
  await page.goto('/#/orquestracao');
  await expect(page.locator('#orq-status')).toContainText('4 cartas');
}

test('fila mostra inclusão, rejeições e pendências sem executar', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await expect(page.locator('#orq-cartas button')).toHaveCount(3);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('Todos os portões de leitura passaram');
  await expect(page.locator('#orq-historico')).toContainText('Claude, OpenAI');
  await expect(page.locator('#orq-historico')).toContainText('não atribuído');
  await expect(page.locator('#orq-elegibilidade')).toContainText('Nenhum comando será iniciado');

  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-98' }).click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('dois gates de prontidão');
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-99' }).click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('dependência PLAYER-36: pendente');
  await page.locator('#orq-filtro').selectOption('todas');
  await page.locator('#orq-cartas button').filter({ hasText: 'PAINEL-999' }).click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('contrato local ausente');
  await page.getByRole('button', { name: 'Pré-checar READY TO DEV' }).click();
  await expect(page.locator('#orq-prontidao')).toContainText('Pendências para marcar o gate');
  await expect(page.locator('#orq-prontidao')).toContainText('contrato local ausente');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('triagem DEV agrupa pendências e filtra sem marcar gate ou escrever', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.getByRole('button', { name: 'Classificar pendências DEV' }).click();
  await expect(page.locator('#orq-triagem-status')).toContainText('Nenhuma etiqueta alterada');
  await expect(page.locator('#orq-triagem-resumo')).toContainText('1 carta aberta sem gate');
  await page.locator('#orq-categoria').selectOption('DEPENDENCIA_NAO_AUDITADA');
  await expect(page.locator('#orq-cartas button')).toHaveCount(1);
  await page.locator('#orq-cartas button').click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('Dependências sem prova formal');
  await expect(page.locator('#orq-elegibilidade')).toContainText('Estado não adequado ao DEV');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('discussão abre C-3PO com card selecionado sem enviar consulta', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('#orq-filtro').selectOption('todas');
  await page.locator('#orq-cartas button').filter({ hasText: 'PAINEL-999' }).click();
  await page.getByRole('button', { name: 'Discutir pendências com C-3PO' }).click();
  await expect(page.locator('#console-scrim')).toBeVisible();
  await expect(page.locator('#console-kicker')).toContainText('PAINEL-999');
  await expect(page.locator('#entrada')).toHaveValue(/O que falta para PAINEL-999 ficar READY TO DEV/);
  expect(audit.chamadas.some(c => c.caminho === '/api/conversa')).toBe(false);
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('seleção mista preserva modelo e esforço sem perfil, lease ou fallback', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  const provedores = page.locator('.orq-seletor-provedor');
  const modelos = page.locator('.orq-seletor-modelo');
  await expect(provedores).toHaveCount(3);
  await expect(modelos).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(provedores.nth(i).locator('option')).toHaveCount(2);
    await expect(modelos.nth(i).locator('option')).toHaveCount(1);
  }
  await provedores.nth(1).selectOption('openai');
  await expect(modelos.nth(1)).toHaveValue('gpt-6-astra');
  await expect(page.locator('.orq-seletor-esforco').nth(0)).toHaveValue('max');
  await expect(page.locator('.orq-seletor-esforco').nth(1)).toHaveValue('xhigh');
  await page.getByRole('button', { name: 'Validar proposta' }).click();
  await expect(page.locator('#orq-modelos-status')).toContainText('ainda não gravada no card');
  const validacao = audit.chamadas.find(c => c.caminho === '/api/orquestracao/modelos/validar');
  expect(validacao.corpo.selecoes).toEqual({
    orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
    codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
    validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
  });
  expect(audit.chamadas.some(c => c.caminho.endsWith('/confirmar'))).toBe(false);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('modelo depende do provedor e esforço depende do modelo', async ({ page }) => {
  const opcoesModelos = [
    { provedor: 'claude', modelo: 'claude-opus-5', esforcoPadrao: 'max', esforcos: ['max'], disponivel: true },
    { provedor: 'claude', modelo: 'claude-sonnet-5', esforcoPadrao: 'max', esforcos: ['high', 'max'], disponivel: true },
    { provedor: 'openai', modelo: 'gpt-6-astra', esforcoPadrao: 'xhigh', esforcos: ['high', 'xhigh'], disponivel: true },
    { provedor: 'openai', modelo: 'gpt-6-sol', esforcoPadrao: 'xhigh', esforcos: ['medium', 'xhigh'], disponivel: true },
  ];
  const audit = await fixtures(page, { opcoesModelos });
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  const provedores = page.locator('.orq-seletor-provedor');
  const modelos = page.locator('.orq-seletor-modelo');
  const esforcos = page.locator('.orq-seletor-esforco');
  await expect(provedores).toHaveCount(3);
  await expect(modelos.nth(0).locator('option')).toHaveCount(2);
  await modelos.nth(0).selectOption('claude-sonnet-5');
  await expect(esforcos.nth(0).locator('option')).toHaveCount(2);
  await esforcos.nth(0).selectOption('high');
  await provedores.nth(0).selectOption('openai');
  await expect(modelos.nth(0)).toHaveValue('gpt-6-astra');
  await expect(modelos.nth(0).locator('option')).toHaveCount(2);
  expect(await modelos.nth(0).locator('option').allTextContents()).toEqual(['gpt-6-astra', 'gpt-6-sol']);
  await expect(esforcos.nth(0)).toHaveValue('xhigh');
  await modelos.nth(0).selectOption('gpt-6-sol');
  await esforcos.nth(0).selectOption('medium');
  await page.getByRole('button', { name: 'Validar proposta' }).click();
  await expect(page.locator('#orq-modelos-status')).toContainText('ainda não gravada no card');
  const validacao = audit.chamadas.find(c => c.caminho === '/api/orquestracao/modelos/validar');
  expect(validacao.corpo.selecoes.orquestracao).toEqual({ provedor: 'openai', modelo: 'gpt-6-sol', esforco: 'medium' });
  expect(audit.chamadas.some(c => c.caminho.endsWith('/confirmar'))).toBe(false);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('três campos por papel cabem no desktop e empilham no celular', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  const linha = page.locator('.orq-papel').first();
  const campos = linha.locator('.orq-campo');
  await expect(campos).toHaveCount(3);
  const desktop = await campos.evaluateAll(nos => nos.map(no => no.getBoundingClientRect().left));
  expect(desktop[0]).toBeLessThan(desktop[1]);
  expect(desktop[1]).toBeLessThan(desktop[2]);
  await page.setViewportSize({ width: 540, height: 900 });
  const celular = await campos.evaluateAll(nos => nos.map(no => ({ x: no.getBoundingClientRect().left,
    y: no.getBoundingClientRect().top, right: no.getBoundingClientRect().right })));
  expect(celular[0].y).toBeLessThan(celular[1].y);
  expect(celular[1].y).toBeLessThan(celular[2].y);
  expect(celular.every(campo => campo.right <= 540)).toBe(true);
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('espera a API de modelos antes de contar os três papéis', async ({ page }) => {
  const audit = await fixtures(page, { atrasoModelosMs: 1000 });
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  const seletores = await aguardarTresPapeis(page, 5000);
  await expect(seletores).toHaveCount(3);
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('POST externo de fundo é bloqueado sem simular escrita inesperada no Painel', () => {
  expect(classificarPedido('GET', 'https://painel.vpn.astargne.com/api/orquestracao')).toBe('leitura');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/modelos/validar')).toBe('preparo-permitido');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/modelos/preparar')).toBe('preparo-permitido');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/modelos/confirmar')).toBe('bloquear-painel');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/despacho/confirmar')).toBe('bloquear-painel');
  expect(classificarPedido('PATCH', 'https://painel.vpn.astargne.com/api/contas/usuarios/1')).toBe('bloquear-painel');
  expect(classificarPedido('POST', 'https://astargne.com/api/sessao/renovar')).toBe('bloquear-externo');
  expect(classificarPedido('DELETE', 'https://astargne.com/api/sessao')).toBe('bloquear-externo');
});

test('sem SSO, preparar não gera confirmação e orienta o login', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  await page.getByRole('button', { name: 'Preparar registro no card' }).click();
  await expect(page.locator('#orq-modelos-status')).toContainText('https://astargne.com/login');
  await expect(page.locator('#orq-confirmacao-modelos')).toBeHidden();
  expect(audit.chamadas.filter(c => c.metodo === 'POST').map(c => c.caminho))
    .toEqual(['/api/orquestracao/modelos/preparar']);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('SSO simulado só prepara: confirmação segue uma segunda ação', async ({ page }) => {
  const audit = await fixtures(page, { preparar: 'simulado' });
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  await page.getByRole('button', { name: 'Preparar registro no card' }).click();
  await expect(page.locator('#orq-confirmacao-modelos')).toBeVisible();
  await expect(page.locator('#orq-confirmacao-modelos')).toContainText('orquestracao: claude/claude-opus-5/max');
  await expect(page.getByRole('button', { name: 'Confirmar registro no card' })).toBeVisible();
  await page.locator('.orq-seletor-provedor').nth(1).selectOption('openai');
  await expect(page.locator('#orq-confirmacao-modelos')).toBeHidden();
  await expect(page.locator('#orq-modelos-status')).toContainText('Seleção alterada');
  expect(audit.chamadas.some(c => c.caminho.endsWith('/confirmar'))).toBe(false);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('cinco abas abrem sem chamada de escrita', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  for (const nome of ['Projetos', 'Backlog', 'Decisões', 'Orquestração', 'Contas']) {
    await page.locator('.barra-abas button.aba').filter({ hasText: nome }).click();
    const aba = { Projetos: 'projetos', Backlog: 'backlog', Decisões: 'decisoes',
      Orquestração: 'orquestracao', Contas: 'contas' }[nome];
    await expect(page.locator(`#aba-${aba}`)).toBeVisible();
  }
  await expect(page.locator('#aba-contas')).toContainText('Convidar');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});
