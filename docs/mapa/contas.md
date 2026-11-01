# painel-admin — mapa: contas (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## contas/

- `fronteira.js` — Cliente e rotas /api/contas/*. O corpo JSON vai só pelo stdin do ssh.
- `processo-ssh.js` — Processo ssh sem shell. Não interpreta status nem redige segredo.
- `redacao.js` — Tira bearer do texto antes do log. Não fala com o servidor.
- `saida-central.js` — Lê o corpo e o status que o script remoto devolve. O stderr que pareça bearer é redigido antes do log.
- `ssh.js` — Porta do ssh das contas. O processo, a redação e a leitura da saída moram ao lado.
- `tabela.js` — Tabela fechada do Cadastro Único. Método e rota nascem aqui; o id entra só depois de validado.
