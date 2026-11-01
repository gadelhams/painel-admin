# painel-admin — mapa: memoria (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## memoria/

- `api-memoria.js` — Duas ações da memória L1: preparar mostra o diff contra a versão-base; confirmar, com a mesma sessão SSO do dono, grava uma vez. Também monta a leitura da tela. Não registra proposta.
- `arquivo-memoria.js` — Leitura da memória L1 do C-3PO (`c3po/MEMORIES.md`) e do seu histórico de versões. Não grava: escrever é de escritor-memoria.js, fora do alcance do motor.
- `conversas.js` — Diário mínimo das conversas do C-3PO (`c3po/conversas.jsonl`): pergunta e resposta truncadas e filtradas de segredo, retidas 14 dias. É o insumo da reflexão noturna; não decide nada.
- `diff.js` — Diff unificado curto, linha a linha, entre duas versões da memória L1, com a conta do que foi apagado. Não lê nem grava arquivo.
- `escritor-memoria.js` — Única escrita da memória L1: confere a base sob trava, registra a versão no histórico e troca o arquivo de uma vez. Não confere SSO nem decide se a mudança é boa.
- `marcas.js` — Neutraliza, num texto que vai ao modelo como DADO, tudo o que tem cara de uma das marcas que o delimitam (tags como memoria_l1 e linhas como <<<FIM>>>). Puro; não lê nem grava.
- `pendente-memoria.js` — Proposta pendente da reflexão noturna (`c3po/memoria-pendente.json`): a versão que a reflexão não aplicou sozinha por apagar demais. Não grava a memória; o dono aceita pelo SSO.
- `propostas-memoria.js` — Propostas de memória do C-3PO: monta a L1 nova (acrescentar ao fim ou trocar um trecho exato) contra a versão atual e guarda em memória com prazo. Nunca grava a memória.
- `reflexao.js` — Reflexão noturna do C-3PO (PAINEL-9): junta as conversas do dia, pede ao Claude da assinatura a memória L1 nova e só a aplica se passar nos critérios; senão vira proposta pendente ou recusa. Uma por noite, tudo no diário.
- `trava.js` — Trava entre processos por diretório (mkdir é atômico) para a memória L1 e a reflexão, com a recuperação da trava velha por rename. Não sabe o que protege.
