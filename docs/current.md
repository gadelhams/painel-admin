# painel-admin — estado real (31/10/2026)

Só o que vale hoje, medido nesta máquina (Omarchy). Histórico datado em
`historico/`; mecanismos em `arquitetura.md`.

## No ar

- Serviço de usuário do systemd `painel-admin.service` em `127.0.0.1:7777`
  (dashboard em `/`, C-3PO em `/c3po/`); do Windows,
  `https://painel.vpn.astargne.com` (borda do tailnet, só o IP dele). Host e
  origem conferidos em `guarda.js`.
- Backlog lido do **Plane** (`127.0.0.1:8095`, Guest "painel", só leitura):
  13 projetos no Plane, 15 no catálogo.
- **Hangar** (28/10) é a entrada: naves = projetos, droids = sessões
  Claude/Codex vivas (carta por MCP, ponte REST, `SIGLA-N` ou URL), C-3PO no popup, Steam por nave —
  [arquitetura.md](arquitetura.md) § Hangar.
- Abas: Projetos · Backlog · Decisões · Orquestração · Contas · Chaves · Docs.
  Decisões abre com o bloco "Astargne". Chaves: só nomes, troca por SSO. Orquestração: fila, gates e handoff com
  identidade técnica (CKBL, PLAYER) por SSO + duas ações —
  [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).
- Executor **ligado** (29/10): cada despacho por SSO + duas ações. Play por
  nave: todos desligados; agenda só com `ORQ_AGENDADOR` na unit (falta pôr).

## Feito em 31/10 e o que falta

- **Frota**: F2 e F3 feitas (play por nave, zelador de limpeza); falta a F4,
  puxar ([plano](plano-frota-do-hangar.md)). Piloto PAINEL-34 passou (PLAYER-38).
- **C-3PO**: lê ssh e git e só propõe rodar a suíte (cartão, SSO); mesa de
  decisão grava como Painel Admin por SSO, com retomar e abandonar
  ([plano](plano-mesa-de-decisao.md)); varredura pré-aceite corrigida (31/10).
- **Hangar**: encomenda de nave por SSO; o orquestrador atende à mão
  ([operacao.md](operacao.md)). Consumo: Codex e Claude com fonte local.
- **Memória L1** do C-3PO: editável por SSO em `/c3po/#memoria`; reflexão
  noturna 03:30 por timer de usuário, só com conversas da sessão do dono.

## Portão e repositório

- `npm test` e Playwright: contagem no selo (31/10). Sem linter: o portão monta
  o painel real com falsos e confere mapa, imports e tamanho. CSS: um por aba.
- `main` no GitHub.
