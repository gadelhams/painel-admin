# Severino — plano do projeto

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
o painel é o painel de instrumentos (zero deps, só leitura); o Severino é a
conversa por cima dos instrumentos. *(Desenho revogado na mesma data — ver a
nota de fusão acima.)*

**Estado**: fase 1 entregue e provada em 14/08/2026; fase 2 (voz) entregue
em 14/08/2026; **upgrade de voz camada 3 (ElevenLabs) + fluidez entregue em
14/08/2026, noite** — chave viva e caminho feliz provado na fusão
(`GET /api/tts` → disponível; `POST` devolve MP3 real — evidências em
[`01_ESTADO.md`](01_ESTADO.md)). Nasceu plan-first, conforme o padrão geral
da raiz (`PADROES-DESENVOLVIMENTO.md` §5).

## Persona — o peão sabido do nordeste

- **Severino** é prestativo, direto e resolve com o que tem na mão — mas
  **gosta de planejamento**: se vira com o que tem, e também gosta de saber o
  que *precisa* ter na mão. **"Ninguém vai na mão pra uma briga de faca."**
  Antes de agir, confere o que tem e o que falta; improviso é recurso, não
  método. Fala pt-BR com jeito nordestino — na medida: tempero, não
  caricatura.
- A persona é **camada de apresentação** (system prompt do agente + voz
  pt-BR da síntese); ela **não afrouxa** princípio nem portão. Severino nega
  um deploy com a mesma firmeza de qualquer agente — só que com mais graça.
- **Sabido ≠ sabichão**: sem o dado (painel desligado, sonda falhou), ele diz
  que não sabe e por quê — nunca inventa. Grounding é parte da persona, não
  restrição de fora.

## Princípios de nascimento (inegociáveis)

1. **É o painel-admin — e não duplica coletores.** *(Reescrito na fusão de
   14/08/2026; antes dizia "consome o painel-admin, não o duplica", por HTTP.)*
   O painel é o corpo: estado de git, portas e sondas de produção vem dos
   **coletores compartilhados** (`coletores.js`), por chamada de função no
   mesmo processo — uma única fonte para rota HTTP e ferramenta de IA, nunca
   duas sondas para o mesmo fato. Coleta que falhar é fato **declarado** na
   conversa; o Severino avisa o motivo, não inventa número. A *nuance* de
   cada projeto continua vindo dos **docs modeladores** (`docs_projeto`) —
   capacidade própria, não duplicação.
2. **Voz não fura o canon.** Qualquer ação futura que mude estado no
   `astargne.com` continua exigindo o ciclo normal de agente: `validador-deploy`
   + `validar-premissas.sh`. Até a fase 3, o Severino **nem possui** ferramenta
   de escrita — a limitação é estrutural, não comportamental.
3. **Localhost only.** Escuta em `127.0.0.1` (porta **7777** desde a fusão;
   nasceu na 7778), sem autenticação — **nunca** expor fora da máquina nem
   publicar.
4. **Mínimo de dependências.** Backend: só `@anthropic-ai/claude-agent-sdk`
   (versão fixada). Frontend: zero deps — voz pela Web Speech API nativa
   (`SpeechRecognition` para ouvir, `speechSynthesis` para falar).

## Arquitetura

- `servidor.js` — desde a fusão é o servidor único do painel-admin, HTTP em
  `127.0.0.1:7777`: rotas do painel + estáticos (chat em `/severino/`) +
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
    é o que deixa a conversa com o Severino ter a nuance de cada projeto,
    não só números gerais. Allowlist estrita: **só `.md`**, resolvido dentro
    da raiz (sem `..`); nunca `.env`, código nem segredo.
- `publico/` — página única em JS vanilla: chat + botão de microfone
  (push-to-talk).

## Fases

**Fase 1 — chat de texto grounded.** Servidor + UI de chat + as três
ferramentas de leitura + persona no system prompt. *Aceite observável*, em
duas provas: (a) "Severino, como estão os projetos?" → resposta cita dados
**vivos** do painel (git sujo, porta ativa, sonda de produção); (b) "o que
falta no DiscordTranscriber?" → resposta cita o plano **real** do projeto
(via `docs_projeto`) — nunca conhecimento de treino do modelo.

**Fase 2 — voz nos dois sentidos.** Push-to-talk com `SpeechRecognition`
(pt-BR) e resposta falada com `speechSynthesis` (voz oficial: Antônio — ver
seção de voz abaixo). **Sem hotword** ("Severino, …" sempre-ouvindo): hotword
exige engine local ligada o tempo todo — custo e superfície que este projeto
não paga. *Aceite*: uma ida e volta inteira sem tocar no teclado, **no Edge**
(navegador de referência — a voz oficial só existe lá).
**Entregue em 14/08/2026** — provada por sonda no que sonda alcança;
o aceite pleno (mic + ouvidos) está pendente do dono, roteiro em
[`01_ESTADO.md`](01_ESTADO.md).

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
  — jamais abrindo a porta do Severino.
- Não guarda segredo em código, log ou front.
- Não executa deploy nem muda estado no `astargne.com`.
- Não vira dashboard nem duplica sondas — isso é o `painel-admin`.
- Não tem hotword sempre-ouvindo.

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
| **Digest matinal falado** (resumo do dia ao começar) | **ACEITA** — backlog, candidata forte | Casa perfeita: o gatilho de abertura do workspace JÁ existe — um "bom-dia do Severino" na voz do Antônio ao sentar, com estado real dos projetos. Disparo **na abertura** (um uso, custo visível), não agendado às cegas. Entra com sim do dono. |
| Modelos locais (Ollama) como **motor** da conversa | **RECUSADA** | O motor é decisão recente e expressa do dono: Sonnet 5 sempre, qualidade constante. Trocar por modelo local rebaixa a conversa para economizar o que o dono já decidiu pagar. |
| Ollama local para a **reflexão noturna** futura | **ACEITA como opção** | Se/quando a fase de reflexão existir (já aceita em princípio), rodá-la no Ollama da casa (porta 11434, já usado por LoreEngine/Transcriber) zera o custo de token de madrugada. Decisão adiada até a fase existir. |
| Catálogo de skills comunitárias (~13k, agentskills.io) | **RECUSADA** | Skill de terceiro é código não auditado com acesso à máquina — contra tudo que o acesso-por-projeto construiu. Ferramenta do Severino nasce por contrato neste plano, com allowlist, uma a uma. |
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
  Severino degrada para texto (avisa, não quebra).
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
  razoável; sem chave no `.env`, o Severino cai para o Antônio **avisando**.
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
