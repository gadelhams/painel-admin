# orquestrador/

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

O Orquestrador de Projetos (padrão em `../../ORQUESTRADOR-PROJETOS.md`), um
módulo por responsabilidade: `politica.js` (reexporta `contrato-politica.js`,
`prontidao.js` (marcas em `marcas-carta.js`, gate em `prontidao-gate.js`, despacho em `prontidao-despacho.js`) e `vigilia-politica.js`), `fila.js` (reexporta `dependencias-carta.js`, que junta `relacoes-formais.js` e `texto-dependencia.js`,
`fila-leitura.js` (a carta em `carta-da-fila.js`, o resumo em `resumo-fila.js`), `despacho-servico.js` (checagem em `checagem-despacho.js`, tentativa em `tentativa-despacho.js`), `simulacao-despacho.js`, `gate-servico.js` (pré-checagem em `preavaliacao-gate.js`, marcação em `registro-gate.js`), `handoff-servico.js`,
`frota-servico.js` (leitura e troca da frota), `canal-carta.js`, `estado-carta.js` e `servico-orquestracao.js`), `estado.js` (recuperação; o lease em `arquivo-lease.js`, o diário em `diario-touchpoints.js`, a trava em `trava.js`), **a frota** (abaixo), `modelos.js` (plano da frota congelada sem fallback e
flags de CLI), `canal-plane.js` (a forma do comentário em `interacao-canal.js`)/`consulta-perfil.js` (o `PERFIL-IA/v1` antigo, só exibido como ignorado; leitura em `protocolo-perfil.js`)/`handoff-plane.js` (texto em `protocolo-handoff.js`, escrita em `escritor-handoff-plane.js`)/`gate-plane.js` (texto em `protocolo-gate.js`, escrita em `escritor-gate-plane.js`)
(protocolos versionados no card: leitura paginada, `HANDOFF/v2` (v1 legível),
`GATE/v1`, escritores restritos a um projeto), `sso.js` (reexporta `erro-acesso.js`, `sessao-cookie.js`, `origem-privilegiada.js`, `verificador-cadastro.js` e `autorizador.js`)/`confirmacoes.js`/`api-*.js`
(sessão do Cadastro Único por ssh — e, desde 31/10/2026, `sessao-painel.js` + `GET /api/sessao` para o selo do cabeçalho, que diz se a sessão deste navegador é do dono, de outra conta ou nenhuma, guardado 60 s por cookie, sem autorizar nada; sair é na home de astargne.com, entrar volta por `?next=` —, desafio de confirmação, rotas; desde 28/10/2026 o esqueleto das duas ações é um só, `desafio-duas-acoes.js` + `api-duas-acoes.js`, e frota, gate, handoff, despacho, play e a troca de chaves só declaram o que validam e o que gravam), `triagem.js` (classificação em `classificar-prontidao-dev.js`, varredura em `varredura-triagem.js`)
e `consulta-c3po.js` (pendências DEV e a ferramenta do motor), `voz-xai.js` (transcrição),
`voz-eleven.js` (`ProxyElevenLabs`, a síntese; a chave não sai do processo),
`consumo.js` (a do Claude em `fonte-consumo-claude.js`: o arquivo que `~/.claude/statusline-astargne.mjs` grava com o `rate_limits` da statusLine, documentada, e o `cachedUsageUtilization` que o próprio Claude Code, inclusive a extensão do VS Code, guarda em `~/.claude.json` — cache interno, lido com forma estrita e nada de conta; por janela vale a leitura mais nova; a fonte do Codex em `fonte-consumo-codex.js`: `rate_limits` do evento mais recente das sessões; leitura com mais de 15 min vira "última leitura", e some quando a janela zera), **`executor-cli.js`** (o executor real; ambiente em `ambiente-cli.js`,
gramática de `scripts.test` em `gramatica-cli.js`, processo em `processo-cli.js`,
papel em `papel-cli.js` (argumentos em `argumentos-cli.js`, retrato em `retrato-cli.js`), briefing em `briefing-papel.js`, worktree em
`isolamento-git.js` e instalação em `dependencias-worktree.js`; três papéis de IA como
CLIs descartáveis — `claude -p` / `codex exec` — num worktree `orq/<carta>-<id>`
fora da árvore principal, comando de aceite do contrato sem shell, ambiente por
lista branca, timeout que mata o grupo, logs em `~/.local/state/painel-admin/orquestracao/saidas/<tentativa>/`;
moldes dos papéis em `briefings/`; só é construído com `ORQ_EXECUCAO_HABILITADA=true`)
**`vigilia.js`**
(varredura automática do Hangar inteiro, desde a F4b: a passada em `vigilia-varredura.js`, o passo de uma carta em `passo-vigilia.js`, o diário em `vigilia-diario.js` e `vigilia.js` só compõe; a cada dois minutos escolhe a primeira carta
elegível do projeto com play que teve a vez há mais tempo, uma por passada, muda Todo → In Progress, chama `iniciarDespacho`
com a frota (nunca grava `PERFIL-IA`) e, em `concluido`, troca `READY TO
DEV` por `READY TO TEST` com recibo ou leva `READY TO TEST` a Done; freios por
contrato, estado e diário em `vigilia/<projeto>.jsonl`; ligar e desligar é o
play da nave, em [orquestrador-play-zelador.md](orquestrador-play-zelador.md)) e **`estado-plane.js`** (PATCH de estado do card pelo
grupo `started`/`completed`, opcionalmente tirando uma etiqueta, com releitura).


**Frota** (F2, 29/10/2026; plano em [plano-frota-do-hangar.md](../plano-frota-do-hangar.md)).
Uma configuração só, no lugar do perfil por carta: `frota-catalogo.js` (catálogo
fechado no código, copiado do que cada CLI declara — 5 modelos Claude low…max e
8 OpenAI low…max, `ultra` onde o Codex aceita; o padrão da tela é `max` — e dois
validadores separados: bloco
`executor` com os três papéis e bloco `zelador`), `frota.js` (`frota.json` em
`~/.local/state/painel-admin/orquestracao/`, gravado com tmp + rename; versão =
inteiro crescente + sha256 do conteúdo; `frota-historico.jsonl` só de acréscimo,
lido por `leitor-jsonl.js`), `frota-pausas.js` (pausas globais), `frota-servico.js`
e `api-frota.js` (`GET /api/orquestracao/frota`; `POST …/frota/{preparar,confirmar}`
por SSO + duas ações: o preparar valida contra o catálogo e guarda a versão-base;
o confirmar, sob a trava global, recusa sem escrita se a frota mudou).
Regras (com a correção pós-varredura de 29/10/2026, janelas J-A a J-L):
- **Leitura.** `ok | ausente | ilegivel | invalida`, do bloco executor; o zelador
  tem estado próprio e uma tupla dele fora do catálogo não para o executor.
  Qualquer estado ≠ ok para despacho e vigília, sem padrão de reserva nem
  semeadura. O GET devolve a `marca` (versão + hash, ou o digest dos bytes
  ruins); a tela a manda de volta no preparar, que recusa se a frota mudou desde
  o que o dono viu; o confirmar, sob a trava, recusa se mudou desde o preparar.
- **Gravação.** tmp + rename; o histórico é acrescentado antes do rename e a
  versão que não chegou a ser aplicada ganha a linha `nunca-aplicada`; o `.tmp`
  sempre é limpo; `frota.json` que não é arquivo comum recusa sem escrever nada.
  A numeração é o maior entre a frota, o histórico e o piso `frota-versao.json`
  (+1); sem fonte legível para uma frota que já existiu, recusa numerar. A
  confirmação limpa a pausa de versão e regrava um `frota-pausas.json` ilegível
  (a saída explícita), anotando no histórico.
- **Contrato.** A frota só escolhe modelos: o contrato liga o projeto e cada
  provedor (`agentes[].disponivel`). A incompatibilidade ("frota pede X que o
  contrato desligou") é motivo na prontidão, na fila e na situação da vigília,
  antes de qualquer escrita; com a frota ≠ ok a fila também mostra o motivo
  ("frota ausente: nada despacha sem frota válida") em vez de "elegível". Modelo/esforço de `agentes` e `vigilia.perfilPadrao`
  são só aviso "ignorado"; o `perfilPadrao` opcional ainda é conferido para
  nenhum contrato inválido virar válido. A prontidão e o C-3PO não mostram modelo
  do contrato: `agentesDisponiveis` é só `{id, provedor}` e o C-3PO recebe a frota.
- **Tentativa.** A checagem lê a frota uma vez (a fila recebe essa mesma leitura);
  a **reserva relê a frota sob a trava** e recusa "frota mudou" sem lease. Depois
  da reserva a frota fica congelada (lease, `TENTATIVA` e os dois HANDOFF), e a
  troca não cancela nada; a fila mostra "rodando com vN; atual vM". A versão
  substitui o `perfilComentarioId` na idempotência. Na vigília a ordem é
  conferir (frota e pausas sob a trava, na reserva), reservar e só então mudar a
  carta de Todo para In Progress.
- **HANDOFF/v2.** `origemModelos` obrigatório (`frota` com versão, hash e tuplas,
  ou `humano` no handoff à mão); a escrita confere o catálogo, a leitura só a
  forma, para a auditoria sobreviver a uma troca de catálogo. O v1 é lido como
  `perfil-ia`; um handoff ilegível fica de fora e é contado.
- **Falhas.** `retrato-cli.js` nunca classifica pelo texto do modelo. No Claude,
  com `is_error: true` o `result` é mensagem do próprio CLI e é lido (com qualquer
  código de saída); com `is_error: false` nunca; sem JSON, só o stderr com saída
  ≠ 0. No Codex, só a última linha `ERROR` do CLI no stderr, com saída ≠ 0 (o
  stderr traz a transcrição; `--json` não foi verificado no CLI real). O formato
  exato das mensagens será conferido no piloto PAINEL-34. `cli` (binário
  ausente, modelo/flag recusado, autenticação) pausa a versão da frota até outra
  ser confirmada, só no bloco que falhou (`versao` do executor ou `versaoZelador`, J61, F3); `limite` pausa o provedor para todos os projetos; `carta`
  (timeout, truncamento, limite de turnos, saída ≠ 0 genérica — e a dúvida)
  conta tentativa e não pausa nada. `cli` e `limite` não contam tentativa da
  carta nem o teto diário. Reserva que cai antes do executor (ex.: o PATCH de
  estado no Plane) vira `SEM_INICIO`: não conta tentativa da carta e entra no
  diário da vigília com causa `infra` e o motivo. As pausas valem só para a vigília. `frota-pausas.json`
  de forma inválida conta como ilegível (vigília parada).
- **Diários.** `anexarJsonl` (`leitor-jsonl.js`) não cola registro numa cauda
  interrompida: grava `\n` antes e o registro sai com a marca como primeira chave;
  a linha ruim no meio só é tolerada se a seguinte começa com a marca — inclusive
  em cadeia, para a falha dupla (cauda cortada e recuperação também cortada).
  Vale para touchpoints, vigília, histórico da frota e eventos de chaves. As
  linhas toleradas são contadas (`truncadasNoMeio`) e aparecem nos avisos do
  diário da frota, no GET da frota e na própria linha seguinte do histórico. O
  diário da frota projeta também `frotaVersao` e `causa`.
- **Pausa por projeto.** O `pausadaAte` da vigília saiu: o único escritor era a
  pausa por limite de uso, que virou pausa global por provedor.
