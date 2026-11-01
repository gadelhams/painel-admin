# painel-admin — mapa: acoes (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## acoes/

- `api-acoes.js` — Duas ações das propostas do C-3PO: preparar mostra projeto, pasta e comando; confirmar, com a mesma sessão SSO do dono, roda uma vez e registra no diário. Não registra proposta.
- `diario-acoes.js` — Diário de acréscimo das ações do C-3PO (proposta, preparo, confirmação, resultado). Só grava; não decide nem executa.
- `executor-acoes.js` — Roda o comando de uma ação confirmada pelo dono: uma por vez, sem shell, ambiente por lista branca, tempo e saída limitados e saída filtrada. Não confere SSO, proposta nem contrato.
- `filtro-segredo.js` — Tira segredo de texto que vai para o chat ou para o diário (saída de teste, git, conversa, memória). Não decide o que mostrar.
- `propostas.js` — Propostas de ação do C-3PO: registra {projeto, comandoId} conferido contra o contrato e devolve um id de proposta. Nunca executa nem emite confirmação.
