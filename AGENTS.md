# painel-admin — contrato de trabalho (entrada única)

Hub administrativo **local** dos projetos de `~/Work` (git, portas, sondas da
produção, aba Contas do cadastro único) com o **C-3PO** a bordo (assistente
por texto e voz, ex-Severino). Node ≥ 22.9, vanilla no front, uma dependência
(`@anthropic-ai/claude-agent-sdk`), um processo em `127.0.0.1:7777`.
Proprietário: Astargne.

## Leia por tarefa

Leitura comum, sempre: `docs/current.md` (estado real, datado) e
`docs/invariants.md` (regras numeradas). Depois **só** a linha da tarefa:

| Tarefa | Contrato |
|---|---|
| Mexer em coletor, rota HTTP ou catálogo (`coletores.js`, `servidor.js`, `projetos.js`, `relacoes.js`) | `docs/arquitetura.md` § servidor.js / coletores.js / projetos.js / relacoes.js; portas e mapa em `../../PORTAS.md` e `../CLAUDE.md` |
| Front (`publico/`): abas, console, tema | `docs/arquitetura.md` § publico/ |
| Aba Contas / CadastroUnico (`contas.js`, `publico/contas.js`) | `docs/arquitetura.md` § contas.js + `../../PLANO-CADASTRO-UNICO.md` ("Retomada"); relatório da fatia em `docs/RELATORIO-F5-CONTAS.md` |
| Backlog / Plane (`plane.js`, aba Backlog, aba Decisões) | `docs/arquitetura.md` § plane.js + `../../PADROES-BACKLOG.md` (tabela única de ids e siglas); `docs/BACKLOG.md` é só ponteiro |
| Aba Orquestração (`orquestrador/`, `publico/orquestrador.js`, contrato `.orquestrador.json`, fila, lease, gate/handoff/perfil, executor, canal legado) | `docs/orquestracao-v2-integracao.md` + `../ORQUESTRADOR-PROJETOS.md`; escrita só por identidade técnica com SSO e confirmação; despacho desligado sem `ORQ_EXECUCAO_HABILITADA` (variáveis em `docs/operacao.md`) |
| Aba Chaves (`chaves.js`, `publico/chaves.js`) e bloco "Astargne" da aba Decisões (`publico/decisoes.js`) | `docs/arquitetura.md` § chaves.js; só nomes circulam; troca por SSO + duas ações; escrita no servidor só com `CHAVES_SERVIDOR_ESCRITA=true` após `validador-deploy` |
| Aba Backlog — desenho e história (parser do doc 39) | `docs/02_ABA_BACKLOG.md` |
| Motor, persona ou voz do C-3PO (`motor.js`, `publico/severino/`) | `docs/00_PLANO.md` § Persona, § Princípios, § Voz da persona; `docs/arquitetura.md` § motor.js e § Fatos trazidos; `docs/operacao.md` § Severino por voz |
| Subir, reiniciar, ver log | `docs/operacao.md` § Como roda |
| Infra no `astargne.com` (o painel não faz deploy; só a aba Contas **muda estado** no servidor; `/api/producao/ssh` é só leitura) | `../../SERVIDOR-astargne.md` (master; `validador-deploy` antes) |
| Como este projeto se liga aos outros | `../../RELACOES.md` |
| Histórico: `CLAUDE.md` e `docs/01_ESTADO.md` antigos, provas das fases | `docs/historico/`; `docs/01_ESTADO.md` é ponteiro |

A ferramenta `docs_projeto` do motor lê `CLAUDE.md`/`AGENTS.md` dos projetos
de forma genérica — a estrutura destes arquivos é também dado do produto.

## Operação

- `npm start` (`node --env-file-if-exists=.env servidor.js`) → `localhost:7777`
  (dashboard) e `/severino/` (chat). Em produção local é serviço de usuário:
  `systemctl --user {status,restart} painel-admin`,
  `journalctl --user -u painel-admin`.
- **Portão** = `npm test`: suíte `node --test` (ssh e Plane sempre falsos)
  **e** `node scripts/check-docs.mjs` (tetos, links e rotas dos docs —
  `../../PADROES-CONTEXTO.md`). Vermelho em qualquer um não sela.
- **Nunca** (texto completo em `docs/invariants.md`): expor a 7777 fora da
  máquina; ssh que mude estado fora do banco do CadastroUnico; copiar o
  `TOKEN_INTERNO` para o PC; dar ferramenta de escrita ao motor antes da fase
  3; pular o `validador-deploy` por ser "modo voz"; segredo fora do `.env`;
  chamar a API real do LLM, CLI paga ou ssh real em teste; ligar
  `ORQ_EXECUCAO_HABILITADA` sem o "vai" de Astargne para um piloto nomeado.
- Backlog = projeto **PAINEL** no Plane (`../../PADROES-BACKLOG.md`); todo
  selo o atualiza na mesma entrega. Projeto novo no catálogo: `projetos.js` +
  `../CLAUDE.md` + `../../PORTAS.md` juntos.
- Commit e push autorizados em caráter permanente (24/10/2026) com o aceite
  do orquestrador; deploy só com `validador-deploy` APROVADO. Revise `git status`/`git diff`
  antes do `git add`, nunca `-A`.
