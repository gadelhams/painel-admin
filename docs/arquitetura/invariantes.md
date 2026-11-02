# Invariantes — texto completo

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

(É para cá que [`invariants.md`](../invariants.md) aponta; seção "O que continua
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
- **SSH só-leitura** (`/api/producao/ssh` e, desde 31/10/2026, a ferramenta
  `consulta_ssh` do C-3PO, a mesma classe e a mesma lista `CONSULTAS_SSH` de
  `coletores/ssh-leitura.js`, fonte única conferida em teste; saiu de `http/` em 31/10 para o motor alcançá-la pela porta `coletores.js`): apenas `uptime`,
  `systemctl is-active`, `docker ps`, `df`, `free`, com a chave
  `~/.ssh/paroquia-vultr`, só sob demanda (botão) — nunca no refresh
  automático. **Única exceção, delimitada** (13/09/2026, aba Contas): o
  `ssh` de `contas.js` muda estado — mas só o **banco do CadastroUnico**,
  só pelas rotas `/interno/*` do central, só pela tabela fechada
  `OPERACOES` e, desde 29/10/2026, só com a sessão SSO do dono. Nada de `systemctl`, deploy, arquivo ou Caddy por ali: infra
  continua sendo SSH manual + `validador-deploy`, seguindo
  `/opt/servidor/LEIA-ME.md`.
- **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** (decisão do
  dono, 13/09/2026): não entra em `.env` do painel, não é lido nem logado
  no PC, não aparece em resposta HTTP. O painel chega ao central **por
  ssh**, e o script remoto monta o cabeçalho lá dentro. Se um dia alguém
  propuser "copiar o token pro `.env` local pra simplificar", a resposta é
  não — é a arquitetura da fatia, não um detalhe.
- **O motor lê e só propõe** (fase 3, 31/10/2026; até então "só-leitura até a
  fase 3", `docs/00_PLANO.md`): o motor roda com `tools: []` + allowlist das dez
  ferramentas MCP — limitação **estrutural**, não promessa de comportamento. As
  duas que não são leitura, `propor_acao` e `propor_memoria` (31/10/2026,
  PAINEL-8), registram uma proposta e devolvem o id dela, nunca um id de
  confirmação; preparar, confirmar, executar e gravar são do dono, pela UI, com
  SSO + duas ações. Nenhum módulo que o motor importa (fecho transitivo) alcança
  `acoes/executor-acoes.js`, `acoes/api-acoes.js` (`test/acoes.test.js`), o
  escritor da mesa de decisão (`carta_plane` só lê) nem o escritor da memória, a API dela, a pendente ou a reflexão
  (`test/fronteiras-modulos.test.js`). **Escrita da memória L1**
  (`c3po/MEMORIES.md`): só por `memoria/escritor-memoria.js`, e ele só tem dois
  chamadores — a API do dono (SSO + duas ações, base conferida sob trava) e a
  reflexão noturna (`memoria/reflexao.js`, critérios fixos e diário em
  `c3po/reflexao.jsonl`); toda versão entra no `memoria-historico.jsonl` com
  quem, hashes e diff, para desfazer. A memória entra no prompt como dado
  delimitado, nunca como instrução.
- **Voz não fura o canon de deploy**: qualquer ação futura que mude estado no
  `astargne.com` continua exigindo `validador-deploy` + validação de
  premissas, como para qualquer agente.
- **Executor só atrás de todos os portões** (24/10/2026): `criarExecutorCli` só
  é construído em `montagem.js` com `ORQ_EXECUCAO_HABILITADA=true`; mesmo
  ligado, cada despacho exige identidade técnica do projeto, contrato válido,
  agente disponível, frota `ok` (sem padrão de reserva), sessão do Cadastro Único e
  confirmação em duas ações. O executor cria um worktree (`git worktree add -b
  orq/<carta>-<id>`) fora da árvore principal, lança cada papel sem shell com
  ambiente construído por lista branca (nenhuma `PLANE_*`, `*_KEY`, `*TOKEN*`),
  `claude -p --restricted --strict-mcp-config --mcp-config
  '{"mcpServers":{}}' --permission-mode dontAsk` com `--tools` e `allowedTools`
  fechadas (sem `--bare`, que não autentica pela assinatura — provado em
  29/10/2026: restrito ~5 mil tokens de contexto, normal ~178 mil) ou `codex exec --sandbox
  read-only|workspace-write --ignore-user-config --ignore-rules --ephemeral`,
  roda só o comando do contrato (inspeção estática e heurística do
  `scripts.test`/script: metacaracteres e tokens proibidos recusam — não prova
  que o conteúdo é seguro), mata o grupo de processos no timeout, capa a saída
  e devolve `impedido` para qualquer falha de infraestrutura, sem retry. **Sandbox (F4b,
  31/10/2026, J60):** as CLIs dos três papéis e o comando de aceite rodam sob `bwrap`
  (`sandbox-cli.js`) com `~/.config/plane`, `~/.local/state/painel-admin` (só o worktree e os
  logs da tentativa voltam), `~/.ssh`, `~/.config/linear` e `~/.config/gh` mascarados, o `.env`
  do painel e o de cada projeto do catálogo por cima de `/dev/null`, `/dev` e `/proc` próprios
  (pid namespace: o `environ` do painel some); o aceite roda sem rede, salvo `redeNoAceite: true`
  no contrato. Sem bwrap funcional, o executor roda como antes, menos a tentativa de gate do
  zelador, que é impedida. O que ele não garante: o resto do disco do usuário (fora das
  máscaras, `/tmp` incluído) continua legível, e as CLIs têm rede.
  **Regras que a linha 16 resume (F2–F4b):** modelos só da frota (SSO + duas ações), relida
  sob a trava na reserva; frota ≠ ok para tudo; o contrato liga o projeto e cada provedor. Uma
  tentativa por vez no Hangar inteiro, no disco (J51), vale para a vigília e o despacho manual;
  gate só com recibo `GATE/v1` amarrado à etiqueta atual (J55), do mesmo autor que a pôs; o do
  zelador vale só em READY TO DEV, só com a fonte `zelador-gate-v1`, só com a sandbox, play,
  contrato e identidade do projeto, depois de `RegistroGate.validar` ao vivo, nunca em carta
  cuja trava ele levantou sem o dono reconhecer (J58, J59) — tirar da descrição um código de carta
  ou uma linha com vocabulário de dependência conta como trava levantada. Nenhuma escrita do zelador melhora a prontidão de carta alguma nem
  muda a das outras (J58), **salvo o preparo do PRONTA** (PAINEL-62, 01/11/2026): exceção ligada ao
  tipo `preparo`, que só o painel monta depois do juiz real, num PATCH único (Backlog → o unstarted
  de menor `sequence` e/ou a linha `Dependências: nenhuma (declarada pelo zelador do Hangar em
  DD/MM/AAAA)`); na própria carta só somem "estado inadequado para desenvolvimento" e a declaração
  ausente, numa vizinha só troca o nome do estado na linha da dependência, e ela segue não-pronta;
  em todo PRONTA, com ou sem preparo, o painel veta só código de sigla do catálogo não formalizado
  como dependência e relação não formal, e a prosa com o vocabulário de dependência a CLI julga
  linha por linha, com o julgamento no recibo
  ([plano-frota-preparo.md](../plano-frota-preparo.md)). O reconhecimento que destrava a J58 é só a
  decisão da mesa da autoria do Painel Admin configurado. Um ATUALIZAR que anexa "Sem
  dependências." continua recusado. Carta reservada por sessão viva
  fica fora de despacho, mesa e zelador. Vigília e zelador só agendam com o play (SSO + duas
  ações; com ele desligado, o zelador só fecha o recibo de um PENDENTE aberto) e
  `ORQ_AGENDADOR=true`; o bloco zelador só aceita o provedor `claude`; nunca push nem merge.
  **Fechado antes do piloto (R3, 29/10/2026):** o que gasta crédito pago
  (`POST /api/tts` e a transcrição) exige a sessão SSO também no loopback, e o
  executor não tem o cookie. `/api/conversa` fica aberto por decisão do dono:
  roda pelo login da CLI, com as ferramentas do C-3PO (leitura e `propor_acao`); o pior que
  o executor faz por ali é gastar cota da assinatura e deixar propostas que só o
  dono, com SSO, confirma. O diário de conversas (insumo da reflexão da memória L1) só
  registra o turno com a sessão do dono (31/10/2026).
- **Segredo só no `.env`** (`ELEVENLABS_API_KEY`, `PLANE_API_KEY` da identidade
  Guest de leitura e, legado de CKBL e PLAYER até o arquivo existir, `PLANE_ORQ_WRITE_KEY` distinta;
  as identidades de escrita do catálogo leem `~/.config/plane/orquestrador-<sigla>.token`, 600, por
  operação, com o ator fixo conferido no arranque — `orquestrador/identidades-escrita.js`;
  coberto pelo `.gitignore`). A escrita de gate e handoff exige projeto único, SSO do
  Cadastro Único e confirmação separada; não amplia as ferramentas do C-3PO. **Exceção
  delimitada (F3, 31/10/2026): o escritor do zelador** vale para vários projetos, mas só os que
  têm o play ligado pelo dono (SSO + duas ações) e só a lista fechada da zeladoria — com play
  desligado ou suspenso, só o recibo de fechamento de um PENDENTE aberto no índice; a chave dele
  mora em `~/.config/plane/zelador.token` (600, dono conferidos a cada operação), nunca em
  `process.env`, distinta das outras identidades (também das `orquestrador-*.token` e da
  `painel-admin.token`), e o ator é conferido contra o UUID fixo da identidade "Zelador (Hangar)".
  **Exceção, delimitada** (31/10/2026, mesa de decisão): a chave do Painel Admin, ADMIN do
  workspace, mora fora do `.env`, em `~/.config/plane/painel-admin.token` (600), lida só pelo
  escritor da mesa a cada operação; do `.env` vem só o UUID do ator, `PLANE_ADMIN_ACTOR_ID`.
  Esse escritor atua em vários projetos, mas só na lista fechada (comentário da mesa, labels
  `ASTARGNE`/`DONO`/`PRODUTO`, o marcador da descrição e o estado), só por SSO + duas ações e
  sem o Anya nem o CKBL ([decisao.md](decisao.md)); a chave é lida uma vez por operação e nenhum pedido com
  chave segue redirecionamento. Nenhuma chave aparece no navegador, código, log, commit ou
  resposta HTTP. **Resíduos declarados (31/10/2026):** na mesa, a janela de milissegundos
  entre a última releitura e o PATCH contra escritores de fora do painel, que as atividades
  (lidas desde antes da primeira releitura sob a trava, de melhor esforço) só tornam visível;
  e o filtro de segredo (`acoes/filtro-segredo.js`), que é de melhor esforço — reconhece
  formatos conhecidos e os valores do `.env`, não um segredo de formato novo.
