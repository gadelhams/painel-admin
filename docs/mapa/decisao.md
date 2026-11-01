# painel-admin — mapa: decisao (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## decisao/

- `api-decisao.js` — Duas ações da mesa de decisão (gravar, retomar e abandonar): o esqueleto de SSO + desafio de 2 min de orquestrador/, com os campos fechados da mesa. Não lê nem grava o Plane sozinho.
- `aplicacao-decisao.js` — A ordem de escrita do confirmar, da retomada e do abandono, sob a trava global da orquestração: releitura e digital, diário PENDENTE, comentário de intenção, PATCH da leitura ± delta, verificação, recibo, CONCLUÍDA. Não valida a prosa nem monta o pedido.
- `diario-decisao.js` — Diário de acréscimo da mesa de decisão (pendente, comentário gravado, concluída, abandonada) e a leitura das aplicações pendentes. Só grava e lê; não fala com o Plane.
- `efeitos.js` — Lista fechada dos efeitos da mesa contra a carta ATUAL: o pedido do dono vira um delta por nome, a impressão digital da carta, o corpo do PATCH e a verificação depois dele. Puro; não lê nem grava.
- `escritor-decisao-plane.js` — Escritor da mesa de decisão no Plane com a identidade Painel Admin: comentário da mesa e o PATCH da lista fechada. Lê a chave do arquivo uma vez por operação; não decide o que gravar.
- `leitor-carta.js` — Lê UMA carta do Plane sem cache, pelo caminho do projeto (carta, comentários, labels, estados e atividades), com a chave Guest. Não escreve nem decide.
- `mesa.js` — Compõe a mesa de decisão a partir do ambiente: leitor Guest, escritor Painel Admin (ou o motivo de não haver), diário, aplicação e os desafios das duas ações (gravar, retomar, abandonar). Não registra rota nem autoriza.
- `permissao.js` — Quais projetos a mesa de decisão abre: os do catálogo com Plane e sigla, menos os congelados, o Anya e o CKBL (recusados pelo id do projeto, não pela sigla). Não lê o Plane.
- `protocolo-decisao.js` — Texto dos comentários da mesa no Plane — DECISAO/v1 (a decisão do dono) e DECISAO-APLICACAO/v1 (o recibo) — e a leitura deles. Não lê nem grava o Plane.
- `retomada-decisao.js` — O que a retomada pode fazer com uma aplicação pendente: reconfere o registro do diário (lista fechada, prosa, HTML) e recalcula o delta contra a carta ATUAL. Puro; não lê nem grava.
- `servico-decisao.js` — O que a mesa de decisão oferece às rotas: a carta para a gaveta, o preparar (prosa, efeitos e digital, sem escrita), as aplicações pendentes e o preparo da retomada (delta recalculado) e do abandono. A escrita mora em aplicacao-decisao.js.
- `texto-html.js` — HTML do Plane ⇄ texto da mesa: escape do que vai para o comentário e texto puro do que vem da descrição e dos comentários. Puro.
