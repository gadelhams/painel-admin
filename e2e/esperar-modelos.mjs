import { expect } from '@playwright/test';

// A seção carrega as opções da API depois do clique: count() imediato é uma corrida.
export async function aguardarTresPapeis(page, timeout = 30_000) {
  const seletores = page.locator('.orq-seletor-modelo');
  try {
    await expect(seletores).toHaveCount(3, { timeout });
  } catch {
    const mensagem = (await page.locator('#orq-modelos').textContent().catch(() => ''))?.trim();
    throw new Error(`esperados três papéis após carregar modelos; UI: ${mensagem || 'sem detalhes'}`);
  }
  return seletores;
}
