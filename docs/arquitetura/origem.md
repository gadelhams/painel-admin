# Origem

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

(Seção "A fusão (14/08/2026, noite — decisão do dono)" do `CLAUDE.md` antigo.)

O Severino nasceu em 14/08/2026 como projeto **irmão** (`severino/`, porta
7778), consumindo os endpoints deste painel por HTTP. Na noite do mesmo dia o
dono **revogou** essa separação: dois processos e duas portas para uma
ferramenta pessoal única eram cerimônia sem benefício — e o motor fazia HTTP
para o vizinho para ler dado que é função local. Resultado: UM app na 7777.
O repo `github.com/gadelhams/severino` está **arquivado** como lápide; código
e história continuam aqui (`github.com/gadelhams/painel-admin`).

(Do mapa da raiz, não do `CLAUDE.md` antigo:) a persona foi renomeada de
"Severino" para **C-3PO** em 21/08/2026; rota, pasta e nomes no código
mantiveram o nome antigo até 28/10/2026, quando o dono pediu o alinhamento:
rota `/c3po/`, pasta `publico/c3po/`, `mandarMensagemC3po`; `/severino` e
`/severino/` redirecionam (301) para favoritos antigos.
