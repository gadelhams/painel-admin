# painel-admin — mapa: scripts (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## scripts/

- `check-docs.mjs` — check-docs v1.6 (29/10/2026; v1.5 de 25/10, v1 de 30/09) — portão de documentação do padrão de contexto por tarefa (~/Work/PADROES-CONTEXTO.md).
- `mapa-modulos.mjs` — Gera o mapa de módulos (índice docs/mapa.md + um arquivo por área em docs/mapa/) a partir do cabeçalho de cada módulo e avisa módulo grande. Não edita módulo nenhum.
- `reflexao-noturna.mjs` — Entrada do timer `painel-reflexao.timer` (03:30): liga a reflexão noturna do C-3PO à frota real e ao diretório de estado do painel, e sai 0 em todo resultado previsto. Não decide nada.
- `reservar.mjs` — Reserva (ou solta) uma carta do Plane para a sessão que o roda: `node reservar.mjs SIGLA-N [--soltar]`, de qualquer pasta. Não trabalha na carta nem a fecha.
