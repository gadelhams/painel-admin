# plane.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta. `plane/cliente.js` consulta e guarda o cache; `plane/features.js` projeta
o workspace na forma do backlog.

(30/09/2026; de 29 a 30/09 foi `linear.js`, com o Linear) — o
backlog vem do **Plane** (instância própria no Omarchy, workspace
`astargne`, `https://plane.vpn.astargne.com`; a verdade desde a
migração; `../../PADROES-BACKLOG.md`): API v1 com o token do usuário
**"painel"** (`PLANE_API_KEY` no `.env`; papel Guest no workspace e em cada
projeto — lê tudo, e a API devolve 403 a qualquer escrita, conferido de
fora), e `montarFeatures` (pura, testada) devolve a mesma forma que o parser
de markdown produzia — módulo = feature (na ordem do `sort_order` do Plane),
sub-work item = filho, label de tag canônica = chip. A API não diz o módulo
de um work item: é uma consulta por módulo (~100 consultas no total, ~11 s
com o único worker do Plane), por isso o cache devolve o dado anterior na
hora e renova em segundo plano, uma renovação por vez. Falha vira
`erro_plane` nomeado, nunca lista vazia; a mensagem de erro nunca ecoa o
token. **Projeto novo no Plane só aparece depois de o usuário "painel"
entrar nele como Guest.**
