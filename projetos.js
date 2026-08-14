// Catálogo dos projetos da raiz. Metadados que não dão para derivar do disco
// (portas, URL de produção, onde fica o repo git) vivem aqui; o resto o
// servidor coleta ao vivo. Mantenha em sincronia com o CLAUDE.md da raiz.

export const PROJETOS = [
  {
    pasta: 'SistemaLoreEngine',
    titulo: 'Sistema Lore Engine',
    descricao: 'Motor de continuidade narrativa para campanhas de RPG — código decide, IA narra.',
    stack: 'pnpm · TypeScript · Fastify · React · Postgres',
    entrada: 'CLAUDE.md',
    portas: [
      { porta: 3333, servico: 'API' },
      { porta: 5173, servico: 'Web (Vite)' },
      { porta: 5432, servico: 'Postgres' },
    ],
  },
  {
    pasta: 'Mapa Khorvaire',
    titulo: 'Mapa Khorvaire',
    descricao: 'Subsistema geoespacial auditável de Khorvaire — rotas, distâncias, evidências.',
    stack: 'Postgres + PostGIS + pgRouting · SQL cru · PowerShell',
    entrada: 'README.md',
    portas: [{ porta: 54329, servico: 'Postgres' }],
  },
  {
    pasta: 'DiscordTranscriber',
    titulo: 'Discord Transcriber',
    descricao: 'Bot que grava e transcreve canais de voz; modo campanha alimenta o Lore Engine.',
    stack: 'pnpm · TypeScript · LLM local',
    entrada: 'docs/00_PLANO.md',
    portas: [{ porta: 11434, servico: 'Ollama' }],
  },
  {
    pasta: 'ProjetoConversaComDeus',
    titulo: 'Conversa com Deus',
    descricao: 'Escrita assistida de livro de diálogos filosóficos — 6 personagens IA, canonização com aprovação humana.',
    stack: 'Python/FastAPI · SQLite · Next.js · Anthropic',
    entrada: 'filosofia/CLAUDE.md',
    subRepo: 'filosofia',
    portas: [
      { porta: 8000, servico: 'API (FastAPI)' },
      { porta: 3000, servico: 'Web (Next)' },
    ],
  },
  {
    pasta: 'Corre do Tarado',
    titulo: 'Corre do Tarado',
    descricao: 'Remake web do mapa de Warcraft 3 — perseguição single e multiplayer para 12.',
    stack: 'JS vanilla + canvas · Node + ws',
    entrada: 'jogo-web/README.md',
    producao: 'https://tarado.astargne.com',
    portas: [{ porta: 8323, servico: 'Servidor' }],
  },
  {
    pasta: 'alexa youtube',
    titulo: 'Alexa YouTube Music',
    descricao: 'Skill Alexa que toca a conta pessoal do YouTube Music; Lambda + proxy de áudio em casa.',
    stack: 'Node CommonJS · AWS Lambda + DynamoDB · Docker',
    entrada: 'README.md',
    portas: [{ porta: 3000, servico: 'Proxy de áudio' }],
  },
  {
    pasta: 'PlayerForM3UList',
    titulo: 'Player M3U/IPTV',
    descricao: 'Player de listas M3U — PWA, TV Samsung Tizen e iOS futuro.',
    stack: 'React 19 + Vite · hls.js · Capacitor',
    entrada: 'README.md',
    portas: [{ porta: 5173, servico: 'Dev (Vite)' }],
  },
  {
    pasta: 'RagPTdoZero',
    titulo: 'Ragnarok pré-renewal',
    descricao: 'Servidor privado de Ragnarok Online (rAthena pré-renewal) empacotado em Docker.',
    stack: 'rAthena (C/C++) · Docker · MariaDB 11',
    entrada: 'README.md',
    portas: [
      { porta: 6900, servico: 'login-server' },
      { porta: 6121, servico: 'char-server' },
      { porta: 5121, servico: 'map-server' },
      { porta: 3306, servico: 'MariaDB' },
    ],
  },
];
// O severino saiu do catálogo em 14/08/2026: foi fundido NESTE app (rota
// /severino/, mesma porta 7777) — deixou de existir como projeto irmão.

// Sondas de produção que não pertencem a um projeto específico.
export const PRODUCAO_EXTRA = [
  { rotulo: 'Caddy do host (astargne.com)', url: 'https://astargne.com' },
];
