# painel-admin — arquitetura (texto de referência)

Texto preservado do `CLAUDE.md` até 01/10/2026 (F3 do
`../../../historico/PLANO-CONTEXTO-POR-TAREFA.md`), reorganizado em um título por
arquivo. **Estado atual mora em [`current.md`](current.md)**; regras numeradas
em [`invariants.md`](invariants.md); como roda e a voz fora de casa em
[`operacao.md`](operacao.md); o original íntegro em
[`historico/CLAUDE-ate-2026-10-01.md`](historico/CLAUDE-ate-2026-10-01.md).

**O que neste texto já não vale (adjudicação de 01/10/2026):**

- Os caminhos em crase deste texto são **relativos à raiz do projeto**
  (`painel-admin/`), não a `docs/`: `docs/00_PLANO.md`, `../CLAUDE.md`,
  `../../PORTAS.md` etc. foram escritos quando o texto morava em `CLAUDE.md`.
- "fácil de religar como 4ª aba" (grafo): seria a **5ª** — há quatro abas desde
  13/09/2026 (Contas).
- "A aba Backlog (quadro kanban só-leitura)": não é mais quadro multi-projeto
  desde 21/08/2026; mostra um projeto por vez (`backlog.js` em [`arquitetura/publico.md`](arquitetura/publico.md)).

- "uma célula por projeto do catálogo — 13 desde 29/09/2026": o catálogo tem
  **15** projetos desde 12/10/2026 (`SupervisorHandoff` e `CK3BannerLord`
  entraram, ambos com projeto no Plane) — ver `current.md`.
- "`docs/00_PLANO.md` e `docs/01_ESTADO.md` — plano e estado real": o
  `01_ESTADO.md` virou ponteiro; o estado está em `current.md` e o datado de
  13/09/2026 em `historico/01_ESTADO-ate-2026-10-01.md`.
- "mock hi-fi do dono em `design_handoff_painel_hud/`": a pasta não existe
  nesta máquina nem no git do projeto (narrativa datada do reskin de 21/08/2026).
- "de 29 a 30/09 foi `linear.js`, com o Linear": narrativa datada, verdadeira
  como história; o Linear não é mais fonte de nada aqui.
- Os módulos `orquestracao.js`, `orquestracao-core.js` e `publico/orquestracao.js`
  (primeira fatia, 11/10/2026) foram **removidos em 24/10/2026**: eram cópias
  divergentes de `orquestrador/politica.js`/`estado.js` que nenhum código vivo
  importava; o doc da fatia está em `historico/orquestracao-fatia1-ate-2026-10-20.md`.
- Tag `(DONO)`: desde 01/10/2026 o parser do doc 39 mapeia `DONO` para
  `ASTARGNE` (mudança em `coletores.js`, não commitada); o texto abaixo não a
  cita, mas o `PADROES-BACKLOG.md` sim.

## Arquitetura

Uma rota por arquivo; a tabela do `AGENTS.md` aponta direto para eles.

- [`arquitetura/servidor.md`](arquitetura/servidor.md) — montagem, `http/` e a lista de rotas
- [`arquitetura/portoes-do-codigo.md`](arquitetura/portoes-do-codigo.md) — o portão sem linter: mapa, fronteiras de módulos
- [`arquitetura/orquestrador.md`](arquitetura/orquestrador.md) — os módulos do orquestrador e a frota (F2)
- [`arquitetura/orquestrador-play-zelador.md`](arquitetura/orquestrador-play-zelador.md) — play por nave, agendador, job, escrita e diário do zelador (F3)
- [`arquitetura/orquestrador-puxar.md`](arquitetura/orquestrador-puxar.md) — uma tentativa por vez, recibo, identidades, reserva, sandbox, gate do zelador, despacho do Hangar
- [`arquitetura/contas.md`](arquitetura/contas.md) — aba Contas no servidor (CadastroUnico por ssh)
- [`arquitetura/chaves.md`](arquitetura/chaves.md) — aba Chaves
- [`arquitetura/alinhamento.md`](arquitetura/alinhamento.md) — rotina de alinhamento e aba Docs
- [`arquitetura/plane.md`](arquitetura/plane.md) — leitura do Plane
- [`arquitetura/coletores.md`](arquitetura/coletores.md) — coletores e o alcance da raiz
- [`arquitetura/motor.md`](arquitetura/motor.md) — motor do C-3PO, ferramentas, voz
- [`arquitetura/decisao.md`](arquitetura/decisao.md) — mesa de decisão
- [`arquitetura/projetos.md`](arquitetura/projetos.md) — catálogo dos projetos
- [`arquitetura/relacoes.md`](arquitetura/relacoes.md) — relações entre projetos
- [`arquitetura/publico.md`](arquitetura/publico.md) — front: abas, CSS, console, gasto e fila
- [`arquitetura/hangar.md`](arquitetura/hangar.md) — Hangar (tela de entrada)
- [`arquitetura/docs-do-projeto.md`](arquitetura/docs-do-projeto.md) — `00_PLANO.md`, `01_ESTADO.md`, `02_ABA_BACKLOG.md`
- [`arquitetura/invariantes.md`](arquitetura/invariantes.md) — invariantes, texto completo
- [`arquitetura/origem.md`](arquitetura/origem.md) — a fusão com o Severino e o nome C-3PO
- [`arquitetura/fatos-01-estado.md`](arquitetura/fatos-01-estado.md) — mecanismos trazidos do `01_ESTADO.md`
