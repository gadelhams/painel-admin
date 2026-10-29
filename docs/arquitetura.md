# painel-admin — arquitetura (texto de referência)

Texto preservado do `CLAUDE.md` até 01/10/2026 (F3 do
`../../../PLANO-CONTEXTO-POR-TAREFA.md`), reorganizado em um título por
arquivo. **Estado atual mora em [`current.md`](current.md)**; regras numeradas
em [`invariants.md`](invariants.md); como roda e a voz fora de casa em
[`operacao.md`](operacao.md); o original íntegro em
[`historico/CLAUDE-ate-2026-10-01.md`](historico/CLAUDE-ate-2026-10-01.md).

**O que neste texto já não vale (adjudicação de 01/10/2026):**

- Os caminhos em crase deste texto são **relativos à raiz do projeto**
  (`painel-admin/`), não a `docs/`: `docs/00_PLANO.md`, `../CLAUDE.md`,
  `../../PORTAS.md` etc. foram escritos quando o texto morava em `CLAUDE.md`.
- "fácil de religar como 4ª aba" (grafo): seria a **5ª** — há quatro abas desde
  13/09/2026 (Contas).
- "A aba Backlog (quadro kanban só-leitura)": não é mais quadro multi-projeto
  desde 21/08/2026; mostra um projeto por vez (§ backlog.js).

- "uma célula por projeto do catálogo — 13 desde 29/09/2026": o catálogo tem
  **15** projetos desde 12/10/2026 (`SupervisorHandoff` e `CK3BannerLord`
  entraram, ambos com projeto no Plane) — ver `current.md`.
- "`docs/00_PLANO.md` e `docs/01_ESTADO.md` — plano e estado real": o
  `01_ESTADO.md` virou ponteiro; o estado está em `current.md` e o datado de
  13/09/2026 em `historico/01_ESTADO-ate-2026-10-01.md`.
- "mock hi-fi do dono em `design_handoff_painel_hud/`": a pasta não existe
  nesta máquina nem no git do projeto (narrativa datada do reskin de 21/08/2026).
- "de 29 a 30/09 foi `linear.js`, com o Linear": narrativa datada, verdadeira
  como história; o Linear não é mais fonte de nada aqui.
- Os módulos `orquestracao.js`, `orquestracao-core.js` e `publico/orquestracao.js`
  (primeira fatia, 11/10/2026) foram **removidos em 24/10/2026**: eram cópias
  divergentes de `orquestrador/politica.js`/`estado.js` que nenhum código vivo
  importava; o doc da fatia está em `historico/orquestracao-fatia1-ate-2026-10-20.md`.
- Tag `(DONO)`: desde 01/10/2026 o parser do doc 39 mapeia `DONO` para
  `ASTARGNE` (mudança em `coletores.js`, não commitada); o texto abaixo não a
  cita, mas o `PADROES-BACKLOG.md` sim.

## Arquitetura

### servidor.js

O processo só compõe os serviços e escuta em `127.0.0.1`. O despacho mora em `http/`: `roteador.js` depois da guarda, `rotas-painel.js` (projetos, produção, ssh, backlog, decisões, hangar, relações, contas e o redirecionamento do C-3PO, cada um no próprio arquivo), `rotas-orquestracao.js` (fila, triagem, canal, modelos, handoff, gate, despacho, consumo, vigília, legado e voz, cada um no próprio arquivo; a recusa genérica depois das rotas específicas), `rotas-voz.js`, `rotas-chaves.js`, `rotas-alinhamento.js`, `conversa.js` (SSE), `ssh-leitura.js` e `resposta.js` (compõe `resposta-json.js`, `arquivo-publico.js` e `corpo-limitado.js`). HTTP único em `127.0.0.1:7777`: `/api/projetos`,
`GET /api/projetos/:pasta/docs` (docs modeladores + curados de UM projeto;
`?arquivo=` lê um modelador específico — página de projeto, 20/08/2026),
`GET /api/projetos/:pasta/git` (diff --stat do working tree + commits não
enviados ao remoto de UM projeto — só sob demanda, mais pesado que o
resumo que os cards já usam; 20/08/2026), `/api/producao`,
`/api/producao/ssh`, `/api/backlog`, `/api/hangar` e `/api/hangar/sessoes` (Hangar, § abaixo), `/api/decisoes` (decisões derivadas
do backlog; idade = criação do work item no Plane, ou `git log -L` no
markdown do repo congelado, pesada — sob demanda, nunca no polling de 60s;
aba Decisões, 21/08/2026), `/api/relacoes` (catálogo de
`relacoes.js` — hoje fora da nav, ver abaixo), `POST /api/conversa` (SSE,
motor do C-3PO), `GET/POST /api/tts` (proxy ElevenLabs), `/api/contas/*`
(aba Contas — abaixo), `/api/orquestracao*` (GET fila, `triagem-dev`,
`prontidao`, `canal?carta&projeto`, `modelos`, `consumo`, `legado`; POST
`simular`, `modelos/validar`, `{modelos,handoff,gates,despacho}/{preparar,confirmar}`,
`voz/transcrever` — mecanismo em [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md); `GET /api/orquestracao/voz` → `{xai}` (só a presença da chave; o C-3PO cai para este motor quando o reconhecimento do navegador não existe ou falha — `operacao.md` § Microfone);
as rotas de escrita exigem SSO do Cadastro Único e confirmação em duas ações)
e estáticos de `publico/` (dashboard na raiz, chat em `/c3po/`).

### orquestrador/

O Orquestrador de Projetos (padrão em `../../ORQUESTRADOR-PROJETOS.md`), um
módulo por responsabilidade: `politica.js` (reexporta `contrato-politica.js`,
`prontidao.js` (marcas em `marcas-carta.js`, gate em `prontidao-gate.js`, despacho em `prontidao-despacho.js`) e `vigilia-politica.js`), `fila.js` (reexporta `dependencias-carta.js`, que junta `relacoes-formais.js` e `texto-dependencia.js`,
`fila-leitura.js` (a carta em `carta-da-fila.js`, o resumo em `resumo-fila.js`), `despacho-servico.js` (checagem em `checagem-despacho.js`, tentativa em `tentativa-despacho.js`), `simulacao-despacho.js`, `gate-servico.js` (pré-checagem em `preavaliacao-gate.js`, marcação em `registro-gate.js`), `handoff-servico.js`,
`perfil-servico.js` (consulta em `consulta-perfil.js`, registro em `registro-perfil.js`), `canal-carta.js`, `estado-carta.js` e `servico-orquestracao.js`), `estado.js` (recuperação; o lease em `arquivo-lease.js`, o diário em `diario-touchpoints.js`, a trava em `trava.js`), `modelos.js` (seleção por papel sem fallback e
flags de CLI), `canal-plane.js` (a forma do comentário em `interacao-canal.js`)/`perfil-plane.js` (texto em `protocolo-perfil.js`, escrita em `escritor-perfil-plane.js`)/`handoff-plane.js` (texto em `protocolo-handoff.js`, escrita em `escritor-handoff-plane.js`)/`gate-plane.js` (texto em `protocolo-gate.js`, escrita em `escritor-gate-plane.js`)
(protocolos versionados no card: leitura paginada, `PERFIL-IA/v1`, `HANDOFF/v1`,
`GATE/v1`, escritores restritos a um projeto), `sso.js` (reexporta `erro-acesso.js`, `sessao-cookie.js`, `origem-privilegiada.js`, `verificador-cadastro.js` e `autorizador.js`)/`confirmacoes.js`/`api-*.js`
(sessão do Cadastro Único por ssh, desafio de confirmação, rotas; desde 28/10/2026 o esqueleto das duas ações é um só, `desafio-duas-acoes.js` + `api-duas-acoes.js`, e perfil, gate, handoff, despacho, vigília e a troca de chaves só declaram o que validam e o que gravam), `triagem.js` (classificação em `classificar-prontidao-dev.js`, varredura em `varredura-triagem.js`)
e `consulta-c3po.js` (pendências DEV e a ferramenta do motor), `voz-xai.js` (transcrição),
`voz-eleven.js` (`ProxyElevenLabs`, a síntese; a chave não sai do processo),
`consumo.js` (a fonte do Codex em `fonte-consumo-codex.js`: `rate_limits` do evento mais recente das sessões; leitura com mais de 15 min vira "última leitura", e some quando a janela zera), **`executor-cli.js`** (o executor real; ambiente em `ambiente-cli.js`,
gramática de `scripts.test` em `gramatica-cli.js`, processo em `processo-cli.js`,
papel em `papel-cli.js` (argumentos em `argumentos-cli.js`, retrato em `retrato-cli.js`), briefing em `briefing-papel.js`, worktree em
`isolamento-git.js` e instalação em `dependencias-worktree.js`; três papéis de IA como
CLIs descartáveis — `claude -p` / `codex exec` — num worktree `orq/<carta>-<id>`
fora da árvore principal, comando de aceite do contrato sem shell, ambiente por
lista branca, timeout que mata o grupo, logs em `~/.local/state/painel-admin/orquestracao/saidas/<tentativa>/`;
moldes dos papéis em `briefings/`; só é construído com `ORQ_EXECUCAO_HABILITADA=true`)
**`canal-legado.js`** (a forma em `forma-canal-legado.js`, o processo em `processo-canal-legado.js`; daqui a escolha da config e o cache de 60 s — lê `SupervisorHandoff/scripts/estado_canal.py`, python
só-leitura, um processo por config — a prova de equivalência
do dashboard 7791 pedida por PAINEL-35), **`vigilia.js`** + **`api-vigilia.js`**
(varredura automática por projeto: o controle em `vigilia-controle.js`, a passada em `vigilia-varredura.js`, o passo de uma carta em `passo-vigilia.js`, o diário em `vigilia-diario.js` e `vigilia.js` só compõe; a cada dois minutos escolhe a primeira carta
elegível do projeto ligado, muda Todo → In Progress, grava o perfil padrão do
contrato se faltar, chama `iniciarDespacho` e, em `concluido`, troca `READY TO
DEV` por `READY TO TEST` com recibo ou leva `READY TO TEST` a Done; freios por
contrato, estado e diário em `vigilia/<projeto>.json|.jsonl`; ligar/desligar
por SSO em duas ações) e **`estado-plane.js`** (PATCH de estado do card pelo
grupo `started`/`completed`, opcionalmente tirando uma etiqueta, com releitura).

### contas.js

Porta. A tabela fechada mora em `contas/tabela.js`, o processo em
`contas/processo-ssh.js`, a redação em `contas/redacao.js`, a leitura da
saída em `contas/saida-central.js` e `contas/ssh.js` só reexporta. O cliente
e as rotas `/api/contas/*` ficam em `contas/fronteira.js`.

(13/09/2026, Fase 5 do `../../PLANO-CADASTRO-UNICO.md`) —
administração do **CadastroUnico** (login único do `astargne.com`). A API
interna do central (`/interno/*`, `127.0.0.1:8790`) só existe no loopback
**do servidor**, autenticada por `TOKEN_INTERNO` — e **o token nunca sai
do servidor**: cada ação da aba vira UM `ssh` (`spawn`, sem shell no PC,
chave `paroquia-vultr`, timeout 15 s) rodando um script fixo lá dentro que
lê o token com `sudo`, grava um config do `curl` em `mktemp` sob
`umask 077` (apagado por `trap … EXIT`), aborta com exit 97 se o token
não veio (`test -s`), e chama o central com `curl --max-time 10 -sS`. O
PC só vê `{ status, corpo }`. Tabela **fechada** de operações
(`OPERACOES`: método + rota), `:id` validado como inteiro positivo antes
de entrar na string, corpo JSON **só pelo stdin** (`curl -d @-`) — dado de
usuário jamais entra na linha de comando. Falha de ssh/script vira
`502 {erro:'sem acesso ao servidor'}`; **401 do central também é 502**
(`… (token interno recusado)`): o bearer nasce no servidor, então 401 só
significa encanamento quebrado, nunca "usuário sem permissão"; stderr vai
ao log mesmo com exit 0, redigindo qualquer `Bearer …` por defesa em
profundidade. Executor injetável (`{ executar }`) e binário injetável
(`criarExecutorSsh({ binario, timeoutMs, maxSaida })`) —
`test/contas.test.js` nunca chama ssh de verdade: o encanamento real
(stdin/EOF/timeout/teto) é provado com `node -e` como binário falso.


Papéis por app (24/10/2026, ADR-0006 do central): `/api/contas/apps` traz
`papeis` e `papelPadrao` por app; o editor de permissões e o convite mostram,
por app, uma seleção "sem acesso / papéis" e mandam `apps: [{app, papel}]`; os
chips mostram "App · Papel". Central antigo (sem papéis) cai no comportamento
anterior: checkbox entra/não entra. O backend do painel não muda (o corpo
passa pelo stdin do ssh como sempre).
### chaves.js

Porta. O catálogo mora em `chaves/catalogo.js`, o inventário em `chaves/inventario.js` (arquivo local em `inventario-local.js`, servidor em `inventario-servidor.js`),
o diário em `chaves/eventos.js`, a troca em `chaves/troca.js` (arquivo local em `troca-local.js`, servidor em `troca-servidor.js`) e `chaves/servico.js`
só compõe os três. A confirmação em duas ações fica em `chaves/confirmacoes.js`
e o HTTP em `chaves/api.js`.

(24/10/2026, decisão do dono) — a tela **Chaves**: inventário dos segredos por projeto
e a troca de valor pelo painel, para que o dono rotacione o que vazou sem abrir
terminal. `CATALOGO` declara, por projeto, o `.env` local (relativo a
`~/Work/ProjetosPessoais`, com a unit de usuário que reinicia), os caminhos
candidatos do `.env` no servidor (só `/opt/...`, com a unit do systemd de lá), as
variáveis conhecidas e a **rotação pendente** (card que a pediu, data, motivo, o que
fazer depois); `foraDoEnv` é segredo que vive no provedor ou na base — o painel só
registra que foi rotacionado. Só **nomes** saem do servidor: o inventário local lê os
arquivos e devolve nomes, presença e modo; o do servidor é UM ssh com script fixo
montado do catálogo (`sudo test -f` + `grep -oE '^NOME='`), cacheado até a próxima
leitura. A troca é em duas ações com SSO (`criarConfirmacoesChaves`): o valor viaja
uma vez, no corpo do `confirmar`, e termina no `.env` local (cópia `.bak` 600,
escrita atômica 600, `systemctl --user restart` da unit 1 s depois — se a unit for o
próprio painel, ele reinicia) ou no servidor (valor pelo **stdin** do ssh, `sudo
python3 -c` fixo que reescreve a linha com o dono e o modo originais e reinicia a
unit do catálogo; só o arquivo descoberto pelo inventário). O inventário devolve também
`rotacoesFeitas` (rotação do catálogo já satisfeita por evento): a aba Decisões a
usa para mostrar "rotação registrada — card a fechar" em vez de cobrar o dono, até
o orquestrador fechar o card no Plane. A escrita no servidor
só existe com `CHAVES_SERVIDOR_ESCRITA=true`, depois do APROVADO do
`validador-deploy`. O validador **REPROVOU** a 1ª versão (24/10/2026) e o código já
traz a correção mínima pedida: `bloqueado` (TOKEN_INTERNO do central e os
SSO_*TOKEN* que dependem dele — trocar um sozinho derruba player e fliperama),
`depois` obrigatório fora da rotação (DATABASE_URL do player: `ALTER USER` + mesma
troca no `.env` local, porque o deploy recria o do servidor), `servidor.aviso` por
unit no preparo (compose do filosofia/ragpt derruba conversas/jogo), ssh da troca
com teto próprio de 180 s (restart de compose passa dos 15 s do executor comum),
`os.umask(0o077)` e `.tmp` exclusivo no python remoto, dois candidatos existentes =
ambíguo (409, nomes não se misturam), valor para o servidor sem espaço/`#`/`$`/aspas
(env_file do compose truncaria), nome descoberto só no inventário (trocar exige
catalogar) e o EmuladorWeb como `foraDoEnv` (o token vive cru em
`secrets/sso-internal-token` e só muda pelo instalador). A 2ª rodada do validador
**APROVOU** (24/10, 13:46 UTC): flag ligada, master do servidor com a nota "Escritor
de `.env` fora do deploy" (§3) publicada pelo §8. Retenção (decisão do dono,
24/10): fica **só o `.bak` da troca atual**, local e no servidor — a troca seguinte
apaga os anteriores do mesmo arquivo (`.env.bak-*` também no `.gitignore`).
Residual aceito: restart de compose acima de 180 s vira `ROTACAO_INCERTA` falsa. Eventos em `~/.local/state/painel-admin/chaves.jsonl` nunca
levam valor; a pendência some quando há evento posterior à data do catálogo. O
bloco **Astargne** da aba Decisões (`publico/decisoes.js`) junta as rotações
pendentes com os cards abertos `ASTARGNE`/`TAREFA DONO`/`EMPÍRICA` em quatro grupos — chaves e
contas externas, push/deploy/sudo, tarefas suas (`TAREFA DONO` sempre cai aqui), decisões de produto — por etiqueta
e verbo do título (heurística dita na tela). O bloco é um `<details>` (aberto por
padrão; estado lembrado em `localStorage`), ignora projetos com `congelado: true`
no catálogo (`projetos.js`, propagado por `coletores.js`) e lista à parte as
rotações já registradas.

### alinhamento.js

Porta. `alinhamento/fio-medida.js` conta o fio, `alinhamento/git-medida.js` lê o git, `alinhamento/portao-docs.js` roda o check-docs e `alinhamento/regras-sinal.js` guarda as regras; `alinhamento/medidas.js` só reexporta. `alinhamento/cache.js` guarda o resultado, `alinhamento/fios.js` mede os
comentários e `alinhamento/sinais.js` junta `sinal-git.js`, `sinal-current.js` e `sinal-fio.js`. `alinhamento/varredura.js`
só percorre a lista.

(25/10/2026, decisão do dono) — rotina de **alinhamento código ⇄ Plane ⇄
painel**: mede a dívida em vez de deixá-la crescer em silêncio. A cada 30 min
(e em `GET /api/alinhamento?agora=1`) varre cada projeto não congelado e emite
sinais: `fio_longo` (card com ≥ 8 comentários desde o último `COMPACTADO/v1`,
regra do `../../PADROES-BACKLOG.md` § Compactação), `selado_sem_compactar`
(Done/Cancelled depois de 25/10 com comentário e sem a marca),
`current_atras` (`docs/current.md` datado > 7 dias antes do último commit),
`cita_fechado` (linha do `current.md` trata como pendente um card já
Done/Cancelled — menção histórica "X selada" não conta), `sem_push`,
`atras_remoto`, `check_docs` (portão do projeto com erro), `sem_current`,
`catalogo` (pasta ausente). Fios só se remedem para cartas cujo `updatedAt`
mudou (cache em `~/.local/state/painel-admin/alinhamento.json`); a varredura
inteira leva ~45 s com 450 cartas. Devolve também onde mora a documentação
**funcional / arquitetural / técnica / contrato** de cada projeto (primeiro
candidato existente por tipo). Só leitura: quem corrige é o orquestrador no
fecho. Consumidores: aba Docs (`publico/docs.js`) e a ferramenta
`alinhamento` do C-3PO.

### plane.js

Porta. `plane/cliente.js` consulta e guarda o cache; `plane/features.js` projeta
o workspace na forma do backlog.

(30/09/2026; de 29 a 30/09 foi `linear.js`, com o Linear) — o
backlog vem do **Plane** (instância própria no Omarchy, workspace
`astargne`, `https://plane.vpn.astargne.com`; a verdade desde a
migração; `../../PADROES-BACKLOG.md`): API v1 com o token do usuário
**"painel"** (`PLANE_API_KEY` no `.env`; papel Guest no workspace e em cada
projeto — lê tudo, e a API devolve 403 a qualquer escrita, conferido de
fora), e `montarFeatures` (pura, testada) devolve a mesma forma que o parser
de markdown produzia — módulo = feature (na ordem do `sort_order` do Plane),
sub-work item = filho, label de tag canônica = chip. A API não diz o módulo
de um work item: é uma consulta por módulo (~100 consultas no total, ~11 s
com o único worker do Plane), por isso o cache devolve o dado anterior na
hora e renova em segundo plano, uma renovação por vez. Falha vira
`erro_plane` nomeado, nunca lista vazia; a mensagem de erro nunca ecoa o
token. **Projeto novo no Plane só aparece depois de o usuário "painel"
entrar nele como Guest.**

### coletores.js

Porta única. A implementação mora em `coletores/`: `caminhos.js` (raiz e portão), `git-local.js` (git), `portas-locais.js` (escuta local), `estado-local.js` (o resumo dos dois), `leitura-md.js` (corte), `modeladores.js` (lista), `docs.js` (o projeto), `sonda-https.js` (o GET), `sondas.js` (o catálogo de produção), `parser-backlog.js` (markdown), `backlog.js` (montagem Plane/markdown), `idade-linha.js` (idade no git), `decisoes.js` (a lista), `catalogo.js` e os do Hangar (`hangar.js`, `sessoes.js`, `acervo.js`, `acoes-sessao.js`, `transcript-{cauda,claude,codex}.js`, § Hangar). Coletores de estado (git, portas, sondas de produção,
backlog, **leitura segura de docs modeladores por projeto**),
**compartilhados**. `RAIZ` é `~/Work` (dois níveis acima) e, desde a
reorganização de 30/09/2026, todo caminho passa por `dirDoProjeto()` =
`RAIZ/<area>/<pasta>`; `resolverDentroDaRaiz` só aceita as áreas de
`AREAS` (`ProjetosPessoais`, `ProjetosCompartilhados`) — **`Exitlag/`
(empresa) fica fora do alcance de propósito**, por nome direto ou por `..`
(`test/caminhos.test.js`): as rotas da API e as ferramentas do motor chamam as
mesmas funções — o motor nunca faz HTTP para o próprio processo.

### motor.js

Porta da conversa. O catálogo das seis ferramentas só-leitura mora em
`motor/ferramentas.js`; o envelope de falha do coletor, em `motor/envelope-coletor.js`;
a leitura de `.md`, em `motor/doc-projeto.js`; a voz, em `motor/persona.js`. `tools: []` continua
aqui, e também o isolamento do processo do modelo (PAINEL-52, 28/10/2026): `env` por lista
branca (`AMBIENTE_PERMITIDO`: o login em `~/.claude` e o básico; nenhum segredo do `.env`),
`settingSources: []` e `strictMcpConfig` (nada de settings, hooks, MCPs ou CLAUDE.md do disco).
Teste: `test/motor-ambiente.test.js`.

Claude Agent SDK (`claude-sonnet-5` fixo), persona do
C-3PO, quatro ferramentas **só-leitura**: `estado_projetos`,
`estado_producao` (coletores internos), `docs_projeto` (só `.md` da raiz,
allowlist estrita — mecânica em `coletores.js`) e `fila_orquestracao`
(projeção do Plane; ver [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md)). Esta última
mantém a mesma ferramenta MCP e oferece três modos só-leitura: fila com gate,
triagem DEV das abertas sem gate e pré-checagem DEV/TEST de um card. A resposta
é limitada a 30 cartas por consulta; para escopo/aceite, o motor deve ler os
documentos modeladores, não transformar categoria em decisão de produto.


Ferramenta `decisoes` (24/10/2026, pedido do dono): `decisoes-c3po.js` dá ao
C-3PO a mesma leitura da aba Decisões e do bloco "Astargne" — grupos
`dono_*` (chaves, push/deploy, provas, produto), `bloqueada_pelo_dono` (cadeias
que uma decisão dele destrava), `bloqueada_por_terceiro`, `rotacao_registrada`
(já feita na aba Chaves, card a fechar), pós-playtest e sem escopo; projetos
`congelado` ficam de fora. Só leitura (inventário de chaves sem valores); o
vínculo entre cards vem do detalhe da etiqueta, não de um grafo formal.
### projetos.js

Catálogo dos projetos: metadados que não dão para derivar
do disco, incluindo `area` (pasta de `~/Work` onde o projeto mora), o campo
`plane` (id do projeto no Plane — sem ele o projeto não aparece nas abas de
backlog; só o `_oldSistemaLoreEngine` usa ainda o campo `backlog`, de
markdown) e o campo opcional `docs` (arquitetura/objetos/dataFlow
— só nos projetos que já têm diagrama Mermaid vivo: `_oldSistemaLoreEngine`,
`Mapa Khorvaire`, `DiscordTranscriber`). **Mantenha em sincronia com o
`../CLAUDE.md` (mapa de `ProjetosPessoais/`) e com `../../PORTAS.md`**
quando um projeto nascer, morrer ou mudar de porta. As sondas que não são de um projeto (`PRODUCAO_EXTRA` e `conferirEscutaDoSSO`) moram em `producao-extra.js` e saem reexportadas daqui.

### relacoes.js

(21/08/2026) — relações estruturadas entre projetos (`de`,
`para`, `tipo`, `rotulo`) + `NOS_EXTRA` para nós de infra fora do catálogo
(hoje só `astargne.com`). Espelho estruturado do `../../RELACOES.md` (era a
seção "Relações entre projetos" do `CLAUDE.md` da raiz até 30/09/2026) —
**mude os dois juntos**. Alimenta
`/api/relacoes` e `publico/grafo.js` (aba Grafo) — **ambos fora da nav
desde o reskin abaixo** (decisão do dono, código intacto no repo, fácil de
religar como 4ª aba).

### publico/

Dashboard vanilla, reskin **"Industry HUD"** desde 21/08/2026
(mock hi-fi do dono em `design_handoff_painel_hud/`; tokens/tipografia
declarados como finais no handoff da época — Barlow/Barlow Condensed/IBM Plex Mono
vendorizados em `publico/vendor/fonts/`, mesmo princípio zero-CDN do
Mermaid). Em 12/10/2026, `publico/protocolo.css` sobrepõe o visual das abas
segundo o protótipo do dono, sem mudar lógica. Desde 28/10/2026 a entrada (`/`, `#/hangar`) é o **Hangar** (§ abaixo); seguem as abas — **Projetos · Backlog · Decisões · Orquestração · Contas · Chaves · Docs** — mais
o console do C-3PO como overlay por ⌘K/Ctrl+K:

#### app.js

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

#### backlog.js

As primitivas recursivas do backlog
(`desenharNodo`/`placar`/`nosComTag`, independentes de layout) mais duas
camadas de apresentação: `outlineFeatureDetalhes` (`<details>` por
feature, usado no painel de projeto) e `desenharBacklogDoProjeto`
(sempre expandido, grid de 2 colunas — a aba Backlog em si). As duas
mostram o backlog de **um projeto por vez** (`projetoSelecionado`), não
mais o quadro kanban multi-projeto de antes.

#### projeto.js

O painel do projeto focado (metade de baixo da aba
Projetos): cabeçalho + outline do backlog na coluna principal;
Arquitetura (moldura hachurada + Mermaid real nos 3 projetos que já têm
diagrama, "sem diagrama ainda" nos outros) + Decisões paradas + Fila de
jobs (**estado vazio honesto** — não existe sistema de jobs) + Produção
(sondas + SSH sob demanda) na coluna de 420px. O desenho de cada bloco mora em `idade-curta.js`, `secao-cabecalho.js`, `secao-outline.js`, `secao-arquitetura.js`, `secao-decisoes.js`, `secao-fila.js` e `secao-producao.js`; `projeto-secoes.js` só compõe. Também define
`abrirConsoleComDecisao` (chamada por `app.js`/`decisoes.js`).

#### decisoes.js

Aba Decisões: todas as decisões agrupadas por projeto
(top 3 por contagem abertos, resto em "Outros N projetos" colapsado).
A página é `PaginaDecisoes`; o agrupamento mora em `decisoes-grupo.js`,
a linha em `decisoes-linha.js` e o bloco do dono em `decisoes-astargne.js`.

#### contas.js (publico/)

(13/09/2026) — aba Contas. O desenho mora em `contas-pecas.js` (peças comuns), `contas-usuario.js` (linha e editor) e `contas-convite.js` (lista, formulário e resultado); `contas-desenho.js` só compõe. Usuários (nome, e-mail, ativo,
apps como chips; ações permissões/desativar-reativar/redefinir senha),
convites pendentes (reenviar/revogar) e o formulário Convidar (e-mail,
nome opcional, checkboxes dos apps com `sso: true` vindos de
`/api/contas/apps`). Depois de convidar mostra `enviado` e, se `false`,
o `erro` e o `link` para mandar por outro canal. Desativar e revogar
pedem `confirm()`. **Sem polling**: busca ao ENTRAR na aba (`rotear`
detecta a troca de view por `viewAtual`) e após cada ação — o `rotear()`
de 60 s passando pela mesma view não dispara ssh nenhum.

#### orquestrador.js (publico/) e orquestrador.css

A aba está partida em `publico/orquestracao/`: núcleo (estado e HTTP), demanda (elegibilidade na carta, pré-checagem em `demanda-prontidao.js`, portão em `demanda-portao.js`, histórico em `demanda-historico.js`), fila (filtro em `fila-filtro.js`, lista em `fila-lista.js`, triagem em `fila-triagem.js`), despacho, gate, conversa (canal em `conversa-canal.js`, handoff em `conversa-handoff.js`), modelos (seletores em `modelos-seletores.js`, confirmação em `modelos-confirmacao.js`), vigília (desenho em `vigilia-desenho.js`, confirmação em `vigilia-confirmacao.js`), legado, consumo e voz da carta. `orquestrador.js` só liga os tópicos. Leitura/simulação do Plane: painel de projetos candidatos, consulta
C-3PO sob demanda, impedimentos reais, fila filtrável e touchpoints. Recebe
HTML de referência visual Protocolo (11/10/2026), com a camada Protocolo,
sem escuta contínua ou ações do mock. Abre o console sem enviar mensagem ou
acionar microfone. O filtro inicial exibe candidatas com gate; "Todas as
cartas" revela as demais rejeições. A pré-checagem GET por carta consulta
relações formais sob demanda sem criar lease ou escrever no Plane. Tópicos:
Demanda, Conversa no card, Papéis e modelos, Consumo, Tentativas, **Canal
legado (doc 59)** e **Vigília** — estes dois lidos só ao abrir o tópico. Leituras pesadas abortam a
anterior (`AbortController` por tópico); resultado de gate/despacho confirmado
sobrevive ao re-render (`estado.ultimoResultado`). Ver
[orquestracao-v2-integracao.md](orquestracao-v2-integracao.md).

`GET /api/orquestracao/triagem-dev` é uma leitura pesada, acionada só pelo
botão da aba ou por pergunta ao C-3PO: classifica folhas abertas sem gate por
marcadores humanos, dependências formais, declaração de independência e estado.
A API não infere decisão de produto, não aplica etiquetas e não integra o
polling da fila. O botão no card abre o console com uma pergunta preenchida,
mas não a envia: o dono escolhe quando conversar.

#### docs.js (publico/)

Aba **Docs** (25/10/2026): a documentação de cada projeto separada dos cards
(o Plane é só desenvolvimento) e, no topo, a dívida de alinhamento da rotina
(`GET /api/alinhamento`; botão "Varrer agora"). A página é `PainelDocs`; o desenho mora em `docs-desenho.js`. Por projeto: links para os
docs funcional/arquitetural/técnico/contrato, que abrem na página do projeto
(`#/projeto/<pasta>?arquivo=<caminho>` — `app.js` lê o parâmetro e
`projeto.js` abre o documento ao montar) e a lista de sinais com link para o
card. Selo na aba = total de sinais.

#### chaves.js (publico/)

(24/10/2026) — aba Chaves: `PainelChaves` guarda o estado, `chaves-pedido.js` fala com a API, `chaves-linha.js` desenha a linha, `chaves-troca-form.js` abre o preparo e `chaves-desenho.js` lista um `<details>` por projeto com o `.env` local e o do
servidor (arquivo, modo, FROUXO se não for 600), uma linha por variável
(presença local/servidor, última troca, ROTAÇÃO PENDENTE com card e motivo), botões
"Trocar aqui" / "Trocar no servidor" / "Marcar como rotacionada" que abrem o
preparo e um campo `type=password` esvaziado após o envio; "Ler inventário do
servidor (ssh)" sob demanda; últimas trocas sem valores. Selo da aba = rotações
pendentes. Carrega ao ENTRAR na aba (`rotear`), sem polling.

#### grafo.js / relacoes.js

Fora da nav (ver acima), arquivos intactos.

#### Hangar (`hangar/`, `hangar.css`, `vendor/three/`)

Tela de entrada desde 28/10/2026 (plano em `~/.claude/plans/lovely-dancing-hamster.md`,
estilo holo-3D escolhido pelo dono no mock v7). Mapa fixo: docas no centro (4,
só naves em trabalho), fábricas de droids ao norte (Claude, Codex, Grok),
Oficina central a leste (acervo compartilhado), pátio do Plane a oeste (uma vaga
por projeto do catálogo). **Só leitura**: nenhuma rota de escrita; a
encomenda de nave nova só monta o texto de um pedido para o orquestrador.

- **Dados.** `GET /api/hangar` (`coletores/hangar.js` sobre `lerBacklog`,
  cache de 60 s do Plane): por projeto, peças = módulos com abertas/em
  andamento/feitas (canceladas fora), próximas fases (cartas abertas na ordem
  do Plane), decisões e o mapa UUID da carta → peça. Decisão = carta aberta
  que espera o dono: label `PRODUTO` vai para a **estação de planejamento**,
  `ASTARGNE` (ou a legada `DONO`) vira **peça no chão** do módulo; bloqueio por
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
  que cai num projeto do catálogo, senão o `cwd`; MCP `plane` dá a carta
  pelo `issue_id`. Sub-sessão "guardian" do Codex e qualquer coisa em
  `Exitlag/` ficam fora.
- **Privacidade (regra 5).** O painel abre pelo tailnet e o transcript pode
  ter segredo colado: do transcript só saem nome de ferramenta, caminho
  relativo ao projeto, nome do programa (sem argumento) e UUID de carta —
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
  desliga os voos. Paleta: sempre escura, no cobre-âmbar do tema escuro de
  `protocolo.css` (tokens `--hg-*` em `hangar.css`; as cores da cena em
  `cena.js` e `estado.js`, que precisam acompanhar à mão).

#### vendor/mermaid.min.js

`publico/vendor/mermaid.min.js` — Mermaid vendorizado (o Three do Hangar mora em `vendor/three/`, r128 com `SHA256SUMS`), reaproveitado
pelos diagramas dos docs e pela Arquitetura do painel de projeto.

#### Console do C-3PO

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

#### Gasto e fila de jobs

Gasto por projeto e "fila de jobs" **não têm fonte de dado real** — o
painel mostra "—"/estado vazio honesto em vez de inventar (mesma régua
do `PADROES-GERAIS.md` #8); se um dia existir coleta de custo real, é o
lugar de plugar.

### docs/00_PLANO.md e docs/01_ESTADO.md

Plano e estado real do C-3PO,
trazidos do repo antigo; leia o plano antes de mexer no motor ou na voz.

### docs/02_ABA_BACKLOG.md

A aba Backlog (quadro kanban só-leitura). Desde
30/09/2026 **o Plane é a verdade** e a aba é projeção (convenção e a tabela
de projetos em `../../PADROES-BACKLOG.md`); o parser de markdown sobrevive
só para o doc 39 do `_oldSistemaLoreEngine` congelado. Backlog próprio: o
projeto **PAINEL** no Plane — todo selo o atualiza NA MESMA ENTREGA.

## Invariantes — texto completo

(É para cá que [`invariants.md`](invariants.md) aponta; seção "O que continua
inegociável" do `CLAUDE.md` antigo, reconciliada com o portão v2.)

- **Sem login, então porta fechada** (reescrita em 06/10/2026, a pedido do
  dono): escuta só em `127.0.0.1:7777`, nunca em `0.0.0.0`. A única entrada
  de fora é `https://painel.vpn.astargne.com`, pelo Caddy de
  `~/servicos/borda`, que só encaminha o IP de tailnet do Windows do dono
  (`100.87.142.59`); qualquer outro nó, o racknerd inclusive, recebe 404.
  `guarda.js` recusa Host fora da lista (421, contra DNS rebinding) e método
  que muda estado vindo de outro site (403, `Sec-Fetch-Site`/`Origin`, contra
  CSRF — que já valia para o loopback antes da borda). Abrir para mais
  aparelhos é mudar o `remote_ip` do Caddyfile, nunca tirar a restrição.
- **SSH só-leitura** (`/api/producao/ssh`): apenas `uptime`,
  `systemctl is-active`, `docker ps`, `df`, `free`, com a chave
  `~/.ssh/paroquia-vultr`, só sob demanda (botão) — nunca no refresh
  automático. **Única exceção, delimitada** (13/09/2026, aba Contas): o
  `ssh` de `contas.js` muda estado — mas só o **banco do CadastroUnico**,
  só pelas rotas `/interno/*` do central, só pela tabela fechada
  `OPERACOES`. Nada de `systemctl`, deploy, arquivo ou Caddy por ali: infra
  continua sendo SSH manual + `validador-deploy`, seguindo
  `/opt/servidor/LEIA-ME.md`.
- **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** (decisão do
  dono, 13/09/2026): não entra em `.env` do painel, não é lido nem logado
  no PC, não aparece em resposta HTTP. O painel chega ao central **por
  ssh**, e o script remoto monta o cabeçalho lá dentro. Se um dia alguém
  propuser "copiar o token pro `.env` local pra simplificar", a resposta é
  não — é a arquitetura da fatia, não um detalhe.
- **Ferramentas de IA só-leitura até a fase 3** (`docs/00_PLANO.md`): o motor
  roda com `tools: []` + allowlist das quatro ferramentas MCP — limitação
  **estrutural**, não promessa de comportamento.
- **Voz não fura o canon de deploy**: qualquer ação futura que mude estado no
  `astargne.com` continua exigindo `validador-deploy` + validação de
  premissas, como para qualquer agente.
- **Executor só atrás de todos os portões** (24/10/2026): `criarExecutorCli` só
  é construído em `servidor.js` com `ORQ_EXECUCAO_HABILITADA=true`; mesmo
  ligado, cada despacho exige identidade técnica do projeto, contrato válido,
  agente disponível, perfil `PERFIL-IA/v1` no card, sessão do Cadastro Único e
  confirmação em duas ações. O executor cria um worktree (`git worktree add -b
  orq/<carta>-<id>`) fora da árvore principal, lança cada papel sem shell com
  ambiente construído por lista branca (nenhuma `PLANE_*`, `*_KEY`, `*TOKEN*`),
  `claude -p --bare --setting-sources project --strict-mcp-config
  --mcp-config '{"mcpServers":{}}' --permission-mode dontAsk` com `allowedTools`
  fechada (papéis só-leitura com `--restricted`) ou `codex exec --sandbox
  read-only|workspace-write --ignore-user-config --ignore-rules --ephemeral`,
  roda só o comando do contrato (inspeção estática e heurística do
  `scripts.test`/script: metacaracteres e tokens proibidos recusam — não prova
  que o conteúdo é seguro), mata o grupo de processos no timeout, capa a saída
  e devolve `impedido` para qualquer falha de infraestrutura. O que ele não
  garante: o comando de aceite roda sem sandbox, como o usuário do serviço.
- **Segredo só no `.env`** (`ELEVENLABS_API_KEY`, `PLANE_API_KEY` da identidade
  Guest de leitura e, se habilitado, `PLANE_ORQ_WRITE_KEY` de serviço distinta;
  coberto pelo `.gitignore`). A escrita de perfil exige projeto único, SSO do
  Cadastro Único e confirmação separada; não amplia as ferramentas do C-3PO.
  Nenhuma chave aparece no navegador, código, log, commit ou resposta HTTP.

## Origem

(Seção "A fusão (14/08/2026, noite — decisão do dono)" do `CLAUDE.md` antigo.)

O Severino nasceu em 14/08/2026 como projeto **irmão** (`severino/`, porta
7778), consumindo os endpoints deste painel por HTTP. Na noite do mesmo dia o
dono **revogou** essa separação: dois processos e duas portas para uma
ferramenta pessoal única eram cerimônia sem benefício — e o motor fazia HTTP
para o vizinho para ler dado que é função local. Resultado: UM app na 7777.
O repo `github.com/gadelhams/severino` está **arquivado** como lápide; código
e história continuam aqui (`github.com/gadelhams/painel-admin`).

(Do mapa da raiz, não do `CLAUDE.md` antigo:) a persona foi renomeada de
"Severino" para **C-3PO** em 21/08/2026; rota, pasta e nomes no código
mantiveram o nome antigo até 28/10/2026, quando o dono pediu o alinhamento:
rota `/c3po/`, pasta `publico/c3po/`, `mandarMensagemC3po`; `/severino` e
`/severino/` redirecionam (301) para favoritos antigos.

## Fatos trazidos do `01_ESTADO.md` (01/10/2026)

Mecanismos que o estado datado de 13/09/2026 registrava e nenhum outro doc
vivo tinha; provas e evidências ficaram em
[`historico/01_ESTADO-ate-2026-10-01.md`](historico/01_ESTADO-ate-2026-10-01.md).

- **Autenticação do motor**: o login do Claude Code já existente na máquina;
  funciona headless **sem `ANTHROPIC_API_KEY`** — nenhuma credencial criada.
- **Só-leitura estrutural** (`motor.js`): `tools: []` + servidor MCP em
  processo com só as seis ferramentas de leitura + `allowedTools` nelas +
  `permissionMode: 'dontAsk'` (o que não está pré-aprovado é negado sem prompt).
- **`.env`**: `npm start` usa `--env-file-if-exists` **e** `servidor.js` faz
  `process.loadEnvFile` defensivo — `node servidor.js` seco segue funcionando.
- **Estáticos**: `GET /c3po` → 301 `/c3po/` (assets relativos dependem
  da barra); `/severino` e `/severino/` → 301 `/c3po/` (nome antigo); `..` em path-as-is → 404; método errado em `/api/tts` → 405.
- **ElevenLabs** (`ProxyElevenLabs` em `orquestrador/voz-eleven.js`, rota em `servidor.js`): upstream
  `POST api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` (header
  `xi-api-key`), `output_format=mp3_44100_128`, modelo `eleven_v4` (o ajuste de clonagem do
  playground não existe no multilingual_v2); voice_id default `JBFqnCBsd6RMkjVDRZzb` ("George"),
  troca por `ELEVENLABS_VOZ_ID` no `.env`. O corpo manda o ajuste do playground
  (25/10): estabilidade 0.07, similaridade 0.09, clonagem 0, filtro `robot`,
  distância 0.5; idioma fica automático (sem `language_code`). Sem chave → `POST /api/tts` 503 com
  `motivo` nomeado (`sem-chave-elevenlabs`); `GET /api/tts` é sonda que não
  gasta caractere; upstream recusando → `elevenlabs-recusou` + status, genérico
  de propósito; a chave jamais aparece em log, erro ou resposta; cliente que
  some aborta o upstream (`AbortController`).
- **Cadeia de voz declarada** (`locutor.js` fala, `escuta.js` ouve, `sessao-voz.js` decide o turno; corte, eco, nome e retentativa em `politica-fala.js`): ElevenLabs →
  Antônio (voz pt-BR cujo nome contém `antonio` + `natural`; fallback = primeira
  pt-BR, e o status diz qual) → só texto. A linha `#status-voz` declara a camada
  ("voz: ElevenLabs" / "voz: Antônio — ElevenLabs sem chave" / "só texto —
  motivo"). Desde 20/08/2026 há **uma retentativa** antes de cair para o
  Antônio. Um 429 (a conta aceita 3 sínteses ao mesmo tempo) não troca a
  voz da sessão: no máximo 2 pedidos em voo, e a frase espera e tenta de
  novo. `calar()` pausa o áudio e aborta downloads em voo. Degradar
  declarando, nunca quebrar: erro vira mensagem na UI.
- **Reconhecimento**: push-to-talk (`continuous: false`, uma captura por
  clique, segundo clique cancela). Copiloto (21/08): escuta contínua com
  gatilho "C3PO" depois de 90s. Ligação (25/10): escuta contínua sem gatilho
  até desligar; falar por cima corta a síntese e, confirmada a frase, aborta
  a resposta em curso. `corrigirNomesProprios` (20/08/2026) compara o ouvido com o catálogo
  de `GET /api/projetos` por distância de edição (`SIMILARIDADE_MINIMA = 0.72`),
  avisa toda troca na conversa e ignora nomes de uma palavra.
- **Fluidez**: `limparParaFala` tira marcação só da fala; blocos de
  `MIN_BLOCO = 160` (o primeiro sai na primeira sentença); downloads seguintes
  baixam enquanto o bloco atual toca.
- **Aba Contas**: latência real por ação 1,7–3,3 s (um ssh completo) — por
  isso sem polling e botões travados durante a ação. Testes com mutações
  nomeadas (12 no backend, 4 no front), todas vermelhas — detalhe no
  `RELATORIO-F5-CONTAS.md`.
- **Custo observado** por pergunta com ferramentas (08/2026, Sonnet 5 a preço
  introdutório): US$ 0,19–0,37.
- **Botão de mudo da síntese**: não pedido no contrato da fase 2; se doer no
  uso, é uma linha de decisão no plano.
