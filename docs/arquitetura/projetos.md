# projetos.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Catálogo dos projetos: metadados que não dão para derivar
do disco, incluindo `area` (pasta de `~/Work` onde o projeto mora), o campo
`plane` (id do projeto no Plane — sem ele o projeto não aparece nas abas de
backlog; só o `_oldSistemaLoreEngine` usa ainda o campo `backlog`, de
markdown) e o campo opcional `docs` (arquitetura/objetos/dataFlow
— só nos projetos que já têm diagrama Mermaid vivo: `_oldSistemaLoreEngine`,
`Mapa Khorvaire`, `DiscordTranscriber`). **Mantenha em sincronia com o
`../CLAUDE.md` (mapa de `ProjetosPessoais/`) e com `../../PORTAS.md`**
quando um projeto nascer, morrer ou mudar de porta. As sondas que não são de um projeto (`PRODUCAO_EXTRA` e `conferirEscutaDoSSO`) moram em `producao-extra.js` e saem reexportadas daqui.
