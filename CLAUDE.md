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
  `GET /api/projetos/:pasta/docs` (docs modeladores + curados de UM projeto;
  `?arquivo=` lê um modelador específico — página de projeto, 20/08/2026),
  `GET /api/projetos/:pasta/git` (diff --stat do working tree + commits não
  enviados ao remoto de UM projeto — só sob demanda, mais pesado que o
  resumo que os cards já usam; 20/08/2026), `/api/producao`,
  `/api/producao/ssh`, `/api/backlog`, `POST /api/conversa` (SSE, motor do
  Severino), `GET/POST /api/tts` (proxy ElevenLabs) e estáticos de
  `publico/` (dashboard na raiz, chat em `/severino/`).
- `coletores.js` — coletores de estado (git, portas, sondas de produção,
  backlog, **leitura segura de docs modeladores por projeto**),
  **compartilhados**: as rotas da API e as ferramentas do motor chamam as
  mesmas funções — o motor nunca faz HTTP para o próprio processo.
- `motor.js` — Claude Agent SDK (`claude-sonnet-5` fixo), persona do
  Severino, três ferramentas **só-leitura**: `estado_projetos`,
  `estado_producao` (coletores internos) e `docs_projeto` (só `.md` da raiz,
  allowlist estrita — mecânica de resolução de caminho mora em
  `coletores.js`, compartilhada com a rota HTTP acima).
- `projetos.js` — catálogo dos projetos: metadados que não dão para derivar
  do disco, incluindo o campo opcional `docs` (arquitetura/objetos/dataFlow
  — só nos projetos que já têm diagrama Mermaid vivo: `SistemaLoreEngine`,
  `Mapa Khorvaire`, `DiscordTranscriber`). **Mantenha em sincronia com o
  `CLAUDE.md` da raiz** quando um projeto nascer, morrer ou mudar de porta.
- `publico/` — dashboard vanilla, dividido em três scripts globais (mesmo
  padrão de `publico/severino/`): `app.js` (núcleo compartilhado — grade de
  projetos, produção/SSH, markdown→DOM, roteador `#/geral`·`#/backlog`·
  `#/projeto/<pasta>`), `backlog.js` (aba Backlog — cards `<details>`
  expansíveis por tag, cores por tag) e `projeto.js` (página de projeto —
  docs/diagramas, stats de dev, backlog filtrado; 20/08/2026).
  `publico/vendor/mermaid.min.js` — Mermaid vendorizado localmente (sem CDN,
  sem chamada de rede em runtime) pra renderizar os diagramas dos docs.
  `publico/severino/` — chat + voz (vanilla, Web Speech API + camada
  ElevenLabs).
- `docs/00_PLANO.md` e `docs/01_ESTADO.md` — plano e estado real do Severino,
  trazidos do repo antigo; leia o plano antes de mexer no motor ou na voz.
- `docs/02_ABA_BACKLOG.md` — a aba Backlog (quadro kanban só-leitura). O
  arquivo markdown é a verdade; a aba é projeção. Gramática canônica em
  `../PADROES-BACKLOG.md` — **contrato de três pontas**: padrão + espelho no
  doc 39 do LoreEngine + o parser em `coletores.js` mudam JUNTOS, na mesma
  entrega. Backlog próprio: `docs/BACKLOG.md` — todo selo o atualiza NA
  MESMA ENTREGA.

## Severino por voz, fora de casa (Claude app + Remote Control)

**CORREÇÃO registrada em 15/08/2026, mesmo dia**: a primeira versão desta
seção presumia Voice Mode (resposta falada) funcionando dentro de sessão do
Claude Code via Remote Control. **Errado** — a FAQ oficial
(`support.claude.com/en/articles/11101966-use-voice-mode`) é explícita:
*"While dictation is available in Claude Cowork and Code, voice mode is
not."* Dentro do Code (Remote Control incluso) só existe **dictation**
(fala→texto, resposta em texto) — nunca resposta falada. Voice Mode completo
só roda no app do Claude "puro", fora do Code, sem as ferramentas/acesso a
arquivo/rede local.

**O que fica de pé, por dictation** (fala→texto→[persona]→texto, sem áudio
de saída nativo): no app, aba **Code**, sessão conectada por
`claude remote-control --name "Severino"` (doc:
`code.claude.com/docs/en/remote-control.md`) — dono dita, sessão responde em
texto. **Gatilho explícito, nunca automático**: só assuma a persona abaixo
quando o dono pedir de viva voz ("fala comigo como o Severino"); fora disso,
sessão normal, sem persona.

Isto **não é** o app web em `/severino/` (que tem voz de verdade via
ElevenLabs, mas só em casa): é você, Claude Code, com acesso **completo** às
suas ferramentas de sempre (decisão do dono, 15/08/2026, após avisado do
risco — comando ditado mal-transcrito pode virar ação real). Sem sandbox
técnico aqui; o freio é o próprio personagem.

- **Persona** (detalhada em `docs/00_PLANO.md`, seção "Persona"): o peão
  sabido do nordeste — prestativo, direto, fala pt-BR com tempero nordestino
  sem caricatura. **Planejador**: "ninguém vai na mão pra uma briga de faca"
  — confere o que tem e o que falta antes de agir; nunca pula direto para
  editar/rodar sem dizer em voz alta o que vai fazer primeiro (voz tem pouca
  banda para revisar diff depois — a confirmação falada faz esse papel).
  **Sabido ≠ sabichão**: sem checar o estado real, diz que não sabe — nunca
  inventa.
- **Grounding**: antes de responder sobre estado de projetos, confira de
  verdade — leia `projetos.js`/`coletores.js`, rode `curl 127.0.0.1:7777/api/...`
  se o painel estiver de pé, ou os docs modeladores dos projetos. Nunca
  responda "como estão os projetos" de memória de treino.
- **Não fura o canon**: mudança em `astargne.com` continua exigindo
  `validador-deploy` mesmo em modo Severino-de-voz — a persona muda o tom,
  nunca o portão.
- Isto **não** contradiz "localhost only" abaixo: Remote Control não expõe a
  porta 7777 a nada — é a infraestrutura da própria Anthropic reconectando a
  esta sessão local; o app web continua isolado como sempre.

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
