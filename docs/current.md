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
- **Hangar** (28/10) é a entrada: naves = projetos (peça = módulo do Plane),
  droids = sessões Claude/Codex vivas (`/proc` + transcripts, só ferramenta,
  arquivo e carta: MCP, ponte REST, `SIGLA-N` ou URL no comando), C-3PO no popup, Steam liberada por nave —
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
- **Consumo** (PAINEL-40): Codex pelas sessões; Claude por statusLine e `~/.claude.json`.
- **Fase 3 do C-3PO** (ações): motor só-leitura; a 1ª ação é a mesa de
  decisão, desenhada e não construída ([plano](plano-mesa-de-decisao.md)).
  Voz: xAI se o navegador não reconhece; falar por cima corta.
- **Hangar**: encomenda de nave é só texto de pedido (falta pedido por SSO);
  Grok sem CLI.

## Portão e repositório

- `npm test`: contagem no selo (31/10); Playwright no selo.
- Sem linter: o portão monta o painel real com falsos e confere mapa, imports e tamanho.
  CSS: tokens, base e um por aba (31/10).
- `main` no GitHub.
