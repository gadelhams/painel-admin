# painel-admin — o painel com o Severino a bordo

Hub administrativo **local** dos projetos da raiz — estado do git, portas
locais ativas, sondas HTTPS da produção no `astargne.com`, consulta SSH sob
demanda — **e o Severino**, o peão sabido: assistente conversacional (texto e
voz) por cima desses mesmos instrumentos. Um app, um processo, uma porta.

## A fusão (14/08/2026, noite — decisão do dono)

O Severino nasceu em 14/08/2026 como projeto **irmão** (`severino/`, porta
7778), consumindo os endpoints deste painel por HTTP. Na noite do mesmo dia o
dono **revogou** essa separação: dois processos e duas portas para uma
ferramenta pessoal única eram cerimônia sem benefício — e o motor fazia HTTP
para o vizinho para ler dado que é função local. Resultado: UM app na 7777.
O repo `github.com/gadelhams/severino` está **arquivado** como lápide; código
e história continuam aqui (`github.com/gadelhams/painel-admin`).

## Como roda

```powershell
npm start   # node --env-file-if-exists=.env servidor.js
# http://localhost:7777           → dashboard
# http://localhost:7777/severino/ → chat do Severino (texto e voz)
```

Node ≥ 22.9 (pelo `--env-file-if-exists`). **Uma dependência**:
`@anthropic-ai/claude-agent-sdk`, versão fixada sem `^` — o zero-deps
histórico do painel acabou com a fusão, e o motor do Severino é o único
motivo; upgrade da versão é decisão consciente, nunca automática. O `zod`
aparece em `node_modules` como peer do SDK — não é dependência nossa.

Sobe sozinho ao abrir o workspace da raiz no VS Code (gatilho `folderOpen`
em `.vscode/tasks.json` da raiz, idempotente por sonda de porta).

## Arquitetura

- `servidor.js` — HTTP único em `127.0.0.1:7777`: `/api/projetos`,
  `/api/producao`, `/api/producao/ssh`, `POST /api/conversa` (SSE, motor do
  Severino), `GET/POST /api/tts` (proxy ElevenLabs) e estáticos de `publico/`
  (dashboard na raiz, chat em `/severino/`).
- `coletores.js` — coletores de estado (git, portas, sondas de produção),
  **compartilhados**: as rotas da API e as ferramentas do motor chamam as
  mesmas funções — o motor nunca faz HTTP para o próprio processo.
- `motor.js` — Claude Agent SDK (`claude-sonnet-5` fixo), persona do
  Severino, três ferramentas **só-leitura**: `estado_projetos`,
  `estado_producao` (coletores internos) e `docs_projeto` (só `.md` da raiz,
  allowlist estrita).
- `projetos.js` — catálogo dos projetos: metadados que não dão para derivar
  do disco. **Mantenha em sincronia com o `CLAUDE.md` da raiz** quando um
  projeto nascer, morrer ou mudar de porta.
- `publico/` — dashboard vanilla; `publico/severino/` — chat + voz (vanilla,
  Web Speech API + camada ElevenLabs).
- `docs/00_PLANO.md` e `docs/01_ESTADO.md` — plano e estado real do Severino,
  trazidos do repo antigo; leia o plano antes de mexer no motor ou na voz.

## O que continua inegociável

- **Localhost only**: escuta em `127.0.0.1:7777`, sem autenticação — nunca
  expor fora da máquina nem publicar em porta aberta.
- **SSH só-leitura** (`/api/producao/ssh`): apenas `uptime`,
  `systemctl is-active`, `docker ps`, `df`, `free`, com a chave
  `~/.ssh/paroquia-vultr`, só sob demanda (botão) — nunca no refresh
  automático. Comando que muda estado no servidor está fora do escopo:
  ação administrativa de verdade é SSH manual, seguindo
  `/opt/servidor/LEIA-ME.md`.
- **Ferramentas de IA só-leitura até a fase 3** (`docs/00_PLANO.md`): o motor
  roda com `tools: []` + allowlist das três ferramentas MCP — limitação
  **estrutural**, não promessa de comportamento.
- **Voz não fura o canon de deploy**: qualquer ação futura que mude estado no
  `astargne.com` continua exigindo `validador-deploy` + validação de
  premissas, como para qualquer agente.
- **Segredo só no `.env`** (`ELEVENLABS_API_KEY`, coberto pelo `.gitignore`) —
  jamais em código, log, commit ou resposta HTTP.
