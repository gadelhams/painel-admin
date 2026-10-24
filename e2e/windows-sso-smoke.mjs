// Prova final de SSO em navegador Windows. Não salva sessão, screenshot,
// storageState ou trace. Bloqueia escritas exceto validar/preparar.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { aguardarTresPapeis } from './esperar-modelos.mjs';
import { classificarPedido, ORIGEM_PAINEL } from './politica-post.mjs';

const PAINEL = ORIGEM_PAINEL;
const LOGIN = 'https://astargne.com/login';
const CARTA = 'PLAYER-38';
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
    const carta = fila.itens.find(item => item.identificador === CARTA);
    assert.ok(carta, `${CARTA} ausente da fila`);
    const rm = await context.request.get(`${PAINEL}/api/orquestracao/modelos?carta=${encodeURIComponent(carta.id)}`);
    assert.equal(rm.status(), 200, 'modelos indisponíveis pelo domínio autorizado');
    const modelos = await rm.json();
    assert.equal(fila.execucaoHabilitada, false, 'execução real ligada: abortando smoke');
    assert.equal(carta.lease, null, 'há lease: abortando smoke');
    assert.equal(carta.tentativa, null, 'há tentativa: abortando smoke');
    assert.equal(modelos.perfil, null, 'já há perfil no card: abortando smoke sem alterar');
    return { carta, modelos };
  }

  const antes = await estado();
  assert.deepEqual(antes.carta.agentesDisponiveis.map(a => a.id), ['Claude', 'OpenAI']);
  await page.goto(`${PAINEL}/?carta=${CARTA}#/orquestracao`, { waitUntil: 'domcontentloaded' });
  await page.locator('#orq-card-cabecalho').getByText(CARTA).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Papéis e modelos' }).click();
  const seletores = await aguardarTresPapeis(page);
  const provedores = page.locator('.orq-seletor-provedor');
  assert.equal(await provedores.count(), 3, 'esperados três seletores de provedor');
  for (let i = 0; i < 3; i++) {
    const opcoes = await provedores.nth(i).locator('option').evaluateAll(nos => nos.map(no => no.value));
    assert.deepEqual(opcoes, ['claude', 'openai'], 'provedores esperados ausentes');
    assert.equal(await seletores.nth(i).inputValue(), 'claude-opus-5');
  }
  console.log('Três papéis carregados; validando a combinação de modelos.');
  await provedores.nth(1).selectOption('openai');
  assert.equal(await seletores.nth(1).inputValue(), 'gpt-6-astra');
  await page.getByRole('button', { name: 'Validar proposta' }).click();
  await page.waitForFunction(() => document.getElementById('orq-modelos-status')
    ?.textContent?.includes('ainda não gravada no card'), null, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Preparar registro no card' }).click();
  try {
    await page.locator('#orq-confirmacao-modelos').waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    const motivo = (await page.locator('#orq-modelos-status').textContent())?.trim();
    throw new Error(`SSO/preparo falhou: ${motivo ?? 'sem mensagem'}`);
  }
  const confirmacao = await page.locator('#orq-confirmacao-modelos').textContent();
  assert.match(confirmacao, /orquestracao: claude\/claude-opus-5\/max/);
  assert.match(confirmacao, /codificacao_testes: openai\/gpt-6-astra\/xhigh/);
  assert.match(confirmacao, /validacao: claude\/claude-opus-5\/max/);
  console.log(`Escritas bloqueadas: Painel ${bloqueadasPainel.length}, outras origens ${bloqueadasExternas}.`);
  assert.deepEqual(bloqueadasPainel, [], 'o Painel tentou escrita inesperada');

  // Nunca clica em Confirmar. Preparar só cria confirmação em memória.
  const depois = await estado();
  assert.equal(depois.carta.atualizadoEm, antes.carta.atualizadoEm, 'o card mudou durante o smoke');
  console.log('PASSOU: SSO real, modelos e preparo em duas etapas; perfil, lease e tentativa continuam ausentes.');
  console.log('Nenhum comentário foi gravado e nenhum despacho foi iniciado.');
} catch (erro) {
  console.error(`FALHOU: ${erro.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
