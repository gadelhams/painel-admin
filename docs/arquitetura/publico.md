# publico/

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Dashboard vanilla, reskin **"Industry HUD"** desde 21/08/2026
(mock hi-fi do dono em `design_handoff_painel_hud/`; tokens/tipografia
declarados como finais no handoff da época — Barlow/Barlow Condensed/IBM Plex Mono
vendorizados em `publico/vendor/fonts/`, mesmo princípio zero-CDN do
Mermaid). Em 12/10/2026, a camada Protocolo passou a sobrepor o visual das abas
segundo o protótipo do dono, sem mudar lógica. Desde 28/10/2026 a entrada (`/`, `#/hangar`) é o **Hangar** ([hangar.md](hangar.md)); seguem as abas — **Projetos · Backlog · Decisões · Orquestração · Contas · Chaves · Docs** — mais
o console do C-3PO como overlay por ⌘K/Ctrl+K:

## CSS (partido por aba desde 31/10/2026, PAINEL-51)

`index.html` carrega, nesta ordem: `tokens.css` (único lugar de `@font-face`
e de variáveis — base Industry, camada Protocolo por cima, `--hg-*` do
Hangar), `base.css` (reset, elementos globais, cabeçalho, barra de abas e
peças comuns: `.moldura`, `.discreto`, `.etiqueta`, `.kicker`,
`.titulo-secao`, `.pagina-intro`), `orquestracao.css`, `console.css`
(overlay e palco de voz), `projeto.css`, `backlog.css`, `decisoes.css`
(grupos por projeto, que Chaves e Docs reaproveitam, e o bloco Astargne),
`contas.css`, `chaves.css`, `docs.css` e `hangar.css`. São as regras de
`estilo.css`, `protocolo.css` e `orquestrador.css` sem nenhuma mudança: dentro de
cada arquivo vem antes o trecho Industry e depois o Protocolo que o
sobrepõe, como na cascata antiga — **reordenar arquivo ou trecho muda o
visual sem erro**. Lista de seletores que misturava abas foi partida (mesma
declaração, um seletor por arquivo). `test/css-partes.test.js` confere que
todo CSS é carregado, todo `<link>` existe, toda classe do HTML tem regra e
tokens só em `tokens.css`. `/c3po/` usa só o próprio `c3po/estilo.css`.

## app.js

O arquivo só guarda o tema e o relógio de sincronia. O DOM e o markdown estão em `dom.js`, o estado compartilhado em `estado-painel.js`, a tira em `telemetria.js` (nome curto em `nomes-curtos.js`, célula em `tira-telemetria.js`, bloqueios em `palco-bloqueios.js`, placar em `placar-cabecalho.js`), o console em `console-palco.js`, `console-digest.js`, `console-decisao.js` e `console-c3po.js`, o hash em `roteador-painel.js` e as buscas em `carga.js`. Núcleo compartilhado: roteador por hash
(`#/hangar` (padrão)·`#/projetos`·`#/backlog`·`#/decisoes`·`#/orquestracao`·`#/contas`·`#/projeto/<pasta>`), estado
`projetoSelecionado` **compartilhado entre as abas Projetos e Backlog**
(a mesma variável que a tira de telemetria, o outline do Backlog e a
coluna de contexto do painel de projeto leem — `decisoes.js` e
`contas.js` não a leem), tira de telemetria (uma célula
por projeto do catálogo — 15 desde 12/10/2026), tema claro/escuro (`data-tema` em `<html>`,
persistido em `localStorage`), e o console do C-3PO (`#console-scrim`
— na aba Projetos é o palco do meio; de outra aba abre em overlay por
⌘K/barra de comando/clique numa decisão. O digest matinal sai uma vez
por dia local).

## backlog.js

As primitivas recursivas do backlog
(`desenharNodo`/`placar`/`nosComTag`, independentes de layout) mais duas
camadas de apresentação: `outlineFeatureDetalhes` (`<details>` por
feature, usado no painel de projeto) e `desenharBacklogDoProjeto`
(sempre expandido, grid de 2 colunas — a aba Backlog em si). As duas
mostram o backlog de **um projeto por vez** (`projetoSelecionado`), não
mais o quadro kanban multi-projeto de antes.

## projeto.js

O painel do projeto focado (metade de baixo da aba
Projetos): cabeçalho + outline do backlog na coluna principal;
Arquitetura (moldura hachurada + Mermaid real nos 3 projetos que já têm
diagrama, "sem diagrama ainda" nos outros) + Decisões paradas + Fila de
jobs (**estado vazio honesto** — não existe sistema de jobs) + Produção
(sondas + SSH sob demanda) na coluna de 420px. O desenho de cada bloco mora em `idade-curta.js`, `secao-cabecalho.js`, `secao-outline.js`, `secao-arquitetura.js`, `secao-decisoes.js`, `secao-fila.js` e `secao-producao.js`; `projeto-secoes.js` só compõe. Também define
`abrirConsoleComDecisao` (chamada por `app.js`/`decisoes.js`).

## decisoes.js

Aba Decisões: todas as decisões agrupadas por projeto
(top 3 por contagem abertos, resto em "Outros N projetos" colapsado).
A página é `PaginaDecisoes`; o agrupamento mora em `decisoes-grupo.js`,
a linha em `decisoes-linha.js` e o bloco do dono em `decisoes-astargne.js`.
Linha `ASTARGNE` com carta do Plane ganha "Discutir com o C-3PO" (a gaveta da
mesa, [decisao.md](decisao.md)); as aplicações pendentes da mesa aparecem depois do bloco do dono.

## contas.js (publico/)

(13/09/2026) — aba Contas. O desenho mora em `contas-pecas.js` (peças comuns), `contas-usuario.js` (linha e editor) e `contas-convite.js` (lista, formulário e resultado); `contas-desenho.js` só compõe. Usuários (nome, e-mail, ativo,
apps como chips; ações permissões/desativar-reativar/redefinir senha),
convites pendentes (reenviar/revogar) e o formulário Convidar (e-mail,
nome opcional, checkboxes dos apps com `sso: true` vindos de
`/api/contas/apps`). Depois de convidar mostra `enviado` e, se `false`,
o `erro` e o `link` para mandar por outro canal. Desativar e revogar
pedem `confirm()`. Toda escrita manda JSON (as ações sem corpo mandam `{}`) e
exige sessão SSO: só funciona aberta por `https://painel.vpn.astargne.com` com
login no Cadastro Único; o 401 vira a orientação de login na própria aba. **Sem polling**: busca ao ENTRAR na aba (`rotear`
detecta a troca de view por `viewAtual`) e após cada ação — o `rotear()`
de 60 s passando pela mesma view não dispara ssh nenhum.

## orquestrador.js (publico/) e orquestracao.css

A aba está partida em `publico/orquestracao/`: núcleo (estado e HTTP), demanda (elegibilidade na carta, pré-checagem em `demanda-prontidao.js`, portão em `demanda-portao.js`, histórico em `demanda-historico.js`), fila (filtro em `fila-filtro.js`, lista em `fila-lista.js`, triagem em `fila-triagem.js`), despacho, gate, conversa (canal em `conversa-canal.js`, handoff em `conversa-handoff.js`), frota (seletores em `modelos-seletores.js`, confirmação em `frota-confirmacao.js`), legado, consumo e voz da carta. `orquestrador.js` só liga os tópicos. Leitura/simulação do Plane: painel de projetos candidatos, consulta
C-3PO sob demanda, impedimentos reais, fila filtrável e touchpoints. Recebe
HTML de referência visual Protocolo (11/10/2026), com a camada Protocolo,
sem escuta contínua ou ações do mock. Abre o console sem enviar mensagem ou
acionar microfone. O filtro inicial exibe candidatas com gate; "Todas as
cartas" revela as demais rejeições. A pré-checagem GET por carta consulta
relações formais sob demanda sem criar lease ou escrever no Plane. Tópicos:
Demanda, **Resumo da carta** (bloco Estado da descrição, último handoff e gate, tamanho do fio
e link para o Plane; `orquestrador/resumo-carta.js`, sem LLM), **Frota** (estado, versão e os quatro
papéis; editor dos blocos executor e zelador com `modelos-seletores.js`; preparar/confirmar em
`frota-confirmacao.js`; nada por carta — a carta só mostra "perfil antigo ignorado"), Consumo, **Diário
da frota** (projeção só-leitura de `touchpoints.jsonl`, dos diários da vigília e do zelador por
`orquestrador/diario-frota.js`, só campos estruturados; linha truncada no fim é ignorada e
avisada, corrupção no meio falha fechada naquela fonte — `leitor-jsonl.js`), lido só ao abrir o
tópico. A sub-aba Vigília saiu na F3: ligar um projeto é o play da nave, no Hangar. Leituras pesadas abortam a
anterior (`AbortController` por tópico); resultado de gate/despacho confirmado
sobrevive ao re-render (`estado.ultimoResultado`). Ver
[orquestracao-v2-integracao.md](../orquestracao-v2-integracao.md).

`GET /api/orquestracao/triagem-dev` é uma leitura pesada, acionada só pelo
botão da aba ou por pergunta ao C-3PO: classifica folhas abertas sem gate por
marcadores humanos, dependências formais, declaração de independência e estado.
A API não infere decisão de produto, não aplica etiquetas e não integra o
polling da fila. O botão no card abre o console com uma pergunta preenchida,
mas não a envia: o dono escolhe quando conversar.

## docs.js (publico/)

Aba **Docs** (25/10/2026): a documentação de cada projeto separada dos cards
(o Plane é só desenvolvimento) e, no topo, a dívida de alinhamento da rotina
(`GET /api/alinhamento`; botão "Varrer agora"). A página é `PainelDocs`; o desenho mora em `docs-desenho.js`. Por projeto: links para os
docs funcional/arquitetural/técnico/contrato, que abrem na página do projeto
(`#/projeto/<pasta>?arquivo=<caminho>` — `app.js` lê o parâmetro e
`projeto.js` abre o documento ao montar) e a lista de sinais com link para o
card. Selo na aba = total de sinais.

## chaves.js (publico/)

(24/10/2026) — aba Chaves: `PainelChaves` guarda o estado, `chaves-pedido.js` fala com a API, `chaves-linha.js` desenha a linha, `chaves-troca-form.js` abre o preparo e `chaves-desenho.js` lista um `<details>` por projeto com o `.env` local e o do
servidor (arquivo, modo, FROUXO se não for 600), uma linha por variável
(presença local/servidor, última troca, ROTAÇÃO PENDENTE com card e motivo), botões
"Trocar aqui" / "Trocar no servidor" / "Marcar como rotacionada" que abrem o
preparo e um campo `type=password` esvaziado após o envio; "Ler inventário do
servidor (ssh)" sob demanda; últimas trocas sem valores. Selo da aba = rotações
pendentes. Carrega ao ENTRAR na aba (`rotear`), sem polling.

## grafo.js / relacoes.js

Fora da nav (ver [relacoes.md](relacoes.md)), arquivos intactos.


## vendor/mermaid.min.js

`publico/vendor/mermaid.min.js` — Mermaid vendorizado (o Three do Hangar mora em `vendor/three/`, r128 com `SHA256SUMS`), reaproveitado
pelos diagramas dos docs e pela Arquitetura do painel de projeto.

## Console do C-3PO

Reaproveita `publico/c3po/chat.js` (agora
numa IIFE, expõe só `window.mandarMensagemC3po`) e `voz.js`
inteiros — só o container mudou (da faixa lateral fixa da manhã de
21/08 pro overlay, e em 25/10 para o palco central da aba Projetos).
Abrir por ⌘K manda o digest matinal uma vez por dia local (prompt
fixo pro `/api/conversa` já existente — **nenhuma rota nova pro
digest**; a marca fica em `localStorage`, chave `c3po-digest-dia`); clicar numa decisão manda o texto dela verbatim e pergunta o
que trava/o que falta (persona só-leitura: explica e pergunta, nunca
decide). A página standalone `/c3po/` **continua existindo** como
está (acesso alternativo, sem o chrome do dashboard) — os dois modos
compartilham a mesma sessão de conversa (`sessionStorage`, por aba do
navegador) e os mesmos endpoints.

## Gasto e fila de jobs

Gasto por projeto e "fila de jobs" **não têm fonte de dado real** — o
painel mostra "—"/estado vazio honesto em vez de inventar (mesma régua
do `PADROES-GERAIS.md` #8); se um dia existir coleta de custo real, é o
lugar de plugar.
