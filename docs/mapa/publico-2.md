# painel-admin — mapa: publico (2 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## publico/orquestracao/

- `consumo.js` — Medidores de consumo. Sem fonte verificável, mostra o motivo e nenhum percentual inventado.
- `conversa-canal.js` — Resumo da carta: o estado que a descrição declara, o último handoff e gate e o tamanho do fio.
- `conversa-handoff.js` — Prepara e confirma o handoff. Não lista os comentários.
- `conversa.js` — Liga a leitura do card ao handoff em duas ações. Não grava sozinho.
- `demanda-carta.js` — Elegibilidade e dependências da carta selecionada. Não lista a fila.
- `demanda-historico.js` — Diário da frota: o que cada droid fez, em que carta e com que resultado. Com uma carta escolhida, mostra o lease dela e filtra o diário; sem carta, mostra o diário inteiro.
- `demanda-portao.js` — Portão de execução da carta selecionada. Preparar continua em despacho.js.
- `demanda-prontidao.js` — Pré-checagem de gate da carta selecionada. Não marca o gate.
- `despacho.js` — Preparar e confirmar o despacho. A segunda ação é explícita.
- `fila-filtro.js` — Quais cartas passam no filtro da tela. Não desenha a lista.
- `fila-lista.js` — Desenha o seletor de projetos e os botões das cartas. Não busca a fila.
- `fila-triagem.js` — Classifica as folhas sem gate. Não altera etiqueta e não desenha a carta.
- `fila.js` — Carrega a fila e abre a carta. O filtro, a lista e a triagem moram ao lado.
- `frota-confirmacao.js` — Preparar e confirmar a troca da frota. A segunda ação é explícita; não desenha os seletores.
- `frota.js` — Sub-aba Frota: mostra a configuração geral (estado, versão, os quatro papéis) e o editor dos dois blocos. Nada por carta; a gravação mora em frota-confirmacao.js.
- `gate.js` — Preparar e confirmar a etiqueta de gate. Não inicia execução.
- `modelos-seletores.js` — Desenha os seletores provedor → modelo → esforço de cada papel. Não valida nem grava a frota.
- `nucleo.js` — Estado e HTTP da aba Orquestração. Não desenha tela e não decide portão.
- `voz-carta.js` — Gravação da carta: só propõe texto. Não grava no Plane e não executa.
