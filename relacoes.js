// Relações estruturadas entre os projetos da raiz — espelho do que está em
// prosa na seção "Relações entre projetos" do CLAUDE.md da raiz. Mude os
// dois juntos: uma relação nova ali entra aqui também, na mesma entrega.
// `de`/`para` referenciam `pasta` de projetos.js (ou `id` de NOS_EXTRA) —
// mesma chave usada em todo o resto do sistema, sem duplicar identidade.
export const RELACOES = [
  {
    de: 'SistemaLoreEngine',
    para: 'Mapa Khorvaire',
    tipo: 'leitura',
    rotulo: 'lê por Postgres só-leitura (SPATIAL_DATABASE_URL)',
  },
  {
    de: 'DiscordTranscriber',
    para: 'SistemaLoreEngine',
    tipo: 'contrato',
    rotulo: 'contrato lore-transcript-v2',
  },
  {
    de: 'ProjetoConversaComDeus',
    para: 'astargne.com',
    tipo: 'hospedagem',
    rotulo: 'produção — Docker + Caddy',
  },
  {
    de: 'Corre do Tarado',
    para: 'astargne.com',
    tipo: 'hospedagem',
    rotulo: 'produção — systemd, auto-deploy',
  },
  {
    de: 'alexa youtube',
    para: 'astargne.com',
    tipo: 'hospedagem',
    rotulo: 'borda do proxy (áudio roda em casa via Tailscale)',
  },
  {
    de: 'RagPTdoZero',
    para: 'astargne.com',
    tipo: 'hospedagem',
    rotulo: 'produção — ro.astargne.com + portas de jogo',
  },
];

// Nós que não são projeto do catálogo (projetos.js), mas aparecem como ponta
// de relação — hoje só o servidor de produção. Severino não entra aqui: já é
// "⊂ painel-admin" (fundido em 14/08/2026), não é mais projeto irmão, não há
// relação de grafo a desenhar nele.
export const NOS_EXTRA = [
  { id: 'astargne.com', titulo: 'astargne.com (RackNerd)' },
];
