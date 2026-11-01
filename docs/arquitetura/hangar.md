# Hangar (`hangar/`, `hangar.css`, `vendor/three/`)

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Tela de entrada desde 28/10/2026 (plano em `~/.claude/plans/lovely-dancing-hamster.md`,
estilo holo-3D escolhido pelo dono no mock v7). Mapa fixo: docas no centro (4,
só naves em trabalho), fábricas de droids ao norte (Claude, Codex, Grok),
Oficina central a leste (acervo compartilhado), pátio do Plane a oeste (uma vaga
por projeto do catálogo). **Só leitura**, com três exceções por SSO + duas
ações: a liberação do jogo nativo, o play e o registro da encomenda de nave (abaixo).

- **Dados.** `GET /api/hangar` (`coletores/hangar.js` sobre `lerBacklog`,
  cache de 60 s do Plane): por projeto, peças = módulos com abertas/em
  andamento/feitas (canceladas fora), próximas fases (cartas abertas na ordem
  do Plane), decisões, o mapa UUID da carta → peça e o reverso `SIGLA-N` → UUID. Decisão = carta aberta
  que espera o dono: label `PRODUTO` vai para a **estação de planejamento**,
  `ASTARGNE` (ou a legada `DONO`) vira **peça no chão** do módulo (cada decisão no popup leva
  "Discutir com o C-3PO", que abre a gaveta da mesa, [decisao.md](decisao.md) — a única porta de escrita a
  partir do Hangar, e ela mora fora dele); bloqueio por
  outra carta, `TAREFA DONO`, `EMPÍRICA` e `SEM ESCOPO` ficam fora (`../../PADROES-BACKLOG.md`), e nave congelada não tem peça no chão. Mais o
  inventário da Oficina (`acervo.js`: `PADROES-*`, orientações da raiz,
  skills, `licoes-vivas/`). `GET /api/hangar/sessoes` (`coletores/sessoes.js`,
  feito para poll de 5 s, memo por mtime): processo vivo em `/proc` é só
  portão por IA (o VS Code abre a CLI na pasta-mãe e o app-server do Codex
  hospeda várias conversas); a sessão é o transcript (`~/.claude/projects`,
  `~/.codex/sessions`) com evento nos últimos 15 min — o mtime não basta,
  a CLI regrava metadados sem timestamp. O Codex guarda a sessão na pasta do
  dia em que ela nasceu e o app desktop a deixa aberta por dias: a árvore
  inteira é varrida por mtime. A cauda (`transcript-cauda.js`) começa em
  384 KB e dobra até ter 60 linhas úteis (teto 32 MB); linha acima de 256 KB
  é saída com screenshot em base64 e é pulada sem decodificar. Projeto = último caminho tocado
  que cai num projeto do catálogo, senão o `cwd`, senão o projeto da carta.
  **Carta da sessão** (PAINEL-57) = a última vista, guardada por sessão
  mesmo depois de sair da cauda, de quatro fontes: MCP `plane` (`issue_id`);
  e, só no texto do comando (Bash do Claude, `cmd` do `exec` do Codex; nunca
  prompt, resposta ou corpo de patch), a ponte REST do projeto
  (`plane-testcase.mjs read 94`: número + sigla do dono do script, do caminho
  do comando ou do `cwd`), a URL `/issues/<uuid>/` do Plane e `SIGLA-N` com
  sigla da lista branca do catálogo (`sigla` em `projetos.js`; `UTF-8` e
  `SHA-256` não são carta). Carta por `SIGLA-N` vira UUID no front pelo índice
  reverso `identificadores` da nave (`coletores/hangar.js`). Sub-sessão "guardian" do Codex e qualquer coisa em
  `Exitlag/` ficam fora.
- **Privacidade (regra 5).** O painel abre pelo tailnet e o transcript pode
  ter segredo colado: do transcript só saem nome de ferramenta, caminho
  relativo ao projeto, nome do programa (sem argumento) e a carta (UUID ou
  `SIGLA-N`) —
  nunca prompt, resposta ou argumento (`acoes-sessao.js`; prova em
  `test/hangar.test.js` com um segredo no prompt e no comando). Título do
  Plane passa por `esc()` antes de virar HTML.
- **Front.** Módulos ES (escopo próprio, sem colidir com os globais dos
  scripts clássicos): `dados.js` (busca), `simulacao.js` (sessão → droid,
  ação nova → ida à bancada, à nave ou à Oficina; docas rebocam a nave em
  demanda e a devolvem 45 s depois do último droid), `cena.js` (Three r128
  vendorizado + bloom; sem WebGL, aviso e painéis seguem), `rotulos.js`,
  `conteudo.js` (popups do C-3PO), `interface.js`, `narrador.js` (falas
  prontas, sem LLM; o retrato abre `/c3po/`), `formas.js` (6 peças de corpo,
  6 acessórios e contêineres do 13º módulo em diante). O preenchimento da
  peça é sempre a fração do Plane; os droids não mexem nele. Fora da aba ou
  com a janela oculta, poll e animação param. `prefers-reduced-motion`
  desliga os voos. Paleta: sempre escura, no cobre-âmbar do tema escuro da
  camada Protocolo (tokens `--hg-*` em `tokens.css`; as cores da cena em
  `cena.js` e `estado.js`, que precisam acompanhar à mão). `estado.js` define
  `COR_PAPEL` (orquestração, codificação, validação, zelador) e `corDroid`: o droid
  zelador (F3) usa a do papel; sessão humana não tem papel e mantém a cor da fábrica.
- **Frota em leitura.** A fábrica (cena ou lista lateral) abre o popup com a
  frota atual (`GET /api/orquestracao/frota`, lida junto com `/api/hangar`);
  trocar é só na sub-aba Frota.
- **Play por nave e o droid zelador** (`play.js`, F3, 31/10/2026). O popup da vaga e da doca de
  toda nave com Plane tem o play: marcar só prepara, gravar é a segunda ação, por SSO, nas duas
  direções (o mesmo bloco do "Steam livre"); suspenso por divergência aparece com o motivo e
  religar é a saída. Embaixo, o que o último job do zelador deixou; quando só sobram decisão e
  tarefa do dono, o bloqueio fica em destaque no popup e como chip "bloqueio: só o dono" no painel
  lateral, com as cartas. O droid zelador nasce do job (`GET /api/orquestracao/zelador`, lido com o
  poll de 5 s das sessões): sai da fábrica do provedor, vai à vaga do projeto no pátio (não reboca
  a nave para a doca) e volta quando o job termina; pinta pela cor `COR_PAPEL.zelador` e o popup dele
  mostra a fase e o diário do job.
- **Conversa no popup** (`conversa.js`, 29/10/2026). Todo popup tem a caixa
  "Pergunte ao C-3PO sobre isto": a pergunta vai a `POST /api/conversa` com o
  olho e o título do popup na frente, como texto (o C-3PO não vê a cena), e a
  resposta em SSE entra como texto puro. A sessão é a `c3po-sessao` do
  `sessionStorage`, a mesma do `/c3po/`, que continua a conversa com voz. O
  parser de SSE é o de `c3po/fluxo-sse.js`, importado como módulo. Trocar de
  objeto ou fechar o popup aborta a resposta em curso. A rota é a mesma do
  `/c3po/`, aberta sem SSO por decisão do dono (`docs/invariants.md`).
- **Jogo nativo por nave** (`nativo.js`, PAINEL-59, 29/10/2026). Projeto com
  `jogoNativo` no catálogo (hoje só o CKBL) ganha no popup da vaga e da doca
  o interruptor "Steam livre": o teste no jogo toma a tela e a conta da Steam
  e derruba a sessão do dono se ele estiver jogando com a mesma conta. Marcar
  ou desmarcar só prepara; gravar é a segunda ação, por SSO, nas duas
  direções. Ligar escolhe 2, 4, 8 ou 12 h e vence sozinho
  (`orquestrador/liberacao-nativa.js`, arquivo `liberacao-nativa.json` no
  estado da orquestração, gravado por tmp + rename e serializado no
  processo). `GET /api/orquestracao/nativo` é aberto e não diz quem ligou;
  arquivo ilegível, forma estranha ou prazo vencido contam como desligado.
  Quem consome hoje é o pré-flight nativo do CKBL
  (`docs/native-test-strategy-20261017.md` de lá); o executor da frota ainda
  não abre jogo (PAINEL-34).
- **Encomenda de nave** (`encomenda.js`, PAINEL-50, 31/10/2026). O berço (a
  próxima vaga do pátio) pede nome (1–60), sigla opcional (2–6 maiúsculas, sem
  colidir com `sigla` do `projetos.js` nem com outra encomenda pendente) e
  módulos (1–20 linhas, 1–80 cada, sem repetir); sem caractere de controle.
  "Revisar" é o `POST /api/hangar/encomendas/preparar` (valida no servidor e
  devolve o resumo, sem gravar); "Confirmar" é o `…/confirmar`, com a mesma
  sessão do dono, que acrescenta a linha `pedida` (id, quando, usuarioId, nome,
  sigla, módulos) em `<estado>/encomendas.jsonl` por `anexarJsonl`, serializado
  no processo e com a sigla reconferida na gravação. `GET /api/hangar/encomendas`
  é aberto e devolve as pendentes (`pedida` sem `atendida` do mesmo id depois)
  sem `usuarioId`; arquivo ilegível mostra nada pendente e o preparar recusa. A
  vaga e a lista lateral mostram "pedida em <data>, aguardando o orquestrador";
  o C-3PO lê a mesma lista pela ferramenta `encomendas`. Módulos em
  `encomendas/` (validação, leitura, registro, duas ações); a porta
  `encomendas.js` reexporta só a leitura, e o fecho do motor não alcança quem
  grava (`test/fronteiras-modulos.test.js`). O painel não cria projeto nem
  reescreve linha: quem atende é o orquestrador (`operacao.md` § Encomendas de
  nave). Teste: `test/encomendas.test.js`.
