# Backlog — a vista única do que está aberto

**Derivado em 16/08/2026** do [`00_PLANO.md`](00_PLANO.md), do
[`02_ABA_BACKLOG.md`](02_ABA_BACKLOG.md) e do [`01_ESTADO.md`](01_ESTADO.md), na
adoção do padrão da raiz. A gramática canônica mora em
[`../../PADROES-BACKLOG.md`](../../PADROES-BACKLOG.md) — este arquivo guarda só o
PLACAR; o porquê mora no doc apontado em cada linha. **Todo selo atualiza este
arquivo NA MESMA ENTREGA.** A fila do dono é o grep por **(DONO)**.

## F1 — Severino fase 3: ações com portão `[ ]`

Desenho no [`00_PLANO.md`](00_PLANO.md) §Fases (fase 3), em ordem de risco.

- `[ ]` **Épico: ações com portão** (00_PLANO §Fase 3) **(BLOQUEADA: só depois das
  fases 1–2 provadas em uso real — o aceite pleno da fase 2 segue pendente)**
  - `[ ]` Story: (a) consultas SSH **de leitura** no servidor — a mesma allowlist do
    painel (`uptime`, `systemctl is-active`, `docker ps`, `df`, `free`), nada além
  - `[ ]` Story: (b) ações **locais** — rodar a suíte de testes de um projeto,
    `git status`/`git diff`
  - `[ ]` Story: o portão em si — confirmação explícita na UI antes de executar +
    registro em log local, para TODA ação, mesmo local
- Deploy ou mudança de estado no servidor — nunca nesta fase; se um dia entrar, é
  plano novo validado pelo `validador-deploy` antes de existir (00_PLANO §Fase 3c)
  **(CONGELADA)**

## F2 — Voz do Severino: o backlog julgado `[ ]`

As referências externas foram julgadas ideia a ideia no [`00_PLANO.md`](00_PLANO.md)
(tabelas Jarvis e OpenJarvis); as lacunas declaradas moram no
[`01_ESTADO.md`](01_ESTADO.md).

- `[x]` **Épico: fases 1–2 + camada 3 (ElevenLabs) entregues** e provadas por sonda,
  chave viva desde a fusão (01_ESTADO)
- `[ ]` Task: **aceite pleno da fase 2** — uma ida e volta por voz sem tocar no
  teclado, no Edge; roteiro pronto no 01_ESTADO §prova pendente **(DONO)**
- `[ ]` Story: **digest matinal falado** na abertura do workspace — candidata forte,
  aceita no julgamento; entra com sim do dono (00_PLANO, tabela OpenJarvis) **(DONO)**
- `[ ]` Story: **memória L1 legível e editável** (`MEMORIES.md`) — aceita no
  julgamento: auditável e corrigível na mão (00_PLANO, tabela Jarvis)
- `[ ]` Story: **reflexão noturna** de consolidação de memória — aceita em princípio;
  depende da L1 existir antes, e só com sim expresso do dono (00_PLANO, tabela
  Jarvis) **(DONO)**
  - `[ ]` Task: rodá-la no Ollama local, zerando token de madrugada — opção aceita,
    decisão adiada até a fase existir (00_PLANO, tabela OpenJarvis)
- `[ ]` Task: **botão de mudo da síntese** — não pedido na fase 2; vira decisão se
  doer no uso real (01_ESTADO §o que NÃO existe) **(EMPÍRICA)**
- `[ ]` Story: **camada 2 — TTS local (Piper/XTTS)**, o upgrade preferido in-house
  (o texto das respostas não sai da máquina) — segue registrada como upgrade
  possível; só com nova decisão expressa do dono (00_PLANO §Voz da persona) **(DONO)**

## F3 — Aba Backlog: aceites e fase 2 `[ ]`

Spec e status no [`02_ABA_BACKLOG.md`](02_ABA_BACKLOG.md); a gramática que o parser
implementa é a do padrão da raiz (contrato de três pontas).

- `[x]` **Épico: fase 1 — quadro só-leitura** implementado e provado por sonda em
  16/08/2026 (02_ABA_BACKLOG, nota de status)
- `[ ]` Task: aceites de olho humano da fase 1 — itens 1–3 do aceite observável, na
  tela (02_ABA_BACKLOG §Aceite observável) **(DONO)**
- `[ ]` Story: **fase 2 — escrita no checkbox**: clicar no quadro edita a linha do
  markdown, no regime da fase 3 do Severino (confirmação na UI + log local); só se a
  fase 1 provar uso (02_ABA_BACKLOG §Fase 2) **(EMPÍRICA)**
- `[ ]` Decisão: a anotação "NOT TO DO" do doc 39 vira tag declarada? — conversa do
  dono, junto com qualquer revisão da PÓS-PLAYTEST (02_ABA_BACKLOG, nota de status)
  **(DONO)**
