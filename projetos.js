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
    titulo: 'Mapa Khorvaire',
    descricao: 'Subsistema geoespacial auditável de Khorvaire — rotas, distâncias, evidências.',
    stack: 'Postgres + PostGIS + pgRouting · SQL cru · PowerShell',
    entrada: 'README.md',
    backlog: 'docs/BACKLOG.md',
    docs: {
      arquitetura: ['docs/integration-with-lore-engine.md'],
      dataFlow: ['docs/roadmap.md'],
    },
    portas: [{ porta: 54329, servico: 'Postgres' }],
  },
  {
    pasta: 'DiscordTranscriber',
    titulo: 'Discord Transcriber',
    descricao: 'Bot que grava e transcreve canais de voz; modo campanha alimenta o Lore Engine.',
    stack: 'pnpm · TypeScript · LLM local',
    entrada: 'docs/00_PLANO.md',
    backlog: 'docs/BACKLOG.md',
    docs: { arquitetura: ['docs/02_PLANO_EXECUCAO_ONDAS.md'] },
    portas: [{ porta: 11434, servico: 'Ollama' }],
  },
  {
    pasta: 'ProjetoConversaComDeus',
    titulo: 'Conversa com Deus',
    descricao: 'Escrita assistida de livro de diálogos filosóficos — 6 personagens IA, canonização com aprovação humana.',
    stack: 'Python/FastAPI · SQLite · Next.js · Anthropic',
    entrada: 'filosofia/CLAUDE.md',
    subRepo: 'filosofia',
    // Com o prefixo do sub-repo: lerBacklog junta RAIZ + pasta + backlog e
    // NÃO consulta `subRepo` — sem o `filosofia/` aqui, seria sem_arquivo.
    backlog: 'filosofia/docs/BACKLOG.md',
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
    backlog: 'docs/BACKLOG.md',
    producao: 'https://tarado.astargne.com',
    portas: [{ porta: 8323, servico: 'Servidor' }],
  },
  {
    pasta: 'alexa youtube',
    titulo: 'Alexa YouTube Music',
    descricao: 'Skill Alexa que toca a conta pessoal do YouTube Music; Lambda + proxy de áudio em casa.',
    stack: 'Node CommonJS · AWS Lambda + DynamoDB · Docker',
    entrada: 'README.md',
    backlog: 'docs/BACKLOG.md',
    portas: [{ porta: 3000, servico: 'Proxy de áudio' }],
  },
  {
    pasta: 'PlayerForM3UList',
    titulo: 'Player M3U/IPTV',
    descricao: 'Player de listas M3U — PWA, TV Samsung Tizen e iOS futuro.',
    stack: 'React 19 + Vite · hls.js · Capacitor',
    entrada: 'README.md',
    backlog: 'docs/BACKLOG.md',
    portas: [{ porta: 5173, servico: 'Dev (Vite)' }],
  },
  {
    pasta: 'RagPTdoZero',
    titulo: 'Ragnarok pré-renewal',
    descricao: 'Servidor privado de Ragnarok Online (rAthena pré-renewal) empacotado em Docker.',
    stack: 'rAthena (C/C++) · Docker · MariaDB 11',
    entrada: 'README.md',
    backlog: 'docs/BACKLOG.md',
    portas: [
      { porta: 6900, servico: 'login-server' },
      { porta: 6121, servico: 'char-server' },
      { porta: 5121, servico: 'map-server' },
      { porta: 3306, servico: 'MariaDB' },
    ],
  },
  {
    // O próprio painel: entrou no catálogo em 16/08/2026, na adoção do padrão
    // de backlog — sem entrada aqui, o campo `backlog` não teria onde morar e
    // o docs/BACKLOG.md ficaria invisível para a aba.
    pasta: 'painel-admin',
    titulo: 'Painel Admin + C-3PO',
    descricao: 'Este hub administrativo local — git, portas, sondas de produção e o C-3PO a bordo.',
    stack: 'Node + Claude Agent SDK · vanilla + Web Speech/ElevenLabs',
    entrada: 'CLAUDE.md',
    backlog: 'docs/BACKLOG.md',
    portas: [{ porta: 7777, servico: 'Dashboard + C-3PO' }],
  },
  {
    // Nasceu em 12/09/2026 (PLANO-CADASTRO-UNICO.md) e no mesmo dia passou a
    // servir a raiz astargne.com (303 → /login) — a sonda "Caddy do host" em
    // PRODUCAO_EXTRA agora bate nele.
    pasta: 'CadastroUnico',
    titulo: 'Cadastro Único (SSO)',
    descricao: 'Login único do astargne.com — convite por e-mail, permissão por app, esqueci minha senha; serve a raiz do domínio.',
    stack: 'Node 22 · Express 5 · node:sqlite · scrypt · Brevo',
    entrada: 'AGENTS.md',
    // Desde a Fase 2 (23/09/2026) são DOIS endereços: o loopback, por onde o
    // Caddy entra, e o gateway da rede `astargne_sso`, por onde o container do
    // filosofia valida sessão (ADR-0005 do CadastroUnico).
    portas: [{ porta: 8790, servico: 'Login/SSO (loopback + ponte astargne_sso)' }],
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
