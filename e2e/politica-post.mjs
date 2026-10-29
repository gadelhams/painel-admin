export const ORIGEM_PAINEL = 'https://painel.vpn.astargne.com';

// Desde a F2 (29/10/2026) o único preparo provado no smoke é o da frota; confirmar nunca.
const ROTAS_DE_PREPARO = new Set([
  '/api/orquestracao/frota/preparar',
]);

// Todas as outras escritas são bloqueadas. Só tentativas dirigidas ao Painel
// invalidam o smoke; apps já abertos no contexto podem fazer POST de fundo.
export function classificarPedido(metodo, endereco) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return 'leitura';
  const url = new URL(endereco);
  if (metodo === 'POST' && url.origin === ORIGEM_PAINEL && ROTAS_DE_PREPARO.has(url.pathname)) return 'preparo-permitido';
  return url.origin === ORIGEM_PAINEL ? 'bloquear-painel' : 'bloquear-externo';
}
