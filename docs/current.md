# painel-admin — estado real (24/10/2026)

Só o que vale hoje, medido nesta máquina (Omarchy). Histórico datado em
`historico/`; mecanismos em `arquitetura.md`.

## No ar

- Serviço de usuário do systemd `painel-admin.service` em `127.0.0.1:7777`
  (dashboard em `/`, C-3PO em `/severino/`); do Windows,
  `https://painel.casa.astargne.com` (borda do tailnet, só o IP dele). Host e
  origem conferidos em `guarda.js`.
- Backlog lido do **Plane** (`127.0.0.1:8095`, Guest "painel", só leitura):
  13 projetos no Plane, 15 no catálogo.
- Abas: **Projetos · Backlog · Decisões · Orquestração · Contas**. A
  Orquestração lê a fila, pré-checa gates, registra perfil/gate/handoff com
  identidade técnica (CKBL e PLAYER) só por SSO + confirmação em duas ações,
  e mostra em leitura o canal legado do SupervisorHandoff (doc 59, os dois
  configs) — [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).
- Portão de despacho **desligado**: `ORQ_EXECUCAO_HABILITADA` ausente do
  `.env`. O executor real (`orquestrador/executor-cli.js`) existe e está
  provado com CLIs falsas; só nasce com a variável. **Vigília** (tópico da
  aba): varredura automática por projeto, todas desligadas; só o PLAYER
  declara o bloco. 24/10: 13 projetos, 418 cartas, PLAYER-38 única elegível.

## O que falta

- **Piloto real** (PAINEL-34): ligar a variável e confirmar um despacho em
  carta descartável é decisão do dono; nenhuma CLI paga rodou pelo Painel.
- **Consumo de assinatura** (PAINEL-40): sem fonte verificável, "indisponível".
- **Fase 3 do C-3PO** (ações): motor só-leitura, sem suíte (LLM sempre mock).
- Contas sem o selo do primeiro convite real; prova humana da voz pendente.

## Portão e repositório

- `npm test`: 141 testes + `check-docs` 0 erros (24/10); Playwright 11/11.
- Commit `b7d59fb` (24/10) fecha a entrega do Orquestrador; rollback = `dba9618`
  (painel sem a aba). Sem push.
- Auditoria de 24/10 aplicada: `orquestracao*.js` legados removidos,
  `Depende de:` em lista, filtro `cancelled`, trava fora do I/O do Plane,
  renovação de lease não pegajosa, resultado do executor persistido antes do
  Plane, releitura das etiquetas antes do PATCH, 409 do Plane = idempotência.
