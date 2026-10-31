# painel-admin — estado real (29/10/2026)

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
  arquivo), C-3PO narrando e respondendo no popup, e a Steam liberada por nave (29/10) —
  [arquitetura.md](arquitetura.md) § Hangar.
- Abas: Projetos · Backlog · Decisões · Orquestração · Contas · Chaves · Docs.
  Decisões abre com o bloco "Astargne". Chaves: só nomes, troca por SSO. Orquestração: fila, gates e handoff com
  identidade técnica (CKBL, PLAYER) por SSO + duas ações —
  [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).
- Executor **ligado** (29/10): cada despacho por SSO + duas ações. Vigília:
  todas desligadas.

## O que falta

- **Frota**: F2 feita (modelos numa frota só, por SSO; catálogo com 13
  modelos das duas CLIs; sem frota gravada nada despacha); falta F3 ([plano](plano-frota-do-hangar.md)).
- **Piloto real** (PAINEL-34) **passou em 31/10**: PLAYER-38 despachada pelo
  dono, Codex codificou, Claude validou (APROVADO), integrada no PLAYER.
  Falta ver no CLI real a mensagem de limite.
- **Consumo** (PAINEL-40): Codex pelas sessões, Claude pela statusLine (29/10).
- **Fase 3 do C-3PO** (ações): motor só-leitura; a 1ª ação é a mesa de
  decisão, desenhada e não construída ([plano](plano-mesa-de-decisao.md)).
  Voz: xAI se o navegador não reconhece; falar por cima corta.
- **Hangar**: encomenda de nave é só texto de pedido (falta pedido por SSO);
  CSS ainda monolítico (`estilo.css`); Grok sem CLI.

## Portão e repositório

- `npm test`: 237 testes + `check-docs` 0 erros (31/10); Playwright 25/25.
- Um módulo por responsabilidade; mapa em `mapa.md`, conferido no `npm test`.
- `main` no GitHub.
