# painel-admin — mapa: test (2 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## test/fixtures/canal-legado/

- `leitor-falso.mjs` — Dublê do scripts/estado_canal.py: o roteiro vem do nome do config pedido.

## test/fixtures/executor-cli/

- `claude-falso.mjs` — CLI claude falsa: grava argv, stdin, env e cwd ao lado de si mesma e responde como `claude -p --output-format json`.
- `codex-falso.mjs` — CLI codex falsa: grava o retrato ao lado de si mesma e escreve a última mensagem em -o.
- `dormente.mjs` — Dorme 5 s; se sobreviver, deixa um marcador ao lado de si mesmo (o timeout deve impedir).
- `npm-falso.mjs` — npm falso: só registra os argumentos (npm ci nunca roda de verdade em teste).

## test/fixtures/frota/

- `frota.js` — Frota de teste gravada pelo mesmo caminho da troca real (ArquivoFrota.gravar), nunca escrita à mão.

## test/fixtures/zelador/

- `cenario.js` — Cenário do zelador montado pelas portas reais: estado, frota, play, leases, diário e escritor de verdade; Plane, CLI, sessões e consumo falsos; git de verdade num repositório temporário.
- `plane-falso.js` — Plane falso para o zelador: leitura Guest (`consultar`) e o fetch do escritor (chave, /users/me, comentários com external_id e 409, relações, PATCH com atividade). Nada de rede.
