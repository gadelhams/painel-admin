# painel-admin — mapa: test (2 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## test/fixtures/

- `frota-f4b.js` — Cenário da F4b montado pelas portas reais: dois projetos do catálogo (PAINEL e CAD) num Plane falso, fila, despacho, vigília, play, zelador (com o escritor de verdade) e reservas; CLIs, executor, sandbox e sessões falsos. Nada de rede nem de CLI paga.
- `frota-preparo.js` — Cenário do preparo do PRONTA (PAINEL-62): uma carta (por padrão em Backlog, a forma da CAD-32) e um job do zelador que a propõe PRONTA, montados sobre o cenário F4b. Plane, CLI e executor falsos.
- `recibo-gate.js` — Recibo GATE/v1 e atividade de etiqueta no formato que o Plane real devolve (F4a: J54, J55, J74), para os Planes falsos dos testes.

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
