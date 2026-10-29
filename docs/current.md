# painel-admin — estado real (28/10/2026)

Só o que vale hoje, medido nesta máquina (Omarchy). Histórico datado em
`historico/`; mecanismos em `arquitetura.md`.

## No ar

- Serviço de usuário do systemd `painel-admin.service` em `127.0.0.1:7777`
  (dashboard em `/`, C-3PO em `/c3po/`); do Windows,
  `https://painel.vpn.astargne.com` (borda do tailnet, só o IP dele). Host e
  origem conferidos em `guarda.js`.
- Backlog lido do **Plane** (`127.0.0.1:8095`, Guest "painel", só leitura):
  13 projetos no Plane, 15 no catálogo.
- **Hangar** (28/10) é a entrada: naves = projetos (peça = módulo do Plane),
  droids = sessões Claude/Codex vivas (`/proc` + transcripts, só ferramenta e
  arquivo), C-3PO narrando — [arquitetura.md](arquitetura.md) § Hangar.
- Abas: Projetos · Backlog · Decisões · Orquestração · Contas · Chaves · Docs.
  Decisões abre com o bloco "Astargne". Chaves: só nomes, troca por SSO. Orquestração: fila, gates e handoff com
  identidade técnica (CKBL, PLAYER) por SSO + duas ações; canal legado em
  leitura — [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).
- Despacho **desligado** (`ORQ_EXECUCAO_HABILITADA` ausente); executor
  provado com CLIs falsas. Vigília: todas desligadas; só o PLAYER declara.

## O que falta

- **Frota do Hangar**: CLIs no Hangar, não por carta; droid zelador
  varre o Plane ([plano](plano-frota-do-hangar.md)).
- **Piloto real** (PAINEL-34): ligar a variável e confirmar um despacho em
  carta descartável é decisão do dono; nenhuma CLI paga rodou pelo Painel.
- **Consumo de assinatura** (PAINEL-40): sem fonte verificável, "indisponível".
- **Fase 3 do C-3PO** (ações): motor só-leitura; a 1ª ação é a mesa de
  decisão, desenhada e não construída ([plano](plano-mesa-de-decisao.md)).
  Voz: xAI se o navegador não reconhece; falar por cima corta.
- **Hangar**: encomenda de nave é só texto de pedido (falta pedido por SSO);
  CSS ainda monolítico (`estilo.css`); Grok sem CLI.

## Portão e repositório

- `npm test`: 180 testes + `check-docs` 0 erros (28/10); Playwright 15/15.
- Um módulo por responsabilidade (27–28/10); mapa gerado em `mapa.md`,
  conferido no `npm test`.
- Orquestrador em `b7d59fb`, Chaves em `b986385`; `main` no GitHub.
