# orquestrador/ — puxar (F4a e F4b)

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

**Puxar, F4a** (31/10/2026; plano em [plano-frota-do-hangar.md](../plano-frota-do-hangar.md) § F4a feita).
- **Uma tentativa por vez no disco** (J51, `estado.js`): `reservar`, sob a trava global, reconcilia
  todo outro lease; ativo, ilegível ou em revisão com o grupo de processos gravado (`pgid`) ainda vivo
  recusa "tentativa em curso em SIGLA-N", sem gravar nada (vale para a vigília e o despacho manual).
  Cada filho do executor avisa o grupo (`ProcessoCli` `aoIniciar`, `detached`: pgid = pid) e a
  tentativa o grava no lease (`marcarProcesso`); um filho órfão de uma queda segue ocupando.
- **Recibo endurecido** (`protocolo-gate.js` `lerGatesDoCanal`, `recibo-gate.js`): `GATE/v1` só vale
  com o cabeçalho `[ORQ/v1 papel=decisao]`, autor aceito, `external_source` da lista fechada
  (`FONTES_GATE`: `orquestrador-gate-v1` → origem `dono`; `zelador-gate-v1` → `zelador`, F4b) e sem `edited_at` (J54, J74); o resto fica
  de fora e é contado no motivo, sem derrubar a leitura. A última atividade que pôs a etiqueta atual
  (`/activities/`, `field: labels`, `new_identifier` = id dela) tem de ser de autor aceito e posterior
  a um recibo válido; atividade ilegível ou ausente = inelegível (J55).
- **Identidades pelo catálogo** (J56, `identidades-escrita.js`): `identidadeEscrita: { arquivo, ator }`
  em `projetos.js`, chave em `~/.config/plane/<arquivo>.token` (`^orquestrador-[a-z]+$`, 600, dono),
  uma cópia por operação e só a que a conferência validou (hash). Conferência no `iniciar()` e a cada
  15 min: `/users/me` = ator fixo, `member_role` 15 no projeto, workspace abaixo de Admin, chaves e
  atores distintos de Guest, zelador, Painel Admin e dos outros orquestradores. Divergência desliga só
  aquela identidade (motivo na fila e no seletor de projetos); Plane fora deixa pendente. CKBL e PLAYER
  (`legadoEnv`) usam o `.env` até o arquivo existir.
- **Origem no HANDOFF** (J70): `origemDespacho` (`dono` pela aba, `hangar` pela vigília) e `origemGate`
  (da fonte do recibo) nos dois HANDOFF do despacho; o resumo da vigília não diz "confirmado pelo usuário".
- **`instalarEm`** (item 7, `dependencias-worktree.js`): subpastas do contrato com lock próprio recebem
  `npm ci --ignore-scripts`; caminho com `.`/`..`, absoluto ou link para fora do worktree recusa.
- **Reserva de carta por sessão** (item 9, porta `reservas.js`; `scripts/reservar.mjs SIGLA-N
  [--soltar]`): lease em `~/.local/state/painel-admin/reservas/<cartaId>.json` com a CLI ancestral
  (`claude`/`codex`, ou o shell do humano), pid + início do processo (pid reaproveitado não herda),
  validade 4 h renovada a cada reserva da mesma sessão; gravado e solto sob a trava da orquestração;
  recusa reserva viva de outra sessão e lease da frota; morta ou vencida é tomada, com motivo em
  `reservas.jsonl`. A fila marca a carta reservada impedida, a reserva da frota recusa sob a trava e a
  mesa recusa no preparar (embrulho na montagem). `GET /api/orquestracao/reservas?carta=` resolve;
  `POST` (sem SSO por decisão do contrato: quem reserva é o agente local) só do loopback, sem
  cabeçalho de navegador, com o processo do socket achado no `/proc` (`peer-loopback.js`) descendente
  de uma CLI cujo pid é o da reserva; comenta `RESERVA/v1` pela identidade técnica do projeto e põe
  Backlog/Todo em In Progress (sem identidade: só o lease, com aviso). O droid do Hangar mostra a carta
  reservada (pelo `CLAUDE_CODE_SESSION_ID`; Codex pela pasta) antes da inferida; sem reserva, diz isso.

**Puxar, F4b** (31/10/2026; plano em [plano-frota-do-hangar.md](../plano-frota-do-hangar.md) § F4 feita).
- **Sandbox** (J60, `sandbox-cli.js`): o executor embrulha as CLIs dos três papéis e o comando de aceite
  no `bwrap` (`/usr/bin/bwrap`): `--bind / /` com `--dev /dev` próprio (sem ele o `claude`, Bun, aborta),
  pid namespace e `/proc` novos (o `environ` do painel some), tmpfs sobre `~/.config/plane`,
  `~/.local/state/painel-admin` (o worktree e os logs da tentativa voltam por re-bind), `~/.ssh`,
  `~/.config/linear` e `~/.config/gh`, `/dev/null` sobre o `.env` do painel e de cada projeto do
  catálogo que existe; `--unshare-net` só no aceite, salvo `redeNoAceite: true` no contrato;
  `--die-with-parent` e o grupo de processos do bwrap (o timeout e a vigia de pgid seguem). O
  controle de versão do painel (worktree, commit) e o `npm ci --ignore-scripts` ficam fora. A sonda (`true` sob as mesmas máscaras e sem
  rede) vale 10 min; falha deixa o gate do zelador inelegível, com o motivo, e impede a tentativa
  que nasceu dele.
- **Gate do zelador** (J58, J59, J72; `zelador-gate.js`, escrita em `escritor-gate-zelador.js`): a CLI
  propõe `PRONTA` (só proposta); o painel exige play, contrato válido, identidade técnica do projeto
  e a sonda ok (`criarElegibilidadeGateZelador`, a mesma regra que a fila usa para aceitar o recibo
  dele), relê a carta ao vivo (intocável nenhum), recusa ancestral com trava (BLOQUEIOS, `PRODUTO`,
  marcador na descrição; pai fora da leitura = trava), recusa carta cuja trava o próprio zelador
  levantou — etiqueta de trava tirada, marcador ou dependência tirados da descrição, relação removida,
  dependência formal fechada por ele — até um `DECISAO/v1` da mesa posterior, e roda
  `RegistroGate.validar` ao vivo (fila pela Guest, relações relidas). A chave é UUIDv5(carta | gate |
  digital); o recibo sai de `codificarGate` com `external_source: zelador-gate-v1`, só READY TO DEV,
  sem `remover`; sob a trava, com o fencing do lease, vão lease, tentativa, reserva, a releitura, o
  POST, a releitura das etiquetas e o PATCH (6 s por chamada, 20 s no total); verificação que não
  confere suspende o play. Na fila, o zelador é autor aceito só de READY TO DEV, só com a fonte dele e
  só com a elegibilidade ok; o recibo vale para a etiqueta posta pelo MESMO autor (`recibo-gate.js`).
  A tela do play mostra "Gate do zelador: elegível" ou o motivo.
- **Preparo do PRONTA** (PAINEL-62, 01/11/2026; `zelador-preparo.js`, plano em
  [plano-frota-preparo.md](../plano-frota-preparo.md)): depois das conferências acima, o gate chama
  `preavaliar`; se o juiz só aponta "estado inadequado para desenvolvimento" (carta no grupo backlog)
  e/ou a declaração de dependências ausente, e há identidade de gate e nenhum gate, o PRONTA vira
  `{ tipo: 'preparo', estado, declarar }` e passa pela sequência da limpeza (`zelador-aplicacao.js`:
  J57 de estado e de declaração; veto só no certo — código de sigla do catálogo não formalizado como
  dependência desta carta, no título, na descrição ou em comentário de não-zelador, relação não
  formal ou fora da forma — e as linhas suspeitas (prosa com o vocabulário de dependência) julgadas
  uma a uma pela CLI no `prosaJulgada` do PRONTA, nos dois sentidos, com o julgamento nas evidências
  do recibo GATE/v1. Veto e julgamento valem para todo PRONTA, com ou sem preparo: o gate os confere
  ao vivo antes do juiz;
  prontidão simulada que tem de dar pronta, J58 com a exceção do tipo, PENDENTE → intenção com texto
  fixo → um PATCH com estado e descrição → verificação → recibo). O escritor resolve o estado (unstarted
  de menor `sequence`) e relê as relações sob a trava, no mesmo teto; relação nova aborta, e o preparo
  abortado não se repete na carta por 24 h (pelo diário local; diário ilegível recusa). O gate então
  sai com a digital da releitura (D1); se não sai (recusa ou abort), o diário registra
  `PREPARADO_SEM_GATE` (contado à parte) e a carta recebe um comentário `[ZELADOR/v1]` com o motivo,
  salvo posse alheia (lease, reserva, play); num erro comum, que segue depois, as etiquetas são relidas
  antes: READY TO DEV presente ou releitura falha viram `PREPARADO_GATE_INCERTO`. A reconciliação nunca rola o
  preparo para a frente, e em todo tipo recusa o PENDENTE cuja descrição difere da recalculada ao
  vivo. O retrato leva à CLI as linhas suspeitas de cada candidata e, para a em Backlog, as relações e os
  códigos citados com o estado. Destrave da J58 só pela decisão da mesa da autoria do Painel Admin
  (`PLANE_ADMIN_ACTOR_ID`); sem o ator configurado, nada destrava.
- **Despacho do Hangar inteiro** (item 6, `vigilia-varredura.js`): com `ORQ_AGENDADOR=true` e a frota ok,
  cada passada lê o play, o teto diário global (`ORQ_TETO_DIA`, padrão 12, somado dos
  `vigilia/<id>.jsonl` de todo o catálogo, sem as paradas da frota) e a fila uma vez; lease ativo em
  qualquer projeto segura todos; a ordem é quem teve a última TENTATIVA há mais tempo (nunca =
  primeiro; empate pela ordem do catálogo) e a passada para no primeiro projeto que reservou. Os
  freios por projeto (contrato, 2 por carta, pausas, R1) seguem no passo.
