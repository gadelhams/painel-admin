# motor.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta da conversa. O catálogo das catorze ferramentas (onze de leitura, entre elas `encomendas`, `diario_zelador` e `carta_plane` desde 31/10, mais `propor_acao`, `propor_memoria` e, desde 06/11/2026, `propor_decisao`) mora em
`motor/ferramentas.js`; o envelope de falha do coletor, em `motor/envelope-coletor.js`;
a leitura de `.md`, em `motor/doc-projeto.js`; a voz, em `motor/persona.js`. `tools: []` continua
aqui, e também o isolamento do processo do modelo (PAINEL-52, 28/10/2026): `env` por lista
branca (`AMBIENTE_PERMITIDO`: o login em `~/.claude` e o básico; nenhum segredo do `.env`),
`settingSources: []` e `strictMcpConfig` (nada de settings, hooks, MCPs ou CLAUDE.md do disco).
Teste: `test/motor-ambiente.test.js`.

Claude Agent SDK (`claude-sonnet-5` fixo), persona do
C-3PO, ferramentas **só-leitura** (a lista abaixo é de 01/10/2026; desde então entraram `decisoes`, `alinhamento`, `consulta_ssh`, `git_projeto`, `propor_acao` e `encomendas` ([hangar.md](hangar.md)), abaixo): `estado_projetos`,
`estado_producao` (coletores internos), `docs_projeto` (só `.md` da raiz,
allowlist estrita — mecânica em `coletores.js`) e `fila_orquestracao`
(projeção do Plane; ver [orquestracao-v2-integracao.md](../orquestracao-v2-integracao.md)). Esta última
mantém a mesma ferramenta MCP e oferece três modos só-leitura: fila com gate,
triagem DEV das abertas sem gate e pré-checagem DEV/TEST de um card. A resposta
é limitada a 30 cartas por consulta; para escopo/aceite, o motor deve ler os
documentos modeladores, não transformar categoria em decisão de produto. O modo
fila também traz o resumo por projeto (candidatas, elegíveis, impedimento) e
`comoAFrotaPuxa`, o texto fixo de `consulta-c3po.js` que responde "por que a
frota não puxou" (muda junto com o código do play e do puxar).

Fila, triagem e decisões varrem o Plane inteiro (15–35 s cada). Nas ferramentas
do C-3PO elas passam por `motor/leitura-pesada.js`: uma de cada vez, leitura em
curso compartilhada, resultado válido por 2 min, falha não guardada. Em todo o
processo, `plane/cliente.js` limita a 6 os GETs abertos ao Plane e só conta o
prazo de 15 s depois da espera (31/10/2026: em rajada, chamadas passavam do
prazo e o C-3PO respondia "aborted due to timeout").


**Fase 3 (31/10/2026, PAINEL-2/-3/-4; decisão do dono).** Duas leituras novas e uma
ação com portão:
- `consulta_ssh`: a mesma `LeituraSsh` e a mesma lista `CONSULTAS_SSH` da rota
  `/api/producao/ssh` (fonte única; o teste falha se o texto de um comando aparecer
  em outro módulo). Sem argumento.
- `git_projeto`: `coletores/git-leitura.js`, só projeto do catálogo por `pasta` e só
  três leituras fechadas (`status --short`, `diff --stat`, `log --oneline -n 15`);
  `execFile` sem shell, `GIT_OPTIONAL_LOCKS=0`, ambiente por lista branca, 10 s,
  6 000 caracteres, filtro de segredo. Diff de conteúdo fica de fora.
- `propor_decisao` {carta, decisao, motivo?, destravar, produto?, estado?} (PAINEL-65,
  `motor/decisao-proposta.js` sobre `decisao/propostas-decisao.js`, pela porta `decisao.js`):
  confere a carta (`cartaDaMesa`), a prosa (`validarProsa`) e os efeitos (`validarPedido`) pela
  régua da mesa, guarda a proposta em memória por 30 min (teto de 50) e devolve o id; não lê nem
  grava o Plane. `motor.js` emite `proposta_decisao` só para o `tool_use_id` dessa ferramenta e
  com o que o REGISTRO guarda, nunca com o texto do resultado (uma carta ou um doc com JSON de
  proposta dentro não vira cartão). O resto é do cartão: [decisao.md](decisao.md) § Conversa.
- `propor_acao` {projeto, comandoId}: `acoes/propostas.js` confere catálogo e
  contrato `.orquestrador.json` (`comandoPermitido`, a mesma lista fechada do
  executor de cartas; sem contrato, recusa nomeada), guarda a proposta em memória
  por 30 min e devolve o id. `motor.js` lê o resultado da ferramenta e emite o
  evento SSE `proposta` (só se o registro conhece o id); o chat (`/c3po/`, console
  e popup do Hangar) mostra o cartão de `publico/c3po/acao-proposta.js`.
- O dono executa: `POST /api/acoes/preparar` {propostaId} relê o contrato e mostra
  projeto, pasta, executável e argumentos; `POST /api/acoes/confirmar`
  {confirmacaoId}, na mesma sessão, roda uma vez (`acoes/api-acoes.js` sobre
  `criarDesafios` + `criarApiDuasAcoes`; desafio de 2 min). `acoes/executor-acoes.js`:
  uma ação por vez (a segunda recebe 409, nem prepara), `ProcessoCli` (spawn sem
  shell, grupo morto no tempo do contrato, 20 min), `ambienteLimpo`, saída capada
  e passada por `acoes/filtro-segredo.js` (o `redigirSegredo` da aba Contas mais
  atribuições `*KEY*=`, formatos de chave e o valor literal das variáveis de
  segredo do painel). A proposta é de uso único. O que não garante: o comando
  roda sem sandbox, como o usuário do serviço, no checkout principal do projeto
  (não num worktree), e o filtro só pega o segredo que reconhece.
- Diário: `~/.local/state/painel-admin/c3po/acoes.jsonl` (`anexarJsonl`), uma linha
  por etapa — `proposta`/`proposta-recusada` (quem `c3po`), `preparo`,
  `confirmacao` (antes de rodar; sem diário, não roda) e `resultado` (código,
  sinal, duração, resumo de 500 caracteres filtrado), com o `usuarioId` da sessão.

Ferramenta `carta_plane` (31/10/2026, PAINEL-53): lê UMA carta agora, sem cache, pela porta
`decisao.js` (título, estado, labels, descrição e os últimos 30 comentários em texto; os da mesa
marcados), com a chave Guest. É o que o C-3PO usa na gaveta da mesa de decisão ([decisao.md](decisao.md)).

**Memória L1 e reflexão noturna (31/10/2026, PAINEL-8 e PAINEL-9; decisões do dono).**
Arquivos em `~/.local/state/painel-admin/c3po/`; código em `memoria/`:
- `MEMORIES.md`: Markdown simples, UTF-8, teto de 8 KB (`memoria/arquivo-memoria.js` lê,
  com estado `ausente`/`ok`/`grande`/`ilegivel`; o hash sha256 do texto é a versão).
  `memoria-historico.jsonl`: uma linha por versão — quando, quem (`dono`, `reflexao`,
  `proposta-aceita`), origem (`dono`, `desfazer`, `c3po`, `reflexao`), `usuarioId`, hash
  antes/depois, diff unificado curto (4 000 caracteres), `foraDoPainel` (o arquivo foi
  editado à mão desde a última versão aplicada) e os dois textos, para desfazer por hash — só
  se o texto guardado bate com o hash. Cada versão nasce `rename: 'pendente'` e um evento
  depois diz o desfecho (`aplicada`/`nunca-aplicada`); versão sem desfecho (queda entre o
  histórico e o `rename`) é reconciliada pelo hash do arquivo na gravação seguinte, sob a
  trava. Linha ruim no meio do histórico não derruba as anteriores: a tela as mostra, diz a
  linha, e desfazer para elas continua possível. A tela avisa "editada fora do painel"
  quando o arquivo não é o da última versão aplicada; só versão aplicada tem "Desfazer".
- Escrita só em `memoria/escritor-memoria.js`: trava entre processos (`mkdir` de
  `.memoria.trava`, `memoria/trava.js`; a velha, após 60 s, é recuperada por `rename` para um
  nome único, e só quem consegue o `rename` a recria), base conferida sob a trava, histórico
  antes do `rename` (nunca versão atual sem registro). A pendente da reflexão só se apaga se
  ainda é a que o dono viu (`rename` condicional e `link` de volta).
- Motor: `motor.js` lê a L1 a cada turno e a põe no fim do `systemPrompt` por
  `motor/memoria-l1.js` — regra de tratamento fora do bloco, texto dentro de
  `<memoria_l1>`, com a marca neutralizada se aparecer no texto em qualquer forma de tag
  (`memoria/marcas.js`: NFKC, sem invisíveis, entidades de `<`/`>` decodificadas, e o `<` vira
  `‹`) — texto hostil não fecha o bloco. `propor_memoria` {motivo, acrescentar | de+para} (`motor/memoria-proposta.js` sobre
  `memoria/propostas-memoria.js`): monta a L1 nova contra a atual, guarda 30 min em memória
  e devolve id, base e diff; o SSE emite `proposta_memoria` e o chat mostra o cartão de
  `publico/c3po/memoria-proposta.js` (no `/c3po/`, no console e no popup do Hangar).
- Dono: `GET /api/c3po/memoria` (texto, estado, hash, bytes, 10 últimas versões sem os
  textos, pendente da reflexão); `POST /api/c3po/memoria/preparar` {base, origem, valor} —
  origem `texto` (edição), `proposta` (cartão do chat), `reflexao` (pendente) ou `versao`
  (desfazer: hash de um texto do histórico) — mostra o diff contra a base e recusa segredo
  pelo `filtrarSegredo`; `POST /api/c3po/memoria/confirmar` {confirmacaoId} grava uma vez e
  recusa (409) se a base mudou. Painel "Memória do C-3PO" no `/c3po/` (`#memoria` abre
  direto; o popup do Hangar tem o link).
- Diário de conversas (`conversas.jsonl`, `memoria/conversas.js`): até 31/10 o painel não
  registrava conversa (só a transcrição própria do SDK em `~/.claude/projects`, com
  resultado cru de ferramenta). `http/conversa.js` anota, ao fim de cada turno **que trouxe a
  sessão SSO do dono** (`SessaoPainel.ler`, estado `dono`; decisão do integrador, 31/10/2026 —
  a rota segue aberta, mas o loopback, um processo local ou o executor não alimentam a
  reflexão), pergunta (600) e resposta (1 200) truncadas e filtradas de segredo; a reflexão
  poda o que passou de 14 dias. Uma conversa anotada durante a poda pode se perder (a poda reescreve às 03:30).
- Reflexão (`scripts/reflexao-noturna.mjs` → `memoria/reflexao.js`, timer de usuário
  `deploy/painel-reflexao.timer`, 03:30): uma por noite — data local nova E 20 h desde a última
  execução; a linha `iniciada` entra em `reflexao.jsonl` ANTES da CLI, e a do resultado depois
  (queda no meio não roda de novo); frota com bloco zelador `ok` e provedor
  `claude`, senão recusa; sem conversa nas últimas 24 h, `sem-insumo` sem CLI. Roda
  `claude -p --output-format json --model/--effort` do zelador, `--system-prompt` próprio,
  `--restricted --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}'
  --no-session-persistence --disable-slash-commands --max-turns 1`, `ambienteLimpo`, cwd num
  diretório vazio, insumo por stdin, 10 min. O insumo (memória e conversas) passa pelo filtro
  de segredo e pela neutralização das marcas (`<<<MEMORIA>>>`, `<<<FIM>>>`, `<<<SEM MUDANCA>>>`
  e as tags do bloco) e corta pelo começo: estourou 60 000 caracteres, ficam as conversas mais
  novas. Pede a L1 inteira entre marcas (exatamente um par) e aplica (quem `reflexao`) só se
  mudou, cabe no teto, passa no filtro de segredo e apaga até 30% — contra o texto de antes E
  contra a última versão aplicada gravada pelo dono (`dono` ou `proposta-aceita`, ambas com
  SSO; decisão do integrador, 31/10/2026), para noites seguidas não apagarem aos poucos;
  apagar mais grava `memoria-pendente.json` para o dono aceitar; segredo recusa sem diff no
  diário. Cada execução deixa em `reflexao.jsonl` a linha `iniciada` e a do resultado
  (motivo, modelo, conversas usadas e na janela, frações apagadas, diff filtrado, custo). Testes: `test/memoria.test.js`, `test/reflexao.test.js`,
  `e2e/tests/c3po-memoria.spec.mjs`.

Ferramenta `decisoes` (24/10/2026, pedido do dono): `decisoes-c3po.js` dá ao
C-3PO a mesma leitura da aba Decisões e do bloco "Astargne" — grupos
`dono_*` (chaves, push/deploy, provas, produto), `bloqueada_pelo_dono` (cadeias
que uma decisão dele destrava), `bloqueada_por_terceiro`, `rotacao_registrada`
(já feita na aba Chaves, card a fechar), pós-playtest e sem escopo; projetos
`congelado` ficam de fora. Só leitura (inventário de chaves sem valores); o
vínculo entre cards vem do detalhe da etiqueta, não de um grafo formal.
