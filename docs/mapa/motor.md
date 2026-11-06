# painel-admin — mapa: motor (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## motor/

- `acao-proposta.js` — A ferramenta propor_acao e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não executa.
- `decisao-proposta.js` — A ferramenta propor_decisao e a leitura do seu resultado no fluxo da conversa. Só propõe: não relê a carta, não prepara, não confirma, não grava no Plane.
- `doc-projeto.js` — Lê ou lista um .md dentro da pasta do projeto. Não registra a ferramenta.
- `envelope-coletor.js` — Embrulha a falha de um coletor interno. Não escolhe a ferramenta.
- `ferramentas.js` — Catálogo das ferramentas do C-3PO: onze de leitura e três que só propõem (ação, mudança na memória e decisão de carta). O portão é esta lista, não o texto da persona.
- `leitura-pesada.js` — Leituras que varrem o Plane inteiro (fila, triagem, decisões: 15–35 s cada) para as ferramentas do C-3PO.
- `memoria-l1.js` — Bloco da memória L1 no prompt de sistema do C-3PO: o arquivo entra como DADO delimitado, com o aviso de que é editável pelo dono. Não lê disco nem grava.
- `memoria-proposta.js` — A ferramenta propor_memoria e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não grava a memória.
- `persona.js` — Voz do C-3PO. Não é portão: a permissão mora em tools: [] e na lista de ferramentas.
