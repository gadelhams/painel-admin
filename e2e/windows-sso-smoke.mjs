// Prova final de SSO em navegador Windows. Não salva sessão, screenshot,
// storageState ou trace. Bloqueia escritas exceto o preparar da frota.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { aguardarPapeisDaFrota } from './esperar-modelos.mjs';
import { classificarPedido, ORIGEM_PAINEL } from './politica-post.mjs';

const PAINEL = ORIGEM_PAINEL;
const LOGIN = 'https://astargne.com/login';
const canal = process.env.ORQ_E2E_BROWSER ?? 'chrome';
if (process.platform !== 'win32') throw new Error('Este smoke real deve rodar no Windows autorizado pelo tailnet.');
if (!['chrome', 'msedge'].includes(canal)) throw new Error('ORQ_E2E_BROWSER deve ser chrome ou msedge.');

let browser;
try {
  browser = await chromium.launch({ headless: false, channel: canal });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const page = await context.newPage();

  console.log('Uma janela do navegador foi aberta em astargne.com/login.');
  console.log('Entre com a sua conta nessa janela. Não digite senha neste terminal nem no chat.');
  console.log('O teste continuará automaticamente quando o Cadastro Único abrir a home. Limite: 10 minutos.');
  await page.goto(LOGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.origin === 'https://astargne.com' && url.pathname === '/', { timeout: 600_000 });
  console.log('Login reconhecido; verificando a fila do Painel.');

  const bloqueadasPainel = [];
  let bloqueadasExternas = 0;
  await context.route('**/*', async route => {
    const pedido = route.request();
    const classe = classificarPedido(pedido.method(), pedido.url());
    if (classe === 'leitura' || classe === 'preparo-permitido') return route.continue();
    if (classe === 'bloquear-painel') bloqueadasPainel.push(new URL(pedido.url()).pathname);
    else bloqueadasExternas++;
    return route.abort('blockedbyclient');
  });

  async function estado() {
    const rf = await context.request.get(`${PAINEL}/api/orquestracao`);
    assert.equal(rf.status(), 200, 'fila indisponível pelo domínio autorizado');
    const fila = await rf.json();
    assert.equal(fila.execucaoHabilitada, false, 'execução real ligada: abortando smoke');
    const rfr = await context.request.get(`${PAINEL}/api/orquestracao/frota`);
    assert.equal(rfr.status(), 200, 'frota indisponível pelo domínio autorizado');
    return await rfr.json();
  }

  const antes = await estado();
  await page.goto(`${PAINEL}/#/orquestracao`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-orq-topico="frota"]').click();
  const seletores = await aguardarPapeisDaFrota(page);
  const provedores = page.locator('.orq-seletor-provedor');
  assert.equal(await provedores.count(), 4, 'esperados quatro seletores de provedor (executor e zelador)');
  for (let i = 0; i < 4; i++) {
    const opcoes = await provedores.nth(i).locator('option').evaluateAll(nos => nos.map(no => no.value));
    assert.deepEqual(opcoes, ['claude', 'openai'], 'provedores esperados ausentes');
  }
  console.log('Quatro papéis carregados; preparando uma frota mista.');
  await provedores.nth(1).selectOption('openai');
  assert.equal(await seletores.nth(1).inputValue(), 'gpt-6-astra');
  await page.getByRole('button', { name: 'Preparar a frota nova' }).click();
  try {
    await page.locator('#orq-frota-confirmacao').waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    const motivo = (await page.locator('#orq-frota-status').textContent())?.trim();
    throw new Error(`SSO/preparo falhou: ${motivo ?? 'sem mensagem'}`);
  }
  const confirmacao = await page.locator('#orq-frota-confirmacao').textContent();
  assert.match(confirmacao, /codificação e testes: openai\/gpt-6-astra/);
  console.log(`Escritas bloqueadas: Painel ${bloqueadasPainel.length}, outras origens ${bloqueadasExternas}.`);
  assert.deepEqual(bloqueadasPainel, [], 'o Painel tentou escrita inesperada');

  // Nunca clica em Confirmar. Preparar só cria confirmação em memória.
  const depois = await estado();
  assert.equal(depois.estado, antes.estado, 'a frota mudou durante o smoke');
  assert.equal(depois.versao ?? null, antes.versao ?? null, 'a frota mudou durante o smoke');
  console.log('PASSOU: SSO real e preparo da frota em duas etapas; a frota continua a mesma.');
  console.log('Nada foi gravado e nenhum despacho foi iniciado.');
} catch (erro) {
  console.error(`FALHOU: ${erro.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
