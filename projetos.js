// Catálogo dos projetos da raiz. Metadados que não dão para derivar do disco
// (portas, URL de produção, onde fica o repo git) vivem aqui; o resto o
// servidor coleta ao vivo. Mantenha em sincronia com ../CLAUDE.md (mapa de ProjetosPessoais/) e ../../PORTAS.md.

// `area` = a pasta de ~/Work onde o projeto mora desde a reorganização de
// 30/09/2026 (ProjetosPessoais ou ProjetosCompartilhados). `pasta` continua
// sendo o identificador (rotas, relacoes.js, nomes curtos).
export const PROJETOS = [
  {
    // Reescrita do Felipe (repo privado feliperodrigues/lore-engine), clonada
    // em 27/09/2026 no lugar do SistemaLoreEngine. Não tem backlog na
    // gramática da raiz: o aberto vive em docs/current.md e
    // docs/migration/remaining-dependencies.md — por isso sem campo `backlog`.
    // Produção é o homelab do Felipe (Tailscale), não o astargne.com.
    pasta: 'LoreEngine',
    area: 'ProjetosCompartilhados',
    titulo: 'Lore Engine',
    descricao: 'Motor de continuidade narrativa para campanhas de RPG, reescrito — código decide, IA narra; PostgreSQL é o cânone.',
    stack: 'pnpm · TypeScript 6 · NestJS 12 · Angular 22 · Drizzle · Postgres 18',
    entrada: 'AGENTS.md',
    portas: [
      { porta: 3100, servico: 'API (NestJS)' },
      { porta: 4210, servico: 'Web (Angular)' },
      { porta: 5434, servico: 'Postgres' },
    ],
  },
  {
    // Congelado em 27/09/2026 (último commit 19/09) como referência
    // somente-leitura da reescrita acima. Continua no catálogo porque o
    // backlog doc 39, os diagramas e o canal 59 do SupervisorHandoff moram aqui.
    pasta: '_oldSistemaLoreEngine',
    area: 'ProjetosPessoais',
    // Congelado = fora das listas de decisão (aba Decisões e bloco Astargne):
    // card parado de projeto só-leitura não é pendência de ninguém.
    congelado: true,
    titulo: 'Sistema Lore Engine (congelado)',
    descricao: 'O Lore Engine original (Notion como autoridade), congelado em 27/09/2026 — só referência de leitura.',
    stack: 'pnpm · TypeScript · Fastify · React · Postgres',
    entrada: 'CLAUDE.md',
    // A aba Backlog projeta o arquivo `backlog` em leitura apenas — o
    // markdown é a verdade (docs/02_ABA_BACKLOG.md).
    backlog: 'docs/39_BACKLOG.md',
    // Curadoria pra página de projeto (20/08/2026): só os 3 projetos com
    // diagrama Mermaid vivo em algum .md ganham este campo — os outros 6
    // ficam sem ele, e a página mostra "sem diagrama ainda" honestamente.
    docs: {
      arquitetura: ['docs/07_ARCHITECTURE.md', 'docs/14_ARCHITECTURE_GUIDE.md', 'docs/46_MAPA_TECNICO_DO_SISTEMA.md'],
      objetos: ['docs/47_MODELO_DE_OBJETOS.md'],
      dataFlow: ['docs/15_FUNCTIONAL_FLOWS.md', 'docs/48_FLUXOS_DE_DADOS.md'],
    },
    portas: [
      { porta: 3333, servico: 'API' },
      { porta: 5173, servico: 'Web (Vite)' },
      { porta: 5432, servico: 'Postgres' },
    ],
  },
  {
    pasta: 'Mapa Khorvaire',
    area: 'ProjetosPessoais',
    titulo: 'Mapa Khorvaire',
    descricao: 'Subsistema geoespacial auditável de Khorvaire — rotas, distâncias, evidências.',
    stack: 'Postgres + PostGIS + pgRouting · SQL cru · PowerShell',
    entrada: 'README.md',
    plane: '711e5f9f-8990-4a20-95d5-f6ad6fc0a44d', // KHOR
    docs: {
      arquitetura: ['docs/integration-with-lore-engine.md'],
      dataFlow: ['docs/roadmap.md'],
    },
    portas: [{ porta: 54329, servico: 'Postgres' }],
  },
  {
    pasta: 'DiscordTranscriber',
    area: 'ProjetosPessoais',
    titulo: 'Discord Transcriber',
    descricao: 'Bot que grava e transcreve canais de voz; modo campanha alimenta o Lore Engine.',
    stack: 'pnpm · TypeScript · LLM local',
    entrada: 'docs/00_PLANO.md',
    plane: 'e42d6a02-763e-46aa-9ffb-a21a96fba72c', // DISC
    docs: { arquitetura: ['docs/02_PLANO_EXECUCAO_ONDAS.md'] },
    portas: [{ porta: 11434, servico: 'Ollama' }],
  },
  {
    pasta: 'ProjetoConversaComDeus',
    area: 'ProjetosPessoais',
    titulo: 'Conversa com Deus',
    descricao: 'Escrita assistida de livro de diálogos filosóficos — 6 personagens IA, canonização com aprovação humana.',
    stack: 'Python/FastAPI · SQLite · Next.js · Anthropic',
    entrada: 'filosofia/CLAUDE.md',
    subRepo: 'filosofia',
    plane: '73ad9bad-e37e-4cf0-93ec-eeb9bcaa876b', // FILO
    portas: [
      { porta: 8000, servico: 'API (FastAPI)' },
      { porta: 3000, servico: 'Web (Next)' },
    ],
  },
  {
    pasta: 'Corre do Tarado',
    area: 'ProjetosPessoais',
    titulo: 'Corre do Tarado',
    descricao: 'Remake web do mapa de Warcraft 3 — perseguição single e multiplayer para 12.',
    stack: 'JS vanilla + canvas · Node + ws',
    entrada: 'jogo-web/README.md',
    plane: '41edb1df-46a9-461e-b2cb-c1888fa4cf86', // CORRE
    producao: 'https://tarado.astargne.com',
    portas: [{ porta: 8323, servico: 'Servidor' }],
  },
  {
    pasta: 'alexa youtube',
    area: 'ProjetosPessoais',
    titulo: 'Alexa YouTube Music',
    descricao: 'Skill Alexa que toca a conta pessoal do YouTube Music; Lambda + proxy de áudio em casa.',
    stack: 'Node CommonJS · AWS Lambda + DynamoDB · Docker',
    entrada: 'README.md',
    plane: '230d23ce-86b5-4601-a6e2-127e52df34e6', // ALEXA
    portas: [{ porta: 3000, servico: 'Proxy de áudio' }],
  },
  {
    pasta: 'PlayerForM3UList',
    area: 'ProjetosPessoais',
    titulo: 'Player M3U/IPTV',
    descricao: 'Player de listas M3U — PWA, TV Samsung Tizen e iOS futuro.',
    stack: 'React 19 + Vite · hls.js · Capacitor',
    entrada: 'README.md',
    plane: 'bbcd79e6-ff42-4a2e-8d9d-72011021e664', // PLAYER
    portas: [
      { porta: 5173, servico: 'Dev (Vite)' },
      { porta: 5433, servico: 'Postgres (pfml-local-pg)' },
    ],
  },
  {
    pasta: 'RagPTdoZero',
    area: 'ProjetosPessoais',
    titulo: 'Ragnarok pré-renewal',
    descricao: 'Servidor privado de Ragnarok Online (rAthena pré-renewal) empacotado em Docker.',
    stack: 'rAthena (C/C++) · Docker · MariaDB 11',
    entrada: 'README.md',
    plane: '5205fdb7-e1ff-4c96-961c-e222129db96b', // RAG
    portas: [
      { porta: 6900, servico: 'login-server' },
      { porta: 6121, servico: 'char-server' },
      { porta: 5121, servico: 'map-server' },
      { porta: 3306, servico: 'MariaDB' },
    ],
  },
  {
    // O próprio painel: entrou no catálogo em 16/08/2026, na adoção do padrão
    // de backlog — sem entrada aqui, o backlog dele ficaria invisível para a aba.
    pasta: 'painel-admin',
    area: 'ProjetosPessoais',
    titulo: 'Painel Admin + C-3PO',
    descricao: 'Este hub administrativo local — git, portas, sondas de produção e o C-3PO a bordo.',
    stack: 'Node + Claude Agent SDK · vanilla + Web Speech/ElevenLabs',
    entrada: 'CLAUDE.md',
    plane: 'c24e3d36-2e2a-4760-a3f3-53998297a245', // PAINEL
    portas: [{ porta: 7777, servico: 'Dashboard + C-3PO' }],
  },
  {
    // Nasceu em 12/09/2026 (PLANO-CADASTRO-UNICO.md) e no mesmo dia passou a
    // servir a raiz astargne.com (303 → /login) — a sonda "Caddy do host" em
    // PRODUCAO_EXTRA agora bate nele.
    pasta: 'CadastroUnico',
    area: 'ProjetosPessoais',
    titulo: 'Cadastro Único (SSO)',
    descricao: 'Login único do astargne.com — convite por e-mail, permissão por app, esqueci minha senha; serve a raiz do domínio.',
    stack: 'Node 22 · Express 5 · node:sqlite · scrypt · Brevo',
    entrada: 'AGENTS.md',
    plane: '2001df58-5cc1-44a1-8f77-035c04f5a02f', // CAD
    // Desde a Fase 2 (23/09/2026) são DOIS endereços: o loopback, por onde o
    // Caddy entra, e o gateway da rede `astargne_sso`, por onde o container do
    // filosofia valida sessão (ADR-0005 do CadastroUnico).
    portas: [{ porta: 8790, servico: 'Login/SSO (loopback + ponte astargne_sso)' }],
  },
  {
    pasta: 'CK3BannerLord',
    area: 'ProjetosPessoais',
    titulo: 'CK3 Bannerlord',
    descricao: 'Mod de Bannerlord em desenvolvimento; piloto do Orquestrador restrito a trabalho e testes offline, sem jogo.',
    stack: 'C# · .NET 8 · testes offline',
    entrada: 'AGENTS.md',
    plane: '7ce26c40-6e46-49a8-9a7d-bf06bbda6542', // CKBL
    portas: [],
  },
  {
    // EmuladorWeb e Anya entraram no catálogo em 29/09/2026, com a migração
    // dos backlogs para o rastreador — sem entrada aqui a aba não os mostraria.
    pasta: 'EmuladorWeb',
    area: 'ProjetosPessoais',
    titulo: 'Fliperama (EmuladorWeb)',
    descricao: 'Fliperama pessoal na web (EmulatorJS/WASM) atrás do cadastro único.',
    stack: 'HTML/JS estático · EmulatorJS self-hosted · Caddy',
    entrada: 'docs/00_PLANO.md',
    plane: '87dd03dc-ff75-4b86-b265-44740e0f112e', // EMU
    portas: [
      { porta: 8787, servico: 'Site estático (dev)' },
      { porta: 8788, servico: 'Serviço de upload (dev)' },
    ],
  },
  {
    // A pasta Anya/ não é repo: o código é o clone Anya/app (gadelhams/anya)
    // e o acervo o Anya/dados — por isso o `subRepo`.
    // SupervisorHandoff entrou no catálogo em 01/10/2026, com o projeto SUPER
    // no Plane (PLANO-SUPERVISOR-LOREENGINE.md).
    pasta: 'SupervisorHandoff',
    area: 'ProjetosPessoais',
    titulo: 'SupervisorHandoff',
    descricao: 'Supervisor determinístico que orquestra agentes: um faz, outro supervisiona; alvo novo é o LoreEngine do Felipe.',
    stack: 'Python 3.12 puro · codex exec + claude -p',
    entrada: 'AGENTS.md',
    plane: 'e2a3c301-7597-42f7-a2c1-9b4b4b3d3f29', // SUPER
    portas: [{ porta: 7791, servico: 'Painel do supervisor (plataforma)' }],
  },
  {
    pasta: 'Anya',
    area: 'ProjetosCompartilhados',
    subRepo: 'app',
    titulo: 'Anya 505DC',
    descricao: 'Sistema de apoio ao RPG autoral Anya 505DC — motor de regras determinístico, CLIs e web da mesa.',
    stack: 'Python 3.12 · uvicorn · TOML',
    entrada: 'CLAUDE.md',
    plane: '56104829-419b-4ad7-be84-2858f22c5617', // ANYA
    portas: [{ porta: 8600, servico: 'Web (uvicorn)' }],
  },
];
// O severino saiu do catálogo em 14/08/2026: foi fundido NESTE app (rota
// /severino/, mesma porta 7777) — deixou de existir como projeto irmão.

// Sondas de produção que não pertencem a um projeto específico.
// O `/saude` do cadastro único publica em quantos endereços ele DEVERIA estar
// escutando e em quantos está. O segundo endereço é a ponte `astargne_sso`, por
// onde o container do filosofia valida sessão (Fase 2, 23/09/2026): se ele cair,
// o central continua respondendo 200 na raiz, no player e no fliperama, e só o
// filosofia devolve 503 — verde por fora, quebrado por dentro. Esta conferência
// é o que torna a falha visível; sem ela, o listener secundário "não fatal" do
// central apenas troca uma falha barulhenta por uma muda.
export function conferirEscutaDoSSO(dado) {
  if (!dado || typeof dado !== 'object') return { ok: false, detalhe: 'resposta ilegível' };
  const escuta = dado.escuta;
  if (!escuta || typeof escuta.ligados !== 'number' || typeof escuta.esperados !== 'number') {
    // Release do central anterior à Fase 2: não sabe reportar escuta.
    return { ok: dado.ok === true, detalhe: 'release sem relatório de escuta' };
  }
  if (escuta.ligados < escuta.esperados) {
    return {
      ok: false,
      detalhe: `escutando em ${escuta.ligados} de ${escuta.esperados} endereços — o filosofia não valida sessão`,
    };
  }
  return { ok: dado.ok === true };
}

export const PRODUCAO_EXTRA = [
  { rotulo: 'Caddy do host (astargne.com)', url: 'https://astargne.com' },
  {
    // Desde a Fase 2 do cadastro único (23/09/2026) o central escuta em DOIS
    // endereços: o loopback (Caddy) e a ponte `astargne_sso` (container do
    // filosofia). Perder o segundo não muda nada no que esta sonda veria pelo
    // status — por isso ela lê o corpo, com a conferência logo acima.
    rotulo: 'Cadastro Único — escuta',
    url: 'https://astargne.com/saude',
    conferirCorpo: conferirEscutaDoSSO,
  },
];
