# painel-admin — estado real (28/10/2026)

Só o que vale hoje, medido nesta máquina (Omarchy). Histórico datado em
`historico/`; mecanismos em `arquitetura.md`.

## No ar

- Serviço de usuário do systemd `painel-admin.service` em `127.0.0.1:7777`
  (dashboard em `/`, C-3PO em `/severino/`); do Windows,
  `https://painel.vpn.astargne.com` (borda do tailnet, só o IP dele). Host e
  origem conferidos em `guarda.js`.
- Backlog lido do **Plane** (`127.0.0.1:8095`, Guest "painel", só leitura):
  13 projetos no Plane, 15 no catálogo.
- Abas: **Projetos · Backlog · Decisões · Orquestração · Contas · Chaves ·
  Docs** (25/10: docs por projeto + alinhamento código ⇄ Plane ⇄ painel).
  Chaves (24/10): segredos por projeto, só nomes, troca por SSO, servidor
  ligado (validador, 2ª rodada). Decisões abre com o bloco "Astargne". A
  Orquestração lê a fila, pré-checa gates, registra perfil/gate/handoff com
  identidade técnica (CKBL e PLAYER) só por SSO + confirmação em duas ações,
  e mostra em leitura o canal legado do SupervisorHandoff (doc 59, os dois
  configs) — [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).
- Portão de despacho **desligado**: `ORQ_EXECUCAO_HABILITADA` ausente do
  `.env`. Executor real provado com CLIs falsas; só nasce com a variável.
  **Vigília**: varredura automática por projeto, todas desligadas; só o
  PLAYER declara o bloco. 24/10: 13 projetos, 418 cartas, PLAYER-38 única elegível.

## O que falta

- **Piloto real** (PAINEL-34): ligar a variável e confirmar um despacho em
  carta descartável é decisão do dono; nenhuma CLI paga rodou pelo Painel.
- **Consumo de assinatura** (PAINEL-40): sem fonte verificável, "indisponível".
- **Fase 3 do C-3PO** (ações): motor só-leitura, sem suíte (LLM sempre mock).
  Voz (25/10): xAI se o navegador não reconhece; ligação sem gatilho, falar por cima corta.

## Portão e repositório

- `npm test`: 168 testes + `check-docs` 0 erros (28/10); Playwright 11/11.
- Refatoração de 27–28/10: módulos por responsabilidade (`http/`,
  `coletores/`, `chaves/`, `orquestrador/*`, `publico/*`…); os arquivos
  antigos só reexportam. Mapa em `arquitetura.md`.
- Orquestrador em `b7d59fb`, Chaves em `b986385`; `main` no GitHub.
