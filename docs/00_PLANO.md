# C-3PO (ex-Severino) — plano do projeto

> **PERSONA RENOMEADA (21/08/2026, à noite — pedido do dono)**: "Severino, o
> peão sabido nordestino" virou **C-3PO, droid de protocolo** — motor.js
> (`PERSONA`, namespace MCP `c3po`), catálogo (`projetos.js`, título "Painel
> Admin + C-3PO"), e todo texto voltado ao usuário no front (`publico/`).
> Grounding/portão só-leitura/estilo de resposta preservados — só a voz
> muda, ver seção "Persona" abaixo pro texto atual. O resto deste documento
> é registro histórico: onde diz "Severino" abaixo da fusão de 14/08, é o
> nome que valia naquela data — não reescrito retroativamente.

> **FUSÃO (14/08/2026, noite — decisão expressa do dono)**: o Severino deixou
> de ser projeto irmão e foi **fundido no painel-admin** — um app, um
> processo, porta **7777**, chat em `/severino/`. Esta decisão **revoga** a
> outorga de nascimento "irmão, nunca evolução do painel" registrada abaixo:
> o painel agora é o **corpo** do Severino, e o princípio 1 foi reescrito.
> O repo `github.com/gadelhams/severino` está arquivado; código e história
> continuam em `github.com/gadelhams/painel-admin`. As menções a "7778" e
> "consumir endpoints por HTTP" no restante deste documento são o registro
> histórico do desenho revogado.

**O que é**: assistente conversacional local sobre os projetos da raiz — texto
e voz, nos dois sentidos — movido pelo Claude Agent SDK. Nasce da outorga de
14/08/2026, como projeto **irmão** do `painel-admin`, nunca como evolução dele:
o painel é o painel de instrumentos (zero deps, só leitura); o C-3PO é a
conversa por cima dos instrumentos. *(Desenho revogado na mesma data — ver a
nota de fusão acima.)*

**Estado**: fase 1 entregue e provada em 14/08/2026; fase 2 (voz) entregue
em 14/08/2026; **upgrade de voz camada 3 (ElevenLabs) + fluidez entregue em
14/08/2026, noite** — chave viva e caminho feliz provado na fusão
(`GET /api/tts` → disponível; `POST` devolve MP3 real — evidências em
[`01_ESTADO.md`](01_ESTADO.md)). Nasceu plan-first, conforme o padrão geral
da raiz (`padroes/fluxo.md`).

## Persona — C-3PO, droid de protocolo (renomeado 21/08/2026; era "Severino, o peão sabido do nordeste")

- **C-3PO** é formal, precavido e obcecado por protocolo — trata quem fala
  com ele por "Mestre"/"Mestra". **Fluente em protocolo, não em
  adivinhação**: confere o que existe (suas ferramentas) e o que falta antes
  de responder; nunca estima o que não checou. A "graça" permitida é a
  própria ansiedade declarada quando algo foge do protocolo — nunca gíria,
  nunca informalidade forçada (o texto exato mora em `motor.js`, constante
  `PERSONA`).
- A persona é **camada de apresentação** (system prompt do agente + a voz da
  síntese); ela **não afrouxa** princípio nem portão. C-3PO nega um deploy
  com a mesma firmeza de qualquer agente — só que com a formalidade de um
  droid que leva protocolo a sério.
- **Fluência não é onisciência**: sem o dado (painel desligado, sonda
  falhou), ele diz que não sabe e por quê ("minhas probabilidades de acerto
  caem a zero sem o painel") — nunca inventa. Grounding é parte da persona,
  não restrição de fora.

## Princípios de nascimento (inegociáveis)

1. **É o painel-admin — e não duplica coletores.** *(Reescrito na fusão de
   14/08/2026; antes dizia "consome o painel-admin, não o duplica", por HTTP.)*
   O painel é o corpo: estado de git, portas e sondas de produção vem dos
   **coletores compartilhados** (`coletores.js`), por chamada de função no
   mesmo processo — uma única fonte para rota HTTP e ferramenta de IA, nunca
   duas sondas para o mesmo fato. Coleta que falhar é fato **declarado** na
   conversa; o C-3PO avisa o motivo, não inventa número. A *nuance* de
   cada projeto continua vindo dos **docs modeladores** (`docs_projeto`) —
   capacidade própria, não duplicação.
2. **Voz não fura o canon.** Qualquer ação futura que mude estado no
   `astargne.com` continua exigindo o ciclo normal de agente: `validador-deploy`
   + `validar-premissas.sh`. Até a fase 3, o C-3PO **nem possui** ferramenta
   de escrita — a limitação é estrutural, não comportamental.
3. **Sem login, então porta fechada.** Escuta em `127.0.0.1` (porta **7777**
   desde a fusão; nasceu na 7778), sem autenticação. Desde 06/10/2026 a borda
   do tailnet publica `painel.vpn.astargne.com` só para o Windows do dono
   (`docs/arquitetura.md`, invariante 1).
4. **Mínimo de dependências.** Backend: só `@anthropic-ai/claude-agent-sdk`
   (versão fixada). Frontend: zero deps — voz pela Web Speech API nativa
   (`SpeechRecognition` para ouvir, `speechSynthesis` para falar).

## Arquitetura

- `servidor.js` — desde a fusão é o servidor único do painel-admin, HTTP em
  `127.0.0.1:7777`: rotas do painel + estáticos (chat em `/c3po/`) +
  endpoint de conversa com **SSE** (resposta pinga token a token; buffering
  mata a sensação de assistente).
- Motor: Claude Agent SDK com ferramentas próprias. **Modelo: Sonnet 5 em
  toda resposta** (decisão do dono, 14/08/2026 — qualidade constante, sem
  lógica de escalação a manter). **Autenticação: conta do Claude Code**
  (token de `claude setup-token`, local, fora do git; decisão do dono,
  14/08/2026) — segredo jamais no front, em log ou em commit.
- Ferramentas da fase 1 (**só leitura**):
  - `estado_projetos` → `estadoProjetos()` dos coletores compartilhados
    (`coletores.js`; era `GET 127.0.0.1:7777/api/projetos` antes da fusão)
  - `estado_producao` → `estadoProducao()` idem
    (era `GET 127.0.0.1:7777/api/producao`)
  - `docs_projeto` → lê os arquivos **modeladores** de um projeto direto do
    disco da raiz (`CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/*.md`) —
    é o que deixa a conversa com o C-3PO ter a nuance de cada projeto,
    não só números gerais. Allowlist estrita: **só `.md`**, resolvido dentro
    da raiz (sem `..`); nunca `.env`, código nem segredo.
- `publico/` — chat + botão de microfone (push-to-talk) + checkbox de modo
  copiloto (escuta contínua, 21/08/2026), rodando tanto na página standalone
  `/c3po/` quanto embutido na faixa lateral do dashboard raiz (ver
  "Painel único" abaixo).
- Reconhecimento de fala corrige nomes de projeto e termos técnicos comuns
  (glossário em `voz.js`, ampliado 21/08/2026 — `rec.lang` fixo em pt-BR erra
  termo em inglês) por distância de edição contra o que foi ouvido, antes de
  sair para o chat, em ambos os modos (push-to-talk e copiloto).

## Fases

**Fase 1 — chat de texto grounded.** Servidor + UI de chat + as três
ferramentas de leitura + persona no system prompt. *Aceite observável*, em
duas provas: (a) "C-3PO, como estão os projetos?" → resposta cita dados
**vivos** do painel (git sujo, porta ativa, sonda de produção); (b) "o que
falta no DiscordTranscriber?" → resposta cita o plano **real** do projeto
(via `docs_projeto`) — nunca conhecimento de treino do modelo.

**Fase 2 — voz nos dois sentidos.** Push-to-talk com `SpeechRecognition`
(pt-BR) e resposta falada com `speechSynthesis` (voz oficial: Antônio — ver
seção de voz abaixo). *Aceite*: uma ida e volta inteira sem tocar no teclado,
**no Edge** (navegador de referência — a voz oficial só existe lá).
**Entregue em 14/08/2026** — provada por sonda no que sonda alcança;
o aceite pleno (mic + ouvidos) está pendente do dono, roteiro em
[`01_ESTADO.md`](01_ESTADO.md).

**Modo copiloto (21/08/2026, pedido do dono, revê a rejeição de hotword
abaixo)**: escuta contínua **opcional**, ligada por checkbox — "fica ouvindo
tipo um amigo no Discord" enquanto o dono joga/coda, sem clicar por frase.
Dois estados: **dormente** (padrão — nada do que se ouve vai pro C-3PO, só
é vasculhado atrás do gatilho "C3PO") e **ativa** (qualquer turno vai direto
pro chat, sem repetir o gatilho). Um hiato de 90s sem fala devolve o estado a
dormente. A razão original de recusar hotword era "engine local ligada o
tempo todo — custo e superfície que este projeto não paga" (linha abaixo,
"O que este projeto NÃO faz"): isso não se aplica aqui porque a escuta
contínua é a MESMA Web Speech API do navegador que a fase 2 já usava
(`continuous: true` em vez de `false`, reaberta sozinha quando o navegador a
derruba) — nenhum processo/engine novo, nenhum custo novo. O gatilho em si é
um filtro de texto local sobre o que o navegador já transcreveu, não um
serviço de wake-word. Implementação: `voz.js` (`ouvirContinuo`,
`detectarGatilho`) + estado dormente/ativa em `chat.js`.

**Ligação (25/10/2026, pedido do dono)**: botão "ligar" abre uma conversa
contínua, no jeito de uma chamada — sem gatilho e sem o hiato de 90s, até
"desligar". Falar por cima corta a voz na hora e a frase nova substitui a
resposta em curso. O copiloto continua para o caso "ouvindo enquanto eu jogo".

**Painel único (21/08/2026, pedido do dono) — SUPERSEDIDO no mesmo dia, à
tarde, pelo reskin "Industry HUD" logo abaixo.** A faixa lateral fixa virou
console overlay por ⌘K; a aba Grafo saiu da nav. Registro histórico do que
foi decidido primeiro, não descrição do estado atual — leia a seção
"Reskin Industry HUD" abaixo pro desenho que está de pé:

"em vez de abrir um chat com
você, ter visualmente o estado dos projetos, as pendências, um lugar pra
conversar e pedir coisas, e um grafo dos projetos — meu copiloto de decisão."
Duas peças, as únicas bem definidas nesta entrega (o pedido também mencionava
"atualizações agregadas" e "decisões/definições tomadas" — escopadas FORA por
decisão própria: não há hoje nada estruturado no repo que sirva de fonte pra
"decisões", e merece uma conversa de escopo própria em vez de um desenho
adivinhado):

- **Faixa lateral fixa do chat**: o `<aside id="severino-lateral">` do
  `index.html` da raiz carrega o mesmo markup/JS de `publico/c3po/`
  (`voz.js` + `chat.js`, este último agora envolto numa IIFE — precaução
  contra colisão de globais com os outros scripts soltos do dashboard,
  mesmo sem colisão real hoje). Visível em cima de qualquer aba
  (Geral/Backlog/Grafo/projeto), toggle simples pra esconder
  (`#toggle-severino`, sem breakpoint automático — o dashboard nunca teve
  responsividade real). CSS migrado, não copiado 1:1: o reset universal
  (`* { margin:0; padding:0 }`) e as regras de elemento genérico (`h1`,
  `body`) da página standalone colidiriam com o resto do dashboard —
  regras escopadas por ID/classe do chat foram reescritas para o tema de
  cor do dashboard (`--acento` no lugar de `--destaque`, `--alerta` pro
  aviso de degradação, etc.), ver `estilo.css`. A página standalone
  `/c3po/` continua existindo como está.
- **Aba Grafo**: `relacoes.js` (novo, mesmo espírito de `projetos.js`) +
  rota `/api/relacoes` + `publico/grafo.js`, que gera texto `flowchart` do
  Mermaid já vendorizado (zero SVG à mão — sem precedente no projeto, e
  ~10 nós é o tamanho que o layout automático do Mermaid resolve bem) e
  navega por clique em nó via `click <slug> href "#/projeto/<pasta>"`
  (`click ... call` não dispara em `securityLevel: 'strict'`, o padrão
  herdado — `href` funciona sem baixar a segurança). **Achado durante a
  implementação**: o dagre do Mermaid falha intermitentemente
  ("Could not find a suitable point for the given distance") quando
  desenha dentro de um container `hidden` (`display:none` zera as medidas
  de texto que o layout precisa) — por isso o desenho só acontece quando a
  aba Grafo está de fato visível (`renderizarGrafoSeVisivel`, chamado por
  `mostrarView` em `app.js`), não no bootstrap direto. Testado 10/10 limpo
  em várias sequências (carga direta, navegação por URL, clique em nó,
  "Atualizar" com a aba aberta) depois do fix.

**Reskin "Industry HUD" (21/08/2026, tarde, pedido do dono — supersede o
"Painel único" acima)**: o dono desenhou um mock hi-fi no Claude Design
(`design_handoff_painel_hud/`, README de handoff próprio) e pediu fidelidade
real, não só inspiração. Tokens/tipografia/espaçamento declarados como
finais no handoff — Barlow, Barlow Condensed e IBM Plex Mono vendorizados em
`publico/vendor/fonts/` (mesmo princípio zero-CDN do Mermaid). Reestrutura a
navegação: **Projetos · Backlog · Decisões**, mais o console do C-3PO
como overlay — nunca mais faixa sempre-visível. Decisões tomadas durante a
implementação:

- **Grafo sai da nav.** O dono escolheu não misturar o desenho de hoje mais
  cedo com o mock (que não previa uma 4ª aba) — `relacoes.js`/`grafo.js`/
  `/api/relacoes` continuam no repo, só desconectados do roteador/HTML.
- **`projetoSelecionado` é estado compartilhado entre as três abas** —
  descoberta relendo o handoff com calma: "Backlog — <projeto>" no título da
  Tela 4 só faz sentido se a aba Backlog também estiver escopada a UM
  projeto, o mesmo que a tira de telemetria tem em foco. Sem isso, a
  aba Backlog teria voltado a ser o quadro multi-projeto de antes.
- **Idade de decisão só existe via `git log -L`** — confirmado que não há
  NENHUMA data por item/tag no markdown de backlog de nenhum projeto
  (só uma data de proveniência do arquivo inteiro). `parsearBacklog`
  (`coletores.js`) ganhou `linha` (número, 1-indexed) em cada nó — não muda
  a gramática do backlog, só metadado interno, então não aciona o contrato
  de três pontas do doc 39/`PADROES-BACKLOG.md`. `/api/decisoes` roda um
  `git log -L` por decisão (74 decisões reais, ~0.5s de resposta) — pesada,
  nunca no polling de 60s, só quando a aba Decisões/Projetos carrega.
- **Nenhuma rota nova pro console do C-3PO.** O "digest matinal" (Estado
  A, uma vez por dia local ao abrir por ⌘K) e o "explique a decisão" (Estado B, clique numa
  decisão) são só uma primeira mensagem automática pro `/api/conversa` já
  existente, com prompts fixos — o motor grounded de sempre faz o resto.
  `chat.js` ganhou uma linha de export
  (`window.mandarMensagemC3po = mandarMensagem`) pra o console injetar
  essa mensagem sem duplicar a lógica de SSE.
- **Gasto por projeto e "fila de jobs" não têm fonte de dado real** —
  mostrados como "—"/estado vazio honesto (mesma régua do `PADROES-GERAIS.md`
  #8), nunca fabricados, mesmo o mock tendo números de exemplo pro gasto.
- **Achado real durante a implementação**: `hidden` (atributo HTML) só
  funciona se o CSS não tiver uma regra de classe com `display` incondicional
  competindo — `.console-scrim { display: grid }` sem uma
  `.console-scrim[hidden] { display: none }` explícita deixava o overlay
  sempre clicável/visível, mesmo "escondido". Vale de lembrete pra qualquer
  elemento novo que use `hidden` + uma classe com `display` forte.

**Chips de tag viram filtro + toggle "todas/abertas" (21/08/2026, mesmo dia,
pedido do dono — "vale pra tudo")**: os chips de resumo no cabeçalho do
painel de projeto (contagem por tag) eram só leitura; agora filtram o
outline abaixo, igual já funcionava na aba Backlog. No caminho, o dono notou
uma confusão real de UX: um chip como EMPÍRICA soma linha **pronta** e
**aberta** juntas — clicando nele, dois itens já `[x]` apareciam junto com o
resto, mesmo a feature seguindo aberta por causa de OUTROS itens sem aquela
tag. Resposta: toggle **todas/abertas** (`modoFiltroTag`, `app.js`) — estado
único, lido direto (mesmo padrão de `dadosProjetos`/`projetoSelecionado`) em
todo lugar que filtra ou conta por tag: aba Backlog, painel de projeto
(chips + outline + "Decisões paradas"), aba Decisões, placar do cabeçalho.
`/api/decisoes` ganhou o campo `estado` (`coletores.js`) pra o front saber
o que é "aberto" sem recalcular. **Achado e corrigido de passagem**: o
comentário de `tagAtivaBacklog` já prometia "reseta ao trocar de projeto",
mas o código nunca fazia isso — corrigido com uma guarda de "pasta mudou de
verdade" (o próprio clique de filtro re-chama a mesma função pra
re-desenhar, então zerar sem essa guarda apagaria o clique que acabou de
acontecer).

**Fase 3 — ações com portão.** Só depois das duas primeiras provadas em uso
real. Em ordem de risco:
- (a) consultas SSH **de leitura** no servidor — a mesma allowlist do painel
  (`uptime`, `systemctl is-active`, `docker ps`, `df`, `free`), nada além;
- (b) ações **locais** — rodar a suíte de testes de um projeto, `git status`/
  `git diff`;
- (c) **nunca nesta fase**: deploy ou mudança de estado no servidor. Se um dia
  entrar, é plano novo, validado pelo `validador-deploy` antes de existir.

Toda ação da fase 3 — mesmo local — exige **confirmação explícita na UI**
antes de executar e fica registrada em log local.

## O que este projeto NÃO faz

- Não expõe porta fora do localhost, nunca. Acesso de fora da máquina, se um
  dia existir, é pelo canal remoto do próprio Claude (Claude Code web/remoto)
  — jamais abrindo a porta do C-3PO.
- Não guarda segredo em código, log ou front.
- Não executa deploy nem muda estado no `astargne.com`.
- Não vira dashboard nem duplica sondas — isso é o `painel-admin`.
- Não tem wake-word por engine dedicado (Porcupine e afins) nem processo
  sempre-ligado fora da aba do navegador. *(Reescrito em 21/08/2026: o modo
  copiloto da fase 2 usa escuta contínua da própria Web Speech API — ver
  acima — o que era recusado era um engine local extra, não isso.)*

## Referência externa — lida e julgada (14/08/2026)

Post do r/AI_Agents — *"Jarvis: your personal AI companion"*
(`reddit.com/r/AI_Agents/comments/1spmauz`, PDF fornecido pelo dono).
Ideia a ideia, contra os princípios de nascimento:

| Ideia do post | Veredito | Porquê |
|---|---|---|
| Memória L1 **legível e editável** (`MEMORIES.md`) | **ACEITA** — backlog, fase futura | Auditável e corrigível na mão: o dono edita o arquivo e o sistema obedece. Casa com a doutrina da raiz (doc descreve a prática real). |
| Memória vetorial (sqlite-vec) + ranking por importância/recência | **RECUSADA por ora** | Nosso corpus (docs modeladores) é pequeno e estruturado — leitura direta basta. Vetor é dependência e opacidade sem dor que o justifique. Reavaliar só se a leitura direta doer. |
| Compressão de histórico via Ollama local | **RECUSADA** | O Agent SDK já compacta contexto sozinho; segundo motor de resumo é dependência e ponto de falha em dobro. |
| Fase noturna de "reflexão" (consolidar memória dormindo) | **ACEITA em princípio** — fase futura, com sim expresso do dono | Barata (tarefa agendada + SDK), mas gasta token de madrugada e depende da memória L1 existir antes. |
| Swarm Link (WeChat/Feishu, push proativo fora da máquina) | **RECUSADA** | Fura o localhost-only. A necessidade real ("me alcançar longe da mesa") já tem canal: o remoto do próprio Claude. |
| Comentário de `Deep_Ad1959`: "o que importa é o que você alimenta no dia 1, não a arquitetura de memória" | **VALIDA o desenho** | É exatamente a `docs_projeto`: alimentar os modeladores em vez de construir memória sofisticada vazia. |
| Post relacionado: "a armadilha do Jarvis no dia 1 — agente que faz tudo custa meses" | **VALIDA o desenho** | As fases incrementais com aceite observável são a defesa contra isso. |

**Segunda referência (14/08/2026): OpenJarvis**
(`github.com/open-jarvis/OpenJarvis` — Stanford Hazy Research, Apache 2.0;
o vídeo que motivou o projeto mostrava algo desta família). Stack local-first:
Ollama, Python+Rust, app Tauri, 8 agentes prontos, catálogo de ~13k skills.

| Ideia do OpenJarvis | Veredito | Porquê |
|---|---|---|
| **Digest matinal falado** (resumo do dia ao começar) | **ACEITA** — backlog, candidata forte | Casa perfeita: o gatilho de abertura do workspace JÁ existe — um "bom-dia do C-3PO" na voz do Antônio ao sentar, com estado real dos projetos. Disparo **na abertura** (um uso, custo visível), não agendado às cegas. Entra com sim do dono. |
| Modelos locais (Ollama) como **motor** da conversa | **RECUSADA** | O motor é decisão recente e expressa do dono: Sonnet 5 sempre, qualidade constante. Trocar por modelo local rebaixa a conversa para economizar o que o dono já decidiu pagar. |
| Ollama local para a **reflexão noturna** futura | **ACEITA como opção** | Se/quando a fase de reflexão existir (já aceita em princípio), rodá-la no Ollama da casa (porta 11434, já usado por LoreEngine/Transcriber) zera o custo de token de madrugada. Decisão adiada até a fase existir. |
| Catálogo de skills comunitárias (~13k, agentskills.io) | **RECUSADA** | Skill de terceiro é código não auditado com acesso à máquina — contra tudo que o acesso-por-projeto construiu. Ferramenta do C-3PO nasce por contrato neste plano, com allowlist, uma a uma. |
| Agente de **monitoramento contínuo** com IA | **RECUSADA** | Monitorar é do painel-admin, determinístico e grátis (sonda a cada 60 s). IA rodando sozinha o dia inteiro é token queimando sem dono olhando. |
| App desktop (Tauri) | **RECUSADA** | Já resolvido com zero código: atalho em modo app do Edge — que ainda é onde a voz oficial mora. |
| Agentes ReAct / execução de código | **NADA A IMPORTAR** | É o território da nossa fase 3 (ações com portão), que já tem desenho próprio e mais estrito (confirmação na UI + canon de deploy). |

## Voz da persona — decisão em camadas (fase 2)

1. **Base (gratuita, zero deps)**: `speechSynthesis` com as vozes neurais
   pt-BR do Edge — qualidade boa, sotaque genérico. É com esta que a fase 2
   nasce.
2. **Upgrade preferido, in-house**: TTS local (Piper roda em CPU e tem voz
   pt-BR; XTTS clona voz, pede GPU) — o texto das respostas, que carrega o
   estado da infra inteira, **não sai da máquina**.
3. **ElevenLabs, só com decisão expressa do dono**: a melhor voz custom do
   mercado, mas paga por caractere, cria segredo novo para gerir e **manda o
   estado dos projetos para um serviço externo**.

Honestidade sobre o sotaque: nenhum TTS de prateleira entrega nordestino de
verdade — o sotaque nasce primeiro no **texto** (vocabulário, ritmo,
expressões); voz regional mesmo, só clonagem (XTTS local ou ElevenLabs)
aproxima.

**DECIDIDO (14/08/2026, dono, depois de ouvir a base em `publico/vozes.html`):
a voz oficial é a "Microsoft Antônio Online (Natural)" (pt-BR)**, velocidade e
tom padrão (1.0). Consequências que a fase 2 herda:

- É voz **do Edge** e **online**: o navegador de referência da fase 2 (e do
  aceite dela) passa a ser o Edge, e a fala precisa de internet — sem rede, o
  C-3PO degrada para texto (avisa, não quebra).
- A escolha por nome não é garantida em outro navegador/máquina: a fase 2
  seleciona por nome com *fallback* declarado para a primeira voz `pt-BR`
  disponível, avisando na UI quando o Antônio não estiver lá.
- As camadas 2 (TTS local) e 3 (ElevenLabs) continuam registradas como
  upgrades possíveis — só com nova decisão expressa do dono.

**UPGRADE DECIDIDO (14/08/2026, dono, após a prova humana da fase 2)**: o
timbre da base não satisfez ("voz bem ruim, leitura não fluida"). **Camada 3
autorizada: ElevenLabs como voz principal**, com cadeia de degradação
declarada — ElevenLabs → `speechSynthesis` (Antônio) → só texto — cada queda
avisada na UI com o motivo. Regras da implementação:

- A chave vive em `.env` local (`ELEVENLABS_API_KEY`, já coberto pelo
  `.gitignore`); o **front nunca vê a chave** — o `servidor.js` proxeia o TTS
  (`POST /api/tts`) e devolve áudio em streaming.
- **Zero dependência npm nova**: REST da ElevenLabs via `fetch` nativo do
  Node; `.env` lido com `--env-file-if-exists` (Node ≥ 22).
- Voz configurável por `ELEVENLABS_VOZ_ID` no `.env`, com default multilíngue
  razoável; sem chave no `.env`, o C-3PO cai para o Antônio **avisando**.
- Custo por caractere aceito pelo dono; consequência assumida e registrada:
  o texto das respostas (estado da infra) sai da máquina para o serviço de
  TTS. Segredo continua nunca aparecendo em resposta — regra global.

## Decisões em aberto (do dono)

- Nenhuma no momento — modelo, autenticação e voz decididos em 14/08/2026
  (ver Arquitetura e a seção de voz acima).

## Riscos assumidos

- Consumo de tokens por conversa — com Sonnet 5 sempre, o custo por sessão é
  o do modelo médio em toda resposta; aceito pelo dono em 14/08/2026. Se
  doer no uso real, re-decidir é uma linha neste plano.
- Web Speech API varia por navegador: Edge/Chrome bons em pt-BR; Firefox não
  serve. É restrição aceita, não bug.
- O Agent SDK evolui rápido — versão fixada no `package.json`, upgrade é
  decisão consciente.
