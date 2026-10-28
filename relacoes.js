// Relações estruturadas entre os projetos da raiz — espelho do que está em
// prosa em ../../RELACOES.md (era seção do CLAUDE.md da raiz até 30/09/2026). Mude os
// dois juntos: uma relação nova ali entra aqui também, na mesma entrega.
// `de`/`para` referenciam `pasta` de projetos.js (ou `id` de NOS_EXTRA) —
// mesma chave usada em todo o resto do sistema, sem duplicar identidade.
export const RELACOES = [
  {
    // Prova de equivalência do dashboard 7791 (PAINEL-35, 24/10/2026): leitura
    // pura por processo python descartável; as ações do ciclo não migram.
    de: 'painel-admin',
    para: 'SupervisorHandoff',
    tipo: 'leitura',
    rotulo: 'lê os dois canais do doc 59 por scripts/estado_canal.py (só leitura, sem fetch) na aba Orquestração',
  },
  {
    // A integração espacial só existe no repo congelado; o LoreEngine novo
    // resolve viagem por dado informado pelo Mestre (ADR-0047 dele).
    de: '_oldSistemaLoreEngine',
    para: 'Mapa Khorvaire',
    tipo: 'leitura',
    rotulo: 'lia por Postgres só-leitura (SPATIAL_DATABASE_URL); o LoreEngine novo não tem adapter espacial',
  },
  {
    de: 'DiscordTranscriber',
    para: 'LoreEngine',
    tipo: 'contrato',
    rotulo: 'contrato lore-transcript-v2 — desenhado contra o antigo, a revalidar contra o novo',
  },
  {
    de: 'LoreEngine',
    para: '_oldSistemaLoreEngine',
    tipo: 'leitura',
    rotulo: 'predecessor congelado (../sistemaloreengine nos docs dele) — referência somente-leitura',
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
  {
    de: 'CadastroUnico',
    para: 'astargne.com',
    tipo: 'hospedagem',
    rotulo: 'produção — raiz do domínio (login/SSO), systemd 127.0.0.1:8790 + ponte astargne_sso',
  },
  {
    de: 'PlayerForM3UList',
    para: 'CadastroUnico',
    tipo: 'leitura',
    rotulo: 'valida sessão em /interno/sessao/verificar (app player) desde 13/09/2026',
  },
  {
    de: 'painel-admin',
    para: 'CadastroUnico',
    tipo: 'operacao',
    rotulo: 'aba Contas administra o cadastro via ssh + curl no loopback do servidor (token nunca no PC)',
  },
];

// Nós que não são projeto do catálogo (projetos.js), mas aparecem como ponta
// de relação — hoje só o servidor de produção. C-3PO não entra aqui: já é
// "⊂ painel-admin" (fundido em 14/08/2026), não é mais projeto irmão, não há
// relação de grafo a desenhar nele.
export const NOS_EXTRA = [
  { id: 'astargne.com', titulo: 'astargne.com (RackNerd)' },
];
