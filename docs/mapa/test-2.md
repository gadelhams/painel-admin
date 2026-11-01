# painel-admin — mapa: test (2 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## test/fixtures/zelador/

- `cenario.js` — Cenário do zelador montado pelas portas reais: estado, frota, play, leases, diário e escritor de verdade; Plane, CLI, sessões e consumo falsos; git de verdade num repositório temporário.
- `plane-falso.js` — Plane falso para o zelador: leitura Guest (`consultar`) e o fetch do escritor (chave, /users/me, comentários com external_id e 409, PATCH com atividade). Nada de rede.
