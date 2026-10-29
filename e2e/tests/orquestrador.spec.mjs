import { test, expect } from '@playwright/test';
import { aguardarPapeisDaFrota } from '../esperar-modelos.mjs';
import { classificarPedido } from '../politica-post.mjs';

const PROJETO_PLAYER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const PROJETO_PAINEL = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const CARTA_PLAYER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const VERSAO = '2026-10-22T10:00:00Z';
const CLAUDE = { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' };
const OPENAI = { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' };
const CATALOGO = [
  { provedor: 'claude', modelo: 'claude-opus-5', esforcoPadrao: 'max', esforcos: ['low', 'medium', 'high', 'xhigh', 'max'], disponivel: true },
  { provedor: 'openai', modelo: 'gpt-6-astra', esforcoPadrao: 'xhigh', esforcos: ['low', 'medium', 'high', 'xhigh'], disponivel: true },
];
// Frota v3 em vigor (fixture): Claude orquestra e valida, OpenAI coda, Claude zela.
const MARCA = `ok:3:${'f'.repeat(64)}`;
const frotaFixture = (catalogo = CATALOGO) => ({ estado: 'ok', marca: MARCA, versao: 3, hash: 'f'.repeat(64), atualizadoEm: VERSAO, atualizadoPor: '1',
  conteudo: { executor: { orquestracao: CLAUDE, codificacao_testes: OPENAI, validacao: CLAUDE }, zelador: { zelador: CLAUDE } },
  catalogo, papeis: { executor: ['orquestracao', 'codificacao_testes', 'validacao'], zelador: ['zelador'] },
  pausas: { legivel: true, provedores: {}, versao: null }, observacao: 'Fixture: a frota escolhe os modelos.' });
const candidato = {
  id: CARTA_PLAYER, identificador: 'PLAYER-38', titulo: 'Proxy de mídia (fixture)',
  projeto: 'PLAYER', projetoId: PROJETO_PLAYER, estado: 'Todo',
  url: 'https://plane.vpn.astargne.com/PLAYER-38/', atualizadoEm: VERSAO,
  labels: ['READY TO DEV'], dependencias: [], elegivel: true, motivos: [], gate: 'READY TO DEV',
  agentesDisponiveis: [{ id: 'Claude', modelo: 'claude-opus-5', esforco: 'max' },
    { id: 'OpenAI', modelo: 'gpt-6-astra', esforco: 'extreme high' }],
  lease: null, leaseSituacao: 'livre', tentativa: null, historico: [], comandos: ['testes', 'portao'],
  perfilAntigo: { estado: 'ignorado', resumo: 'orquestracao claude/claude-opus-5/max · codificacao_testes openai/gpt-6-astra/low' },
  avisosContrato: [],
};
const bloqueada = (id, identificador, labels, motivos, dependencias = []) => ({
  ...candidato, id, identificador, titulo: `${identificador} (fixture)`, labels,
  motivos, dependencias, elegivel: false, gate: labels.length === 1 ? labels[0] : null,
  agentesDisponiveis: [], comandos: [],
});
const fila = {
  modo: 'leitura-e-simulacao', execucaoHabilitada: false, atualizadoEm: VERSAO, frota: { estado: 'ok', versao: 3, motivo: null },
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

async function fixtures(page, { preparar = 'sem-sso', atrasoFrotaMs = 0, catalogo = CATALOGO, confirmar = false, convites = [] } = {}) {
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
    // Diagnóstico da voz (25/10/2026): o navegador manda telemetria do
    // microfone/áudio ao carregar — não é escrita privilegiada nem Plane; fica
    // fora da auditoria de "nenhuma chamada que não seja GET".
    if (url.pathname === '/api/diagnostico/voz') { await route.fulfill({ status: 204, body: '' }); return; }
    let corpo = null;
    if (req.postData()) {
      try { corpo = req.postDataJSON(); } catch { corpo = null; }
    }
    chamadas.push({ metodo: req.method(), caminho: url.pathname, corpo });
    const responder = async (dados, status = 200) => route.fulfill({ status,
      contentType: 'application/json; charset=utf-8', body: JSON.stringify(dados) });
    if (req.method() === 'GET') {
      if (url.pathname === '/api/projetos') return responder({ projetos: [] });
      // Rotas só-leitura que a página nova consulta ao carregar (25/10/2026):
      // presença da transcrição xAI e a rotina de alinhamento da aba Docs.
      if (url.pathname === '/api/orquestracao/voz') return responder({ xai: false });
      if (url.pathname === '/api/alinhamento') return responder({ varridoEm: '2026-10-25T00:00:00Z', duracaoMs: 0, erroPlane: null, cartasMedidas: 0, limiarFio: 8, totais: {}, total: 0, projetos: [] });
      if (url.pathname === '/api/backlog') return responder({ projetos: [] });
      if (url.pathname === '/api/decisoes') return responder({ decisoes: [] });
      if (url.pathname === '/api/producao') return responder({ sondas: [] });
      // Hangar (28/10/2026) é a entrada: a raiz lê naves e droids ao abrir.
      if (url.pathname === '/api/hangar') return responder({ naves: [], acervo: [] });
      if (url.pathname === '/api/hangar/sessoes') return responder({ em: VERSAO, ias: [], sessoes: [] });
      if (url.pathname === '/api/tts') return responder({ disponivel: false, motivo: 'fixture' });
      if (url.pathname === '/api/contas/apps') return responder({ apps: [] });
      if (url.pathname === '/api/contas/usuarios') return responder({ usuarios: [] });
      if (url.pathname === '/api/contas/convites') return responder({ convites });
      if (url.pathname === '/api/orquestracao') return responder(fila);
      if (url.pathname === '/api/orquestracao/triagem-dev') return responder(triagemDev);
      if (url.pathname === '/api/orquestracao/vigilia') return responder({ atualizadoEm: VERSAO, intervaloSegundos: 120, varrendo: false,
        observacao: 'Fixture.', pausasFrota: { legivel: true, provedores: { claude: { ate: '2099-01-01T00:00:00Z', motivo: 'limite de uso do provedor' } },
          versao: { versao: 3, hash: 'f'.repeat(64), motivo: 'CLI ou modelo openai impedido' } },
        projetos: [{ projetoId: PROJETO_PLAYER, nome: 'PLAYER', ligada: true, impedimentos: [], limites: null, frota: { estado: 'ok', versao: 3, hash: 'f'.repeat(64) },
          avisos: ['vigilia.perfilPadrao ignorado: a frota manda'], diario: [], ultimaVarredura: null, proximaCarta: null, motivoOciosa: null, tentativasHoje: 0 }] });
      if (url.pathname === '/api/orquestracao/frota') {
        if (atrasoFrotaMs) await new Promise(resolve => setTimeout(resolve, atrasoFrotaMs));
        return responder(frotaFixture(catalogo));
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
      if (url.pathname === '/api/orquestracao/canal') return responder({ interacoes: [], handoffs: [], resumo: {
        estado: 'Estado (29/10/2026): proxy em código, falta a unit.', feito: null, descricao: null, ultimoHandoff: null, ultimoGate: null,
        fio: { comentarios: 3, desdeCompactacao: 3, pedeCompactacao: false, ultimo: null } } });
      if (url.pathname === '/api/orquestracao/diario') return responder({ eventos: [
        { quando: '2026-10-29T10:00:00Z', origem: 'vigilia', carta: 'PLAYER-38', tipo: 'AVANCO', de: 'READY TO DEV', para: 'READY TO TEST' }], total: 1, avisos: [] });
    }
    // N5: escrita da aba Contas sem sessão SSO recebe 401, como no servidor.
    if (req.method() !== 'GET' && url.pathname.startsWith('/api/contas/')) {
      return responder({ erro: 'entre no Cadastro Único para confirmar esta ação' }, 401);
    }
    if (req.method() === 'POST' && url.pathname === '/api/orquestracao/frota/preparar') {
      if (preparar === 'sem-sso') return responder({ erro: 'entre no Cadastro Único para confirmar esta ação' }, 401);
      const { marca, ...conteudo } = corpo;
      if (marca !== MARCA) return responder({ erro: 'a frota mudou desde que você a abriu; recarregue antes de preparar' }, 422);
      return responder({ confirmacaoId: '44444444-4444-4444-8444-444444444444', conteudo,
        atual: { estado: 'ok', versao: 3, motivo: null }, aviso: 'Fixture: nenhuma escrita foi feita.', expiraEm: '2099-01-01T00:00:00Z' });
    }
    if (confirmar && req.method() === 'POST' && url.pathname === '/api/orquestracao/frota/confirmar') {
      return responder({ estado: 'ok', versao: 4, hash: 'e'.repeat(64), conteudo: {}, substituiu: 'ok' });
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

// Reescritos na F2 (29/10/2026): a escolha por carta ("Papéis e modelos") saiu por decisão
// do dono; os mesmos seletores agora editam a frota, uma configuração só.
async function abrirFrota(page) {
  await page.goto('/#/orquestracao');
  await page.locator('[data-orq-topico="frota"]').click();
  return aguardarPapeisDaFrota(page, 5000);
}

test('Frota: mostra a v3, quatro papéis e os seletores partem dela, sem escrita', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirFrota(page);
  await expect(page.locator('#orq-frota-atual')).toContainText('Frota v3');
  await expect(page.locator('#orq-frota-atual')).toContainText('codificação e testes: openai/gpt-6-astra/extreme high');
  await expect(page.locator('#orq-frota-atual')).toContainText('zelador: claude/claude-opus-5/max');
  await expect(page.locator('#orq-frota-executor .orq-papel')).toHaveCount(3);
  await expect(page.locator('#orq-frota-zelador .orq-papel')).toHaveCount(1);
  await expect(page.locator('.orq-seletor-provedor').nth(1)).toHaveValue('openai');
  await expect(page.locator('.orq-seletor-esforco').nth(0)).toHaveValue('max');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('Frota: modelo depende do provedor e esforço depende do modelo; a tela só oferece o que o catálogo do servidor manda', async ({ page }) => {
  const catalogo = [...CATALOGO, { provedor: 'openai', modelo: 'gpt-6-sol', esforcoPadrao: 'xhigh', esforcos: ['medium', 'xhigh'], disponivel: true }];
  const audit = await fixtures(page, { preparar: 'simulado', catalogo });
  await abrirFrota(page);
  const provedores = page.locator('.orq-seletor-provedor');
  const modelos = page.locator('.orq-seletor-modelo');
  const esforcos = page.locator('.orq-seletor-esforco');
  await provedores.nth(0).selectOption('openai');
  expect(await modelos.nth(0).locator('option').allTextContents()).toEqual(['gpt-6-astra', 'gpt-6-sol']);
  expect(await esforcos.nth(0).locator('option').evaluateAll(nos => nos.map(no => no.value))).toEqual(['low', 'medium', 'high', 'xhigh']);
  await modelos.nth(0).selectOption('gpt-6-sol');
  await esforcos.nth(0).selectOption('medium');
  await page.getByRole('button', { name: 'Preparar a frota nova' }).click();
  await expect(page.locator('#orq-frota-confirmacao')).toBeVisible();
  const preparo = audit.chamadas.find(c => c.caminho === '/api/orquestracao/frota/preparar');
  expect(preparo.corpo).toEqual({
    executor: { orquestracao: { provedor: 'openai', modelo: 'gpt-6-sol', esforco: 'medium' }, codificacao_testes: OPENAI, validacao: CLAUDE },
    zelador: { zelador: CLAUDE },
    marca: MARCA,
  });
  expect(audit.chamadas.some(c => c.caminho.endsWith('/confirmar'))).toBe(false);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('três campos por papel cabem no desktop e empilham no celular', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirFrota(page);
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

test('espera a API da frota antes de contar os quatro papéis', async ({ page }) => {
  const audit = await fixtures(page, { atrasoFrotaMs: 1000 });
  const seletores = await abrirFrota(page);
  await expect(seletores).toHaveCount(4);
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('POST externo de fundo é bloqueado sem simular escrita inesperada no Painel', () => {
  expect(classificarPedido('GET', 'https://painel.vpn.astargne.com/api/orquestracao')).toBe('leitura');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/frota/preparar')).toBe('preparo-permitido');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/frota/confirmar')).toBe('bloquear-painel');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/modelos/preparar')).toBe('bloquear-painel');
  expect(classificarPedido('POST', 'https://painel.vpn.astargne.com/api/orquestracao/despacho/confirmar')).toBe('bloquear-painel');
  expect(classificarPedido('PATCH', 'https://painel.vpn.astargne.com/api/contas/usuarios/1')).toBe('bloquear-painel');
  expect(classificarPedido('POST', 'https://astargne.com/api/sessao/renovar')).toBe('bloquear-externo');
  expect(classificarPedido('DELETE', 'https://astargne.com/api/sessao')).toBe('bloquear-externo');
});

test('sem SSO, preparar a frota não gera confirmação e orienta o login', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirFrota(page);
  await page.getByRole('button', { name: 'Preparar a frota nova' }).click();
  await expect(page.locator('#orq-frota-status')).toContainText('https://astargne.com/login');
  await expect(page.locator('#orq-frota-confirmacao')).toBeHidden();
  expect(audit.chamadas.filter(c => c.metodo === 'POST').map(c => c.caminho)).toEqual(['/api/orquestracao/frota/preparar']);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('SSO simulado só prepara a frota: mudar a seleção descarta a confirmação', async ({ page }) => {
  const audit = await fixtures(page, { preparar: 'simulado' });
  await abrirFrota(page);
  await page.getByRole('button', { name: 'Preparar a frota nova' }).click();
  await expect(page.locator('#orq-frota-confirmacao')).toBeVisible();
  await expect(page.locator('#orq-frota-confirmacao')).toContainText('substitui a v3');
  await expect(page.getByRole('button', { name: 'Confirmar a frota nova' })).toBeVisible();
  await page.locator('.orq-seletor-provedor').nth(1).selectOption('claude');
  await expect(page.locator('#orq-frota-confirmacao')).toBeHidden();
  await expect(page.locator('#orq-frota-status')).toContainText('Seleção alterada');
  expect(audit.chamadas.some(c => c.caminho.endsWith('/confirmar'))).toBe(false);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('Frota: preparar não grava; confirmar é a segunda ação e só ela chega ao confirmar', async ({ page }) => {
  const audit = await fixtures(page, { preparar: 'simulado', confirmar: true });
  await abrirFrota(page);
  await page.locator('.orq-seletor-esforco').nth(2).selectOption('high');
  await page.getByRole('button', { name: 'Preparar a frota nova' }).click();
  await expect(page.locator('#orq-frota-confirmacao')).toContainText('validação: claude/claude-opus-5/high');
  expect(audit.chamadas.filter(c => c.metodo === 'POST').map(c => c.caminho)).toEqual(['/api/orquestracao/frota/preparar']);
  await page.getByRole('button', { name: 'Confirmar a frota nova' }).click();
  await expect(page.locator('#orq-frota-status')).toContainText('Frota v4 gravada');
  const posts = audit.chamadas.filter(c => c.metodo === 'POST');
  expect(posts.map(c => c.caminho)).toEqual(['/api/orquestracao/frota/preparar', '/api/orquestracao/frota/confirmar']);
  expect(posts[1].corpo).toEqual({ confirmacaoId: '44444444-4444-4444-8444-444444444444' });
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('carta com PERFIL-IA antigo mostra "perfil antigo ignorado" e a versão da frota', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await expect(page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' })).toContainText('perfil antigo ignorado');
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await expect(page.locator('#orq-elegibilidade')).toContainText('perfil antigo ignorado (era orquestracao claude/claude-opus-5/max · codificacao_testes openai/gpt-6-astra/low; roda a frota v3)');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('cinco abas abrem sem chamada de escrita', async ({ page }) => {
  const audit = await fixtures(page);
  await page.goto('/');
  await expect(page.locator('#aba-hangar')).toBeVisible();
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

test('resumo da carta e diário da frota: estado da descrição, link do Plane, eventos, sem escrita', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('#orq-cartas button').filter({ hasText: 'PLAYER-38' }).click();
  await page.locator('[data-orq-topico="conversa"]').click();
  await expect(page.locator('#orq-conversa')).toContainText('Estado (29/10/2026): proxy em código');
  await expect(page.locator('#orq-conversa')).toContainText('3 comentário(s) no fio');
  await expect(page.locator('#orq-conversa a')).toHaveText(/Abrir o fio inteiro no Plane/);
  await page.locator('[data-orq-topico="historico"]').click();
  await expect(page.locator('#orq-historico')).toContainText('PLAYER-38 · AVANCO · READY TO DEV → READY TO TEST');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('Vigília mostra as pausas da frota (provedor e versão), globais, sem pausa por projeto', async ({ page }) => {
  const audit = await fixtures(page);
  await abrirOrquestracao(page);
  await page.locator('[data-orq-topico="vigilia"]').click();
  await expect(page.locator('#orq-vigilia')).toContainText('Pausas da frota (todos os projetos): claude pausado até');
  await expect(page.locator('#orq-vigilia')).toContainText('v3 pausada: CLI ou modelo openai impedido');
  await expect(page.locator('#orq-vigilia')).toContainText('PLAYER · ligada');
  await expect(page.locator('#orq-vigilia')).toContainText('vigilia.perfilPadrao ignorado');
  expect(audit.chamadas.filter(c => c.metodo !== 'GET')).toEqual([]);
  expect(audit.inesperadas).toEqual([]);
  expect(audit.errosPagina).toEqual([]);
});

test('Contas: escrita sem sessão SSO é recusada e a aba orienta o login; ação sem corpo manda JSON', async ({ page }) => {
  const convite = { id: 7, email: 'alguem@exemplo.com', nome: 'Alguém', criado_em: VERSAO, expira_em: '2099-01-01T00:00:00Z', apps: [] };
  const audit = await fixtures(page, { convites: [convite] });
  await page.goto('/#/contas');
  await expect(page.locator('#aba-contas')).toContainText('alguem@exemplo.com');
  await page.locator('#aba-contas button', { hasText: 'reenviar' }).click();
  await expect(page.locator('#aba-contas')).toContainText('astargne.com/login');
  const escrita = audit.chamadas.filter(c => c.metodo !== 'GET');
  expect(escrita.map(c => `${c.metodo} ${c.caminho}`)).toEqual(['POST /api/contas/convites/7/reenviar']);
  expect(escrita[0].corpo).toEqual({});
  expect(audit.errosPagina).toEqual([]);
});
