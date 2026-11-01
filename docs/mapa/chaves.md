# painel-admin — mapa: chaves (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## chaves/

- `api.js` — Fronteira HTTP de /api/chaves/preparar e /api/chaves/confirmar. A sessão vem antes do corpo; o valor só viaja no confirmar.
- `catalogo.js` — O que cada projeto guarda e onde. Só nomes: o valor nunca mora aqui.
- `confirmacoes.js` — Duas ações da troca de chave: preparar guarda o pedido; confirmar grava o valor, que só entra nesta segunda ação. O esqueleto mora em orquestrador/desafio-duas-acoes.js.
- `eventos.js` — Diário das trocas. O valor de uma chave nunca entra num evento.
- `inventario-local.js` — Inventário local: nomes, modo e rotação. Não lê o servidor e não grava valor.
- `inventario-servidor.js` — Inventário do servidor: um ssh de nomes. O valor não volta.
- `inventario.js` — Junta o inventário local e o do servidor no mesmo cache de nomes.
- `servico.js` — Porta do serviço de chaves. O inventário lê; a troca grava; os dois compartilham o cache do servidor.
- `troca-local.js` — Reescreve uma linha do .env local e reinicia a unit de usuário.
- `troca-servidor.js` — Reescreve uma linha do .env no servidor pelo script fixo. O valor vai no stdin.
- `troca.js` — Escolhe o destino da troca. O valor entra uma vez e sai no arquivo; nunca no diário.
