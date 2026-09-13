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
npm test    # node --test — suíte do módulo contas.js (ssh sempre falso, I5)
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
  `/api/producao/ssh`, `/api/backlog`, `/api/decisoes` (decisões derivadas
  do backlog + idade por `git log -L`, pesada — sob demanda, nunca no
  polling de 60s; aba Decisões, 21/08/2026), `/api/relacoes` (catálogo de
  `relacoes.js` — hoje fora da nav, ver abaixo), `POST /api/conversa` (SSE,
  motor do Severino), `GET/POST /api/tts` (proxy ElevenLabs), `/api/contas/*`
  (aba Contas — abaixo) e estáticos de `publico/` (dashboard na raiz, chat
  em `/severino/`).
- `contas.js` (13/09/2026, Fase 5 do `../PLANO-CADASTRO-UNICO.md`) —
  administração do **CadastroUnico** (login único do `astargne.com`). A API
  interna do central (`/interno/*`, `127.0.0.1:8790`) só existe no loopback
  **do servidor**, autenticada por `TOKEN_INTERNO` — e **o token nunca sai
  do servidor**: cada ação da aba vira UM `ssh` (`spawn`, sem shell no PC,
  chave `paroquia-vultr`, timeout 15 s) rodando um script fixo lá dentro que
  lê o token com `sudo`, grava um config do `curl` em `mktemp` sob
  `umask 077` (apagado por `trap … EXIT`), aborta com exit 97 se o token
  não veio (`test -s`), e chama o central com `curl --max-time 10 -sS`. O
  PC só vê `{ status, corpo }`. Tabela **fechada** de operações
  (`OPERACOES`: método + rota), `:id` validado como inteiro positivo antes
  de entrar na string, corpo JSON **só pelo stdin** (`curl -d @-`) — dado de
  usuário jamais entra na linha de comando. Falha de ssh/script vira
  `502 {erro:'sem acesso ao servidor'}`; **401 do central também é 502**
  (`… (token interno recusado)`): o bearer nasce no servidor, então 401 só
  significa encanamento quebrado, nunca "usuário sem permissão"; stderr vai
  ao log mesmo com exit 0, redigindo qualquer `Bearer …` por defesa em
  profundidade. Executor injetável (`{ executar }`) e binário injetável
  (`criarExecutorSsh({ binario, timeoutMs, maxSaida })`) —
  `test/contas.test.js` nunca chama ssh de verdade: o encanamento real
  (stdin/EOF/timeout/teto) é provado com `node -e` como binário falso.
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
- `relacoes.js` (21/08/2026) — relações estruturadas entre projetos (`de`,
  `para`, `tipo`, `rotulo`) + `NOS_EXTRA` para nós de infra fora do catálogo
  (hoje só `astargne.com`). Espelho estruturado da seção "Relações entre
  projetos" do `CLAUDE.md` da raiz — **mude os dois juntos**. Alimenta
  `/api/relacoes` e `publico/grafo.js` (aba Grafo) — **ambos fora da nav
  desde o reskin abaixo** (decisão do dono, código intacto no repo, fácil de
  religar como 4ª aba).
- `publico/` — dashboard vanilla, reskin **"Industry HUD"** desde 21/08/2026
  (mock hi-fi do dono em `design_handoff_painel_hud/`; tokens/tipografia
  declarados como finais no handoff — Barlow/Barlow Condensed/IBM Plex Mono
  vendorizados em `publico/vendor/fonts/`, mesmo princípio zero-CDN do
  Mermaid). Quatro abas — **Projetos · Backlog · Decisões · Contas** — mais
  o console do Severino como overlay por ⌘K/Ctrl+K:
  - `app.js` — núcleo compartilhado: roteador por hash
    (`#/projetos`·`#/backlog`·`#/decisoes`·`#/contas`·`#/projeto/<pasta>`), estado
    `projetoSelecionado` **compartilhado entre as abas Projetos e Backlog**
    (a mesma variável que a tira de telemetria, o outline do Backlog e a
    coluna de contexto do painel de projeto leem — `decisoes.js` e
    `contas.js` não a leem), tira de telemetria (9 células, uma
    por projeto do catálogo), tema claro/escuro (`data-tema` em `<html>`,
    persistido em `localStorage`), e o console do Severino (`#console-scrim`
    — abre por ⌘K/barra de comando/clique numa decisão, sempre reabre no
    digest).
  - `backlog.js` — as primitivas recursivas do backlog
    (`desenharNodo`/`placar`/`nosComTag`, independentes de layout) mais duas
    camadas de apresentação: `outlineFeatureDetalhes` (`<details>` por
    feature, usado no painel de projeto) e `desenharBacklogDoProjeto`
    (sempre expandido, grid de 2 colunas — a aba Backlog em si). As duas
    mostram o backlog de **um projeto por vez** (`projetoSelecionado`), não
    mais o quadro kanban multi-projeto de antes.
  - `projeto.js` — o painel do projeto focado (metade de baixo da aba
    Projetos): cabeçalho + outline do backlog na coluna principal;
    Arquitetura (moldura hachurada + Mermaid real nos 3 projetos que já têm
    diagrama, "sem diagrama ainda" nos outros) + Decisões paradas + Fila de
    jobs (**estado vazio honesto** — não existe sistema de jobs) + Produção
    (sondas + SSH sob demanda) na coluna de 420px. Também define
    `abrirConsoleComDecisao` (chamada por `app.js`/`decisoes.js`).
  - `decisoes.js` — aba Decisões: todas as decisões agrupadas por projeto
    (top 3 por contagem abertos, resto em "Outros N projetos" colapsado).
  - `contas.js` (13/09/2026) — aba Contas: usuários (nome, e-mail, ativo,
    apps como chips; ações permissões/desativar-reativar/redefinir senha),
    convites pendentes (reenviar/revogar) e o formulário Convidar (e-mail,
    nome opcional, checkboxes dos apps com `sso: true` vindos de
    `/api/contas/apps`). Depois de convidar mostra `enviado` e, se `false`,
    o `erro` e o `link` para mandar por outro canal. Desativar e revogar
    pedem `confirm()`. **Sem polling**: busca ao ENTRAR na aba (`rotear`
    detecta a troca de view por `viewAtual`) e após cada ação — o `rotear()`
    de 60 s passando pela mesma view não dispara ssh nenhum.
  - `grafo.js`/`relacoes.js` — fora da nav (ver acima), arquivos intactos.
  - `publico/vendor/mermaid.min.js` — Mermaid vendorizado, reaproveitado
    pelos diagramas dos docs e pela Arquitetura do painel de projeto.
  - **Console do Severino**: reaproveita `publico/severino/chat.js` (agora
    numa IIFE, expõe só `window.mandarMensagemSeverino`) e `voz.js`
    inteiros — só o container mudou (da faixa lateral fixa da manhã de
    21/08 pro overlay). Abrir por ⌘K manda um "digest" automático (prompt
    fixo pro `/api/conversa` já existente — **nenhuma rota nova pro
    digest**); clicar numa decisão manda o texto dela verbatim e pergunta o
    que trava/o que falta (persona só-leitura: explica e pergunta, nunca
    decide). A página standalone `/severino/` **continua existindo** como
    está (acesso alternativo, sem o chrome do dashboard) — os dois modos
    compartilham a mesma sessão de conversa (`sessionStorage`, por aba do
    navegador) e os mesmos endpoints.
  - Gasto por projeto e "fila de jobs" **não têm fonte de dado real** — o
    painel mostra "—"/estado vazio honesto em vez de inventar (mesma régua
    do `PADROES-GERAIS.md` #8); se um dia existir coleta de custo real, é o
    lugar de plugar.
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

- **Persona** (detalhada em `docs/00_PLANO.md`, seção "Persona"; renomeada
  de "Severino" pra **C-3PO** em 21/08/2026): droid de protocolo — formal,
  precavido, trata o dono por "Mestre". **Planejador**: confere o que tem e
  o que falta antes de agir; nunca pula direto para editar/rodar sem dizer
  em voz alta o que vai fazer primeiro (voz tem pouca banda para revisar
  diff depois — a confirmação falada faz esse papel). **Fluência não é
  onisciência**: sem checar o estado real, diz que não sabe — nunca inventa.
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
  automático. **Única exceção, delimitada** (13/09/2026, aba Contas): o
  `ssh` de `contas.js` muda estado — mas só o **banco do CadastroUnico**,
  só pelas rotas `/interno/*` do central, só pela tabela fechada
  `OPERACOES`. Nada de `systemctl`, deploy, arquivo ou Caddy por ali: infra
  continua sendo SSH manual + `validador-deploy`, seguindo
  `/opt/servidor/LEIA-ME.md`.
- **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** (decisão do
  dono, 13/09/2026): não entra em `.env` do painel, não é lido nem logado
  no PC, não aparece em resposta HTTP. O painel chega ao central **por
  ssh**, e o script remoto monta o cabeçalho lá dentro. Se um dia alguém
  propuser "copiar o token pro `.env` local pra simplificar", a resposta é
  não — é a arquitetura da fatia, não um detalhe.
- **Ferramentas de IA só-leitura até a fase 3** (`docs/00_PLANO.md`): o motor
  roda com `tools: []` + allowlist das três ferramentas MCP — limitação
  **estrutural**, não promessa de comportamento.
- **Voz não fura o canon de deploy**: qualquer ação futura que mude estado no
  `astargne.com` continua exigindo `validador-deploy` + validação de
  premissas, como para qualquer agente.
- **Segredo só no `.env`** (`ELEVENLABS_API_KEY`, coberto pelo `.gitignore`) —
  jamais em código, log, commit ou resposta HTTP.
