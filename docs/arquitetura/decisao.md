# decisao/ (mesa de decisão, PAINEL-53, 31/10/2026)

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

O dono discute uma carta que espera decisão dele (`ASTARGNE`, a legada `DONO` ou `PRODUTO`)
com o C-3PO e grava a decisão no Plane. Plano e escolhas em
[plano-mesa-de-decisao.md](../plano-mesa-de-decisao.md). Porta `decisao.js` = só a leitura
(`criarLeitorCarta`, `cartaParaLeitura`), para o motor; o resto só a montagem liga
(`decisao/mesa.js` compõe).

- **Quais projetos** (`permissao.js`): os do catálogo com `plane` e `sigla`, menos congelados,
  o Anya e o CKBL (o `AGENTS.md` dele só aceita no Plane as identidades Codex/Claude e a ponte
  REST; decisão do integrador, 31/10/2026) — recusados pelo id do projeto, não pela sigla. O
  projeto vem da sigla de `SIGLA-N`, nunca do pedido.
- **Leitura** (`leitor-carta.js`): chave Guest, sem cache e sem as vagas de `plane/cliente.js`
  (10 s por chamada): `/work-items/SIGLA-N/` acha o id, e a releitura pelo caminho do projeto
  confere `project`, `sequence_id` e o id antes de comentários, labels e estados. Descrição e
  comentários saem como texto. `GET /api/decisao/carta?carta=SIGLA-N` (aberta, como as outras
  leituras do Plane) devolve isso, mais `escrita: {habilitada, motivo}` e as pendências da carta.
- **Efeitos** (`efeitos.js`), lista fechada: `destravar` (tira `ASTARGNE`/`DONO` e troca só o
  marcador `(ASTARGNE…)`/`(DONO…)` da descrição por `(decidido em DD/MM: …)`), `produto`
  (`manter`/`por`/`tirar`), `estado` (um dos cinco). O marcador vive num nó de texto: vai de
  `(ASTARGNE`/`(DONO` ao `)` que o fecha, com parênteses aninhados e sem atravessar `<`; um que
  não fecha antes da tag não se troca (aviso), e mais de um marcador recusa o preparar. A troca
  é por posição (nunca `String.replace` com a decisão: `$&`, `$'` e `` $` `` entram literais), e
  a verificação exige o marcador fora e o texto novo presente. O pedido vira um delta por NOME;
  avisos quando a carta fica despachável ou segue com `PRODUTO`. A versão da carta é a
  **digital** do conteúdo (estado, ids das labels, nome, hash da descrição, ids e `edited_at` dos
  comentários, `archived_at`, pai e módulos), porque o `updated_at` do Plane muda sozinho.
- **Protocolo** (`protocolo-decisao.js`): o comentário `DECISAO/v1` é HTML com o primeiro
  parágrafo fixo `<p><strong>DECISAO/v1</strong> · Painel Admin (C-3PO) · decisão do dono</p>`
  e um parágrafo por campo — `Carta`, `Decisão`, `Motivo`, `Efeitos`, `Data` (ISO) e
  `Autor: Astargne via painel` —, com `external_source: painel-decisao-v1` e
  `external_id` = a chave da decisão. O recibo `DECISAO-APLICACAO/v1` (`Resultado`,
  `Mudanças verificadas`, `Notas`, `Data`) usa `external_id` = `<chave>:aplicacao`. **Para um
  zelador, só é recibo do dono** o comentário com esse cabeçalho, essa fonte, ator = o UUID de
  `PLANE_ADMIN_ACTOR_ID` e `edited_at` nulo (`lerDecisao`). A prosa do dono passa por NFKC, perde
  caracteres invisíveis, é escapada e não pode conter `GATE/`, `HANDOFF/`, `ZELADOR/`, `[ORQ/`,
  `DECISAO/`, `COMPACTADO/`, `PERFIL-IA/` nem `TENTATIVA/` — régua que vale para TUDO o que vai
  ao comentário fora do cabeçalho (o marcador da carta na linha de Efeitos inclusive), no
  preparar e de novo no escritor; texto com cara de segredo (`acoes/filtro-segredo.js`, com os
  valores do ambiente real do processo, só para comparar) é recusado sem ecoar o trecho. O Plane
  passa o HTML pelo `nh3` ao gravar (entidades de aspas viram aspas); a leitura decodifica as
  entidades numa passada só (`&amp;#71;` é o texto `&#71;`, nunca `G`).
- **Escritor** (`escritor-decisao-plane.js`), identidade **Painel Admin (C-3PO)**, ADMIN do
  workspace — por isso o que ele aceita é a proteção: comentário só no formato da mesa, PATCH
  só com `labels`, `state` e `description_html`, só nos projetos da mesa (Anya
  e CKBL recusados de novo por id). A chave mora em `~/.config/plane/painel-admin.token`, lida UMA vez por
  operação (`abrir()`: aberta com `O_NOFOLLOW`, conferida pelo `fstat` do descritor — arquivo
  comum, sem bits de grupo/outros, dono = o usuário do processo —, `/users/me` =
  `PLANE_ADMIN_ACTOR_ID` com essa cópia, e a mesma cópia em todas as chamadas da operação);
  nunca entra em `process.env`, log nem mensagem. Nenhum pedido com chave segue redirecionamento
  (`redirect: 'error'`; idem os escritores de handoff, gate, estado e zelador e os leitores
  Guest).
  O 409 do comentário (o Plane procura o `external_id` no PROJETO) só vale como idempotência se
  o comentário relido pelo caminho da carta é da mesa, do ator e da chave.
- **Duas ações** (`api-decisao.js` sobre `criarDesafios` + `criarApiDuasAcoes`, autorizador SSO
  do dono): `POST /api/decisao/preparar` {carta, decisao, motivo, efeitos} relê a carta, recusa
  carta sem decisão do dono, com lease ativo da orquestração ou com aplicação pendente, e
  devolve as mudanças e o texto do comentário; nada é gravado. `POST /api/decisao/confirmar`
  {confirmacaoId} grava (abaixo). Retomar: `POST /api/decisao/retomada/{preparar,confirmar}`
  {chave}; abandonar: `POST /api/decisao/abandono/{preparar,confirmar}` {chave}.
- **Ordem do confirmar** (`aplicacao-decisao.js`), sob a trava global da orquestração e com um
  teto de 40 s para o lote de chamadas: identidade (a sessão do escritor) → início da janela das
  atividades → releitura; digital igual ou recusa → lease
  → delta igual ao do preparar e ids resolvidos por nome → diário `DECISAO_PENDENTE` →
  comentário de intenção (timeout não segue; 4xx explícito fecha como `DECISAO_ABANDONADA`) →
  `COMENTARIO_GRAVADO` → releitura → um PATCH = releitura ± delta (só os campos que mudam) →
  releitura de verificação, qualquer que tenha sido a resposta: `aplicado`, `não aplicado`,
  `divergente` (ou `só registro`) → atividades da carta: alteração de outro ator desde a
  releitura vira `divergente` → recibo (se o recibo já estava na carta, o 409 traz o resultado
  dele, e é ele que vale) → `DECISAO_CONCLUIDA` (com quem) → `limparCachePlane()`. Antes do
  comentário, toda falha é recusa limpa ("nada foi gravado"); depois dele o rótulo vem da
  FASE, não do erro: qualquer falha é "resultado incerto" e a decisão fica pendente.
- **Retomada** (`retomada-decisao.js`). `GET /api/decisao/pendentes` lista as decisões sem
  `CONCLUIDA`/`ABANDONADA`; a gaveta e a aba Decisões mostram "aplicação pendente" com
  "Retomar" e "Abandonar" (SSO + duas ações, a mesma chave). A retomada primeiro reconfere o
  registro do diário (editável): projeto pelo catálogo, prosa e pedido pela régua do preparar,
  delta coerente com o pedido, HTML refeito igual — senão recusa. Depois relê a carta: segue só
  se ela é a da decisão (mesma digital, sem lease, ainda esperando decisão, pendência com até
  24 h) — com o delta RECALCULADO contra a carta de agora, que é o que a tela mostra — ou já é
  a carta com o delta aplicado (`digitalAplicada`, guardada no confirmar: a queda veio depois do
  PATCH, falta o recibo). Mudou: com o comentário na carta, recusa e manda abandonar; sem ele
  (`PENDENTE`), abandona sozinha sem gravar. **Abandonar** fecha qualquer pendência
  (`DECISAO_ABANDONADA` com quem) e, se o comentário de intenção estiver na carta, grava nela
  um recibo "abandonada" — de melhor esforço: carta 404, projeto congelado ou Plane fora não
  impedem fechar.
- **Diário**: `~/.local/state/painel-admin/c3po/decisoes.jsonl` (`anexarJsonl`), com quem, a
  decisão, o delta, o HTML, a digital e a `digitalAplicada`. Ilegível é falha LOCAL (503, a
  mensagem diz o arquivo), nunca "o Plane".
- **O que não garante (resíduo).** (1) Entre a última releitura e o PATCH há uma janela de
  milissegundos que o Plane v1 não fecha contra escritores de fora do painel (MCP, Codex,
  tela): o PATCH de labels apaga e recria. As atividades lidas depois (desde antes da primeira
  releitura sob a trava, o que cobre também a janela releitura → POST do comentário) só a
  tornam visível; elas são gravadas por um worker em segundo plano, então a marca é de melhor
  esforço. (2) No Plane
  v1 o POST de comentário aceita `created_by` no corpo: quem pode comentar no projeto consegue
  forjar o ator. O recibo do Plane é sinal, não prova; a prova é o diário local.
- **Front** (`publico/mesa-decisao.js`, `mesa-conversa.js`, `mesa-decisao.css`): a gaveta, um
  componente só, abre pelo botão "Discutir com o C-3PO" dos popups de decisão do Hangar
  (`[data-mesa]`, escutado no documento) e das linhas `ASTARGNE` da aba Decisões. À esquerda a
  carta; à direita o chat (`/api/conversa`, sessão por carta em `sessionStorage`, volta onde
  parou; na primeira abertura o C-3PO lê a carta e diz a pergunta e o que ela trava) e o
  registro. "Pedir rascunho" preenche decisão e motivo a partir de um JSON pedido ao C-3PO;
  qualquer outra chave da resposta é descartada e os efeitos voltam desmarcados.
- **Conversa** (PAINEL-65, 06/11/2026; `decisao/propostas-decisao.js`,
  `publico/c3po/decisao-proposta.js`): quando o dono decide no chat (C-3PO, popup do Hangar ou a
  própria gaveta), o C-3PO chama `propor_decisao` e o chat desenha o cartão "Decisão proposta"
  com decisão, motivo e os **efeitos propostos pelo C-3PO em destaque** — aqui, e só aqui, os
  efeitos vêm do modelo (decisão do dono; na gaveta continuam desmarcados). O cartão chama
  `POST /api/decisao/preparar` ao nascer (nada é gravado; mostra as mudanças, o comentário e os
  avisos calculados pelo servidor) e "Gravar no Plane" chama `/confirmar`: **um toque**, a mesma
  sessão do dono e o mesmo caminho de escrita, sem rota nova. O cartão mostra o título lido no
  Plane (é ele que diz QUAL carta o identificador aponta). Preparo vencido (2 min) no toque:
  prepara de novo e só grava direto se a `versao` da carta (a digital, que o preparar devolve
  desde 06/11/2026: muda com comentário, descrição, título, labels e estado), as mudanças e os
  avisos são os que estavam na tela; senão mostra o novo e espera outro toque. O 409 da mesa tem
  dois sentidos e só o texto os separa: "recusado; nada foi gravado…" deixa preparar de novo; o
  resto é resultado incerto e manda para a aba Decisões, sem repetir. Só três cartões preparam
  sozinhos a cada 2 min (cada preparo é um ssh do autorizador e um desafio pendente); os outros
  esperam o toque em Preparar. Na gaveta, o turno de abertura (que o painel manda sozinho) e o
  de rascunho não fazem nascer cartão: só turno digitado pelo dono. O desfecho aparece no cartão; o C-3PO não o
  conhece e nunca diz que gravou (se precisar, relê a carta). Sem sessão (loopback) o cartão
  explica e não oferece Gravar. A proposta em si não deixa rastro: o diário e o Plane só
  recebem o que o toque gravou.
