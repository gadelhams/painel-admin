# coletores.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta única. A implementação mora em `coletores/`: `caminhos.js` (raiz e portão), `git-local.js` (git), `portas-locais.js` (escuta local), `estado-local.js` (o resumo dos dois), `leitura-md.js` (corte), `modeladores.js` (lista), `docs.js` (o projeto), `sonda-https.js` (o GET), `sondas.js` (o catálogo de produção), `parser-backlog.js` (markdown), `backlog.js` (montagem Plane/markdown), `idade-linha.js` (idade no git), `decisoes.js` (a lista), `catalogo.js` e os do Hangar (`hangar.js`, `sessoes.js`, `acervo.js`, `acoes-sessao.js`, `transcript-{cauda,claude,codex}.js`, [hangar.md](hangar.md)). Coletores de estado (git, portas, sondas de produção,
backlog, **leitura segura de docs modeladores por projeto**),
**compartilhados**. `RAIZ` é `~/Work` (dois níveis acima) e, desde a
reorganização de 30/09/2026, todo caminho passa por `dirDoProjeto()` =
`RAIZ/<area>/<pasta>`; `resolverDentroDaRaiz` só aceita as áreas de
`AREAS` (`ProjetosPessoais`, `ProjetosCompartilhados`) — **`Exitlag/`
(empresa) fica fora do alcance de propósito**, por nome direto ou por `..`
(`test/caminhos.test.js`): as rotas da API e as ferramentas do motor chamam as
mesmas funções — o motor nunca faz HTTP para o próprio processo.
