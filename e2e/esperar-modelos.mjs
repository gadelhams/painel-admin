import { expect } from '@playwright/test';

// A sub-aba Frota carrega catálogo e frota da API depois do clique: count() imediato é uma corrida.
// Quatro papéis: três do executor e o zelador.
export async function aguardarPapeisDaFrota(page, timeout = 30_000) {
  const seletores = page.locator('.orq-seletor-modelo');
  try {
    await expect(seletores).toHaveCount(4, { timeout });
  } catch {
    const mensagem = (await page.locator('#orq-frota-atual').textContent().catch(() => ''))?.trim();
    throw new Error(`esperados quatro papéis após carregar a frota; UI: ${mensagem || 'sem detalhes'}`);
  }
  return seletores;
}
