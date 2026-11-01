# painel-admin — mapa: encomendas (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## encomendas/

- `api-encomendas.js` — Duas ações da encomenda de nave: preparar valida o pedido e devolve o resumo; confirmar, com a mesma sessão SSO do dono, grava a linha `pedida`. Não cria projeto.
- `leitura-encomendas.js` — Lê `encomendas.jsonl` e devolve as encomendas pendentes (pedida sem atendida depois), sem `usuarioId`; não grava nada.
- `pedido-encomenda.js` — Valida o pedido de nave nova (nome, sigla opcional, módulos) e devolve a forma normalizada; não lê arquivo nem grava nada.
- `registro-encomendas.js` — Registra uma encomenda de nave como linha `pedida` em `encomendas.jsonl`, serializada no processo; não cria projeto no Plane nem mexe no catálogo.
