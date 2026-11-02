# painel-admin — estado real (01/11/2026)

Só o que vale hoje, medido no Omarchy. Histórico em `historico/`;
mecanismos em [`arquitetura.md`](arquitetura.md) (um arquivo por mecanismo).

## No ar

- `painel-admin.service` em `127.0.0.1:7777` (`/` e `/c3po/`); do Windows,
  `https://painel.vpn.astargne.com`. Backlog do **Plane** (Guest "painel").
- **Hangar** é a entrada: naves, droids das sessões vivas, C-3PO, Steam por
  nave ([hangar](arquitetura/hangar.md)). Abas: Projetos · Backlog · Decisões ·
  Orquestração · Contas · Chaves · Docs.
- **Frota** F2–F4 feitas: play por nave, zelador, reserva
  (`scripts/reservar.mjs`), READY TO DEV pelo zelador, despacho do Hangar
  inteiro, CLIs e aceite sob bwrap ([plano](plano-frota-do-hangar.md)).
  Com `.orquestrador.json`: CAD, CKBL, EMU, PAINEL, PLAYER, SUPER. Plays desligados.
  O PRONTA tira do Backlog e declara "Dependências: nenhuma"; a prosa o zelador julga (PAINEL-62, [preparo](plano-frota-preparo.md)).
- **Mesa de decisão** grava como Painel Admin por SSO
  ([plano](plano-mesa-de-decisao.md)). **Memória L1** do C-3PO editável em
  `/c3po/#memoria`; reflexão 03:30 por timer.
- Rollback provado; tag `painel-estavel-20261101` ([operacao](operacao.md)).

## Falta só o dono (PAINEL-42)

1. Pôr `Environment=ORQ_AGENDADOR=true` na unit ([operacao](operacao.md)),
   `daemon-reload`, `restart`. Sem isso nada agenda.
2. Ligar o play de uma nave e acompanhar o 1º job do zelador.
3. Prova de voz no Windows (PAINEL-39).
4. Uma decisão real pela mesa (roteiro no plano da mesa).
5. Smoke do SSO no Windows: `node e2e/windows-sso-smoke.mjs`.
6. Confirmar que não houve jogo nativo: a frota só rodou as 2 tentativas do
   PLAYER-38; a "Steam livre" do CKBL foi ligada por você em 01/11 01:13
   até 13:13 UTC.

## Portão

`npm test` 498 e Playwright 38 (01/11), check-docs com acervo (teto 30 mil
por doc). Sem linter: o portão monta o painel real com falsos e confere
mapa, imports e tamanho. `main` no GitHub.
