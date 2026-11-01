# Frota do Hangar — droids configurados no Hangar, zelador varrendo o Plane

Plano de 28/10/2026 (PAINEL-54); a F2 foi feita em 29/10/2026 e a F3 em 31/10/2026, corrigida no mesmo dia (seções abaixo); a F4 não. Pedido do dono: "os CLIs têm que ser
configurados para o hangar e não por task. A ideia do hangar é ter um droid
que valida o Plane procurando cards para serem feitos, seja limpeza do card
(atualizar definições, diminuir pendências) ou puxar para desenvolver." O
dono só decide produto e o que é importante; a régua de quem decide está em
`../../../PADROES-BACKLOG.md` § Zeladoria de cartas.

## O erro do desenho atual

Hoje a escolha de CLI, modelo e esforço é **por carta**. Ela fica num
comentário `PERFIL-IA/v1` gravado com SSO e duas ações. O `.orquestrador.json`
de cada projeto repete a lista de agentes e o `vigilia.perfilPadrao`. Além
disso, só o dono, logado, marca `READY TO DEV` de um jeito que o despacho
aceite. O resultado é que nenhuma carta anda sem um clique do dono, e o
backlog apodrece entre um clique e outro: em 28/10, 76 de 159 cartas abertas
mentiam.

## O desenho novo

**Frota = configuração do Hangar, uma só.** Cada papel é um droid, com
provedor, modelo e esforço. O dono troca a frota clicando na fábrica do droid
no Hangar (SSO e duas ações). Os papéis são estes:

| Droid | Faz | Escreve onde |
|---|---|---|
| **Zelador** | varre o Plane por projeto: limpeza (zeladoria) e prontidão (puxar) | só no Plane, pela lista fechada da zeladoria; nunca no repositório |
| Orquestração | escreve o briefing da fatia (o papel de hoje) | nada |
| Codificação/testes | coda no worktree `orq/<carta>-<id>` (o papel de hoje) | só no ramo dele, sem push |
| Validação | dá o veredito sobre diff e comando (o papel de hoje) | nada |

O `.orquestrador.json` continua por projeto, mas só com o que é do projeto:
comandos, critérios, ações proibidas e o opt-in. As listas `agentes` e
`vigilia.perfilPadrao` saem dele e passam para a frota. O recibo `HANDOFF/v1`
de cada tentativa grava qual frota rodou, e assim a auditoria por carta não se
perde. O `PERFIL-IA/v1` deixa de ser exigido; quando já existe numa carta, só
se lê, sem efeito.

**O ciclo do zelador**, uma passada a cada N minutos, um projeto por vez:
1. Pula o projeto que tem sessão viva de outro droid, além dos congelados e
   do Anya. Para isso usa um leitor estrito, que trata erro como ocupado
   (J16–J19). O coletor do Hangar não serve, porque falha aberto.
2. Monta o retrato só-leitura: cartas e comentários, `git log`, `git status`,
   commits à frente do remoto e `docs/current.md`.
3. Dá um veredito por carta, como na skill `zeladoria-de-cartas`.
   - `ATUALIZAR`, `FECHAR`, `CANCELAR` e `IA_DECIDE`: grava o comentário com
     `external_id` e depois a mudança. Tira o `ASTARGNE` que não passa pela
     régua.
   - Decisão de verdade: põe `ASTARGNE`, mais `PRODUTO` quando é rumo. A
     carta vai para a mesa de decisão com a pergunta, as opções e a
     recomendação já escritas.
   - Carta folha com escopo, aceite, dependências resolvidas e sem trava:
     marca `READY TO DEV` com recibo `GATE/v1`, na identidade do zelador, com
     a evidência. Isso só acontece quando "puxar" está ligado; ver as
     decisões abaixo.
4. Registra a passada no diário do C-3PO. O Hangar mostra o droid zelador
   saindo da fábrica, indo até a vaga do projeto no pátio e voltando.

**Despacho.** A vigília deixa de ser por projeto e passa a ser **do Hangar**.
Com a frota ligada, ela pega a próxima carta `READY TO DEV` de qualquer
projeto com contrato e despacha com a frota. Os freios de hoje continuam:
uma tentativa por vez, teto por dia, pausa por limite de uso, sem push e sem
merge.

## A aba Orquestração vira o Hangar (dono, 29/10/2026)

O dono revisou a aba sub-aba por sub-aba e disse que ela está confusa e
ainda pensa por carta. O destino de cada parte:

| Hoje | Vira |
|---|---|
| Demanda (carta + pré-checar READY TO DEV/TEST + portão) | **Mesa de decisão** (PAINEL-53): a carta discutida com o C-3PO. A pré-checagem sai da tela: quem a roda é o zelador, sozinho. |
| Conversa no card (cópia do fio do Plane) | **Resumo** da carta: o bloco Estado da descrição (compactação do fio, `PADROES-BACKLOG.md`), o último handoff e o próximo passo. O fio inteiro fica no Plane, num link. |
| Papéis e modelos (por carta, `PERFIL-IA/v1`) | **Frota**: uma configuração do painel, papel → CLI, modelo e esforço. |
| Consumo (sempre "indisponível") | **Consumo** com fonte real. O Codex grava `rate_limits` em cada sessão (`~/.codex/sessions`: `used_percent`, janela, `resets_at`; 26% da semana em 29/10). No Claude, o CLI mostra o uso no `/usage`; falta escolher a leitura. Desde 31/10 o Claude também lê o `cachedUsageUtilization` do `~/.claude.json` (PAINEL-40). Fonte mais fresca, a fazer: `rate_limit_event` do `claude -p --output-format stream-json`, que pede capar a saída do executor pela cauda. |
| Tentativas (lease e histórico da carta) | **Diário da frota**: o que cada droid fez, em que carta e com que resultado. É o mesmo diário que o C-3PO narra. |
| Canal legado (doc 59) | Sai. O dono não quer mais. A porta 7791 do SupervisorHandoff sai com ele (PAINEL-35). |
| Vigília (por projeto) | O **Hangar**. |

**Droids por papel, com uma cor cada.** Orquestração, codificação, validação
e zelador (revisão e atualização do Plane). O zelador também pode ser o
orquestrador fechando a demanda. A fábrica continua dizendo de qual CLI o
droid veio (Claude ou Codex). A cor diz o que ele está fazendo.

**Play por nave estacionada.** No pátio, cada nave tem um botão play. Ele
libera a frota para puxar cartas daquele projeto e substitui a chave da
vigília por projeto. Com o play ligado:
- os jobs automáticos de limpeza, revisão e atualização rodam sem o dono;
- quando o piloto PAINEL-34 tiver passado, entra também o check de
  `READY TO DEV` (desenvolver) e de `READY TO TEST` (testar).

Quando o job termina, a nave volta à vaga (dono, 29/10/2026). Se ela não
está 100% feita e não sobrou nada que a frota possa fazer, ou seja, nada a
orquestrar, atualizar, revisar, desenvolver ou testar, então só restam
decisões do dono: de produto ou outras que dependem dele. Nesse caso o
**bloqueio fica em destaque no painel lateral do projeto**, com as cartas
que o seguram.

O parecer do validador de invariantes (29/10/2026) está em [plano-frota-parecer.md](plano-frota-parecer.md).

## F2 feita (29/10/2026)

O mecanismo está em [arquitetura/orquestrador.md](arquitetura/orquestrador.md) (Frota).
- **Feito:** `frota.json` com estado explícito e histórico; troca por SSO e
  duas ações com versão-base (J4); catálogo fechado e dois blocos (J6, J8);
  despacho, simulação e vigília leem a frota, uma vez por decisão, sem
  fallback (J5); a tentativa congela a frota e o `HANDOFF/v2` grava
  `origemModelos` (J3, J9); a vigília não grava `PERFIL-IA` (J10).
- **Escolhas:** HANDOFF subiu para v2, porque um campo obrigatório no v1
  invalidaria os recibos antigos; o v1 é lido com origem `perfil-ia` e o
  handoff à mão leva `humano`, porque nenhuma frota rodou nele. O contrato
  liga o projeto **e cada provedor** (`agentes[].disponivel`): a frota nunca
  liga um provedor que o contrato desligou (J1). Impedido de CLI ou modelo
  pausa a versão da frota até o dono confirmar outra; o limite de uso pausa
  o provedor por `pausaPorLimiteMinutos` do contrato que bateu nele. As duas
  pausas valem só para a vigília: o despacho manual é decisão do dono.
- **Correção pós-varredura (29/10/2026):** o validador de invariantes deu NÃO
  RATIFICÁVEL (janelas J-A a J-L), e todas foram fechadas, cada uma com teste e
  mutação. Mecanismo em [arquitetura/orquestrador.md](arquitetura/orquestrador.md) (Frota):
  - a reserva relê a frota sob a trava, e a vigília só escreve no Plane depois
    do lease;
  - o preparar usa a marca que o dono viu;
  - a falha tem três baldes, lidos só de stderr e erro estruturado com saída ≠ 0;
  - a compatibilidade frota×contrato aparece na prontidão;
  - `anexarJsonl` serve os três diários;
  - o HANDOFF é lido pela forma, não pelo catálogo;
  - pausas inválidas contam como ilegíveis, e a confirmação dá a saída;
  - a numeração tem piso; o rename que falha fica registrado;
  - a varredura de rotas usa o roteador real e os quatro métodos;
  - o zelador tem estado próprio;
  - o `pausadaAte` por projeto saiu.
- **Terceira rodada (29/10/2026, segunda varredura):** fechados N1 a N6 e os
  itens baratos, cada um com teste e mutação.
  - **N1:** no Claude, `is_error: true` faz o `result` ser lido como mensagem do
    CLI (limite → `limite`, credencial → `cli`), com qualquer código de saída.
  - **N2:** no Codex, conta só a última linha `ERROR` do stderr.
  - **N3:** reserva sem início vai ao diário com causa `infra` e não gasta
    tentativa.
  - **N4:** o leitor tolera a falha dupla, e as linhas perdidas são contadas e
    mostradas.
  - **N5:** as escritas da aba Contas exigem SSO.
  - **N6:** a fila mostra "frota ≠ ok".
  - **Baratos:** HEAD responde 200 e o 405 leva `Allow`.
  - **Não verificado no CLI real:** o formato das mensagens de limite e de
    credencial dos dois CLIs; o piloto PAINEL-34 (31/10) não bateu limite
    nem credencial, então segue sem ver. As fixtures seguem
    o formato documentado ("Claude AI usage limit reached|<epoch>" no `result`,
    com `is_error`).
- **Piloto PAINEL-34 passou em 31/10/2026.** A 1ª tentativa (PLAYER-38,
  7240cb3d) foi reprovada sem diff: o briefing não separava ler de executar e
  o Codex não leu o código. Com os briefings corrigidos, a 71d94f24 entregou
  (orquestração 113 s, codificação 861 s, validação 204 s, APROVADO) e foi
  integrada. Lição do integrador: os achados "corrigir" do validador viram
  trabalho do integrador antes do merge, não carta nova.
- **Antes do piloto PAINEL-34 (feito em 29/10/2026):**
  - **R1:** duas paradas pela frota na mesma carta em 24 h tiram a carta da
    varredura até a janela passar (`passo-vigilia.js`).
  - **R2:** `subtype` diferente de `success` é falha mesmo sem `is_error`.
  - **R3:** `POST /api/tts` e a transcrição exigem SSO também no loopback.
    `/api/conversa` fica aberto por decisão do dono (login da CLI, ferramentas
    só de leitura).
- **Janelas conhecidas, só documentadas:**
  - **N9, falha tripla na gravação.** O piso e a linha do histórico são escritos
    antes do rename. Se o rename falhar, a anotação `nunca-aplicada` também
    falhar e o processo cair:
    - o histórico fica com uma vN que nunca vigorou e não tem marca;
    - o número vN fica consumido (a próxima é vN+1);
    - a nota de pausa ("pausa da vN limpa") foi escrita antes da gravação, mas
      as pausas só são regravadas depois do rename. O histórico afirma uma
      limpeza que não aconteceu.
    - Quem audita compara o histórico com o `frota.json` em vigor.
  - **N10, `formaDasTuplas` presa ao conjunto de papéis.** A leitura do
    HANDOFF/v2 exige exatamente os três papéis de hoje. Se um papel for
    renomeado ou criado, os recibos antigos passam a ser contados como
    ilegíveis e somem da tela, a mesma perda de auditoria do J-G. Mudar papel
    exige HANDOFF/v3 ou uma leitura pelos papéis do próprio recibo.
  - **N11, trava global segurada durante HTTP do Plane** (anterior à F2).
    - Handoff, gate e estado gravam no Plane sob `estado.comTrava`.
    - Com o Plane lento (timeout de 15 s por chamada), quem espera a trava
      desiste em 60 s: a troca da frota, a reserva e as pausas falham com
      "trava ocupada".
    - O confirmar da frota vira "incerto" e precisa de um preparar novo.
    - Nada é gravado pela metade.
- **Saiu:** a rota `/api/orquestracao/modelos*`, o escritor `PERFIL-IA/v1` e
  a sub-aba "Papéis e modelos". `vigilia.perfilPadrao` virou opcional, e um
  contrato com vigília e sem ele, antes inválido, agora vale.
- **Ficou de fora:**
  - a cor por papel nos droids, porque ainda não há droid de frota (F3/F4);
    só a paleta `COR_PAPEL` existe;
  - nenhuma frota real gravada: até o dono confirmar a primeira, o despacho
    e a vigília ficam parados (`ausente`);
  - o smoke SSO do Windows foi portado para a Frota, mas não rodou;
  - `/api/conversa` continua sem SSO por decisão do dono; a varredura de rotas
    a lista como exceção;

## F3 feita (31/10/2026)

O mecanismo está em [arquitetura/orquestrador-play-zelador.md](arquitetura/orquestrador-play-zelador.md). O desenho
passou pelo validador de invariantes, que deu NÃO RATIFICÁVEL com as janelas J51–J74; a F3 fecha as
que tocam o play e a limpeza.
- **Feito:**
  - **play por nave** no lugar do toggle da vigília (`play.json`, SSO + duas ações, gravado sob a
    trava, ilegível = desligado, "suspenso por divergência" gravado e distinto de desligado); a
    vigília lê o play e o relê dentro da reserva; a rota `vigilia/*`, o leitor antigo e a sub-aba
    Vigília saíram; a migração renomeia o toggle antigo, sob a trava e antes de agendar, e não liga
    nada;
  - **trava do agendador**: só agenda a instância com `ORQ_AGENDADOR=true` (só na unit) e o pid em
    disco;
  - **job do zelador de limpeza**, com a CLI do bloco zelador da frota, sem ferramentas, num
    diretório vazio, e o escritor estreito da identidade "Zelador (Hangar)";
  - **Hangar**: play no popup da nave, droid zelador nascendo do job, destaque do bloqueio só do
    dono; diário do zelador na aba (Diário da frota) e no C-3PO (`diario_zelador`).
- **Escolhas:**
  - **ocupado** é por projeto quando uma sessão de IA tocou o projeto nas últimas 2 h (leitor
    estrito) e por carta quando outro ator mexeu nela (atividade ou comentário) nas últimas 2 h:
    uma carta mexida não para o job das outras;
  - **J58 na própria carta**: a escrita pode acrescentar motivo (fechar, travar), nunca tirar. Por
    isso o `IA_DECIDE` (tirar `ASTARGNE`) fica sempre recusado nesta fase: tirar a trava deixaria a
    carta mais perto do gate. O dono decide tirando a etiqueta;
  - **J57 no lugar da "carta contestada" (J30)**: em vez de um comentário de pergunta, o veredito
    vira MANTER com o motivo no diário;
  - **reconciliação por projeto**: o PENDENTE é reconciliado no início do próximo job do mesmo
    projeto (o fencing é por projeto); pendente de projeto com play desligado espera;
  - **consumo**: a fonte é o leitor da aba; o uso que a CLI do zelador devolve (custo, turnos) vai
    ao diário, mas o `claude -p` não devolve percentual da assinatura, e sem leitura da fonte o
    zelador não roda;
  - **ordem da divergência**: o recibo DIVERGENTE vem antes da suspensão do play (o escritor só
    escreve com play ligado); a reconciliação de um recibo DIVERGENTE garante a suspensão;
  - **saída da CLI**: JSON estrito, aceito também dentro de uma única cerca ```json.
- **Janelas fechadas, cada uma com teste e as principais com mutação:** J52, J53, J54 (lado do
  zelador: prefixo fixo e filtro da prosa), J56 (UUID fixo, arquivo por lista branca, chave distinta
  da Guest e das orquestradoras, uma leitura por operação), J57, J58, J61, J62, J63, J64, J65, J66,
  J67 (janela de atividade por carta + leitor estrito), J68, J69, J70 (categoria "espera
  integração"), J71 (frescor da fonte), J73.
- **Ficam para a F4:** J51 (uma por vez no disco), J54 do lado do leitor (`gatesDoCanal` exigindo
  `papel=decisao` e `external_source`), J55, J56 restante (Member, não Admin; atores distintos dois a
  dois no boot; aposentados), J59, J60 (sandbox antes de o gate do zelador valer), J70 restante
  (`origemDespacho`/`origemGate` no HANDOFF) e J74 (recibo editado depois não é conferido). A J72
  fechou na correção (B19): sob a trava, 6 s por chamada e 20 s no total. Também a skill
  `zeladoria-de-cartas` rodada à mão com o play ligado (J67): ela ainda não toma o lease; até lá,
  rodar a skill num projeto com play ligado é decisão de quem a roda.
- **Não verificado no real:** a chave do zelador existe desde 31/10 (`~/.config/plane/zelador.token`,
  ator `830e2631-de81-4871-95b7-ed9cc1774b32`), mas nenhum job real rodou; a CLI do zelador nunca rodou
  de verdade (`--tools ""` está no `claude --help` da 2.1.284 como "desliga todas as ferramentas", não
  provado em execução; nem a saída JSON do `claude -p` sem ferramentas); a linha `ORQ_AGENDADOR` não
  foi posta na unit.

## F3 corrigida (31/10/2026)

A varredura pré-aceite do validador de invariantes (B1–B30, sobre `7def8ac`) deu NÃO RATIFICÁVEL. Cada
correção tem teste vermelho antes e verde depois (`test/zelador-correcao-job.test.js` e
`test/zelador-correcao-pecas.test.js`); as marcadas com † têm também mutação nomeada por cópia de arquivo.

| B | Correção ou resíduo |
|---|---|
| B1 † | universo das relações = cartas de todos os projetos do catálogo (como o juiz); relação fora da leitura = intocável |
| B2 | `DECISAO/v1` impede repor `ASTARGNE`; aplicação pendente da mesa = intocável (ilegível = todas). Resíduo: o preparo sem confirmar e a gaveta aberta não ficam em disco; o confirmar da mesa relê a digital e recusa se o zelador escreveu no meio |
| B3 † | tirada de qualquer estado terminal por outro ator impede todo estado terminal |
| B4 | abortar porque a carta ficou intocável fica só no diário local |
| B5 | resíduo: filho novo, relação nova ou gate novo num dependente entre a reconferência e o PATCH (segundos); fechar exige reler o catálogo sob a trava, contra o teto da B19 |
| B6 † | escritor e reconciliação revalidam a lista fechada (`mudancaNaListaFechada`) |
| B7 † | marcador humano = lista do juiz + formas sem parêntese; a descrição nova guarda as linhas marcadas |
| B8 | subagentes (profundidade 4) entram; transcript sem instante legível = ocupado |
| B9 | ocupação por sessão relida antes de cada carta |
| B10 † | relação ilegível no universo aborta (varredura: era o único `catch → null` em simulação antes/depois) |
| B11 | enunciado corrigido acima (Elegibilidade) |
| B13 † | recibo de fechamento sai com o play desligado ou suspenso (só de PENDENTE aberto); PENDENTE sem play é fechado num job só de recibos |
| B14 † | carta apagada ou arquivada resolve o PENDENTE só no diário |
| B15 † | a chave leva uma tentativa nova por PENDENTE; 409 por campos estruturados; recibo pela chave exata |
| B16 | aplicada pelo zelador e desfeita por outro ator: recibo `DESFEITO`, sem refazer |
| B17 | `DIVERGENTE` marcado no índice e play suspenso antes do recibo |
| B18 | RESOLVIDO no índice só depois da linha do diário |
| B19 † | sob a trava só fencing, releitura e PATCH (ou o POST): 6 s por chamada, 20 s no total |
| B20 † | descrição e 409 comparados como texto/campos, não byte (o Plane sanitiza com `nh3`). A digital segue o HTML guardado: as duas leituras são do valor já sanitizado |
| B21 | quem não tomou a trava do agendador tenta de novo a cada 5 min |
| B22 | o aviso do play lê o lease do zelador em disco (a vigília só corre na instância que agenda) |
| B23, B24, B26 | `PLAY_DESLIGADO` no começo do job; suspender sem play fica no histórico; suspensão na reconciliação para antes da CLI |
| B27 | motivo de falha da CLI passa pelo filtro de segredo; bloco zelador só com `claude` até a sandbox da F4b |
| B28 | chave distinta, por hash, dos `orquestrador-*.token` e do `painel-admin.token` |
| B29 | documentado (`claude --help`), não provado |
| B30 | a chave existe desde 31/10 (acima) |

## F4a feita (31/10/2026)

A F4 foi partida em duas: a F4a fecha o que o despacho e a leitura precisam antes de o zelador
marcar gate; a F4b liga o gate do zelador e o despacho do Hangar inteiro. Mecanismo em
[arquitetura/orquestrador-puxar.md](arquitetura/orquestrador-puxar.md) (F4a).
- **Janelas fechadas, cada uma com teste e mutação nomeada** (`test/frota-f4a.test.js`,
  `test/identidades-escrita.test.js`, `test/reservas.test.js`): J51 (uma tentativa por vez no disco,
  pgid no lease), J54 do lado do leitor (cabeçalho `papel=decisao`, fonte da lista fechada; malformado
  anotado, não lança), J55 (recibo amarrado à instância da etiqueta pelas atividades), J56 restante
  (catálogo, `/users/me` = ator fixo, Member e não Admin, chaves e atores distintos no arranque), J70
  restante (`origemDespacho`/`origemGate` no HANDOFF), J74 (recibo editado não vale); item 7
  (`instalarEm`) e item 9 (reserva de carta por sessão, pedido do dono: "como evitar double work?").
- **Escolhas:**
  - **atores distintos**: Guest, zelador, Painel Admin e cada orquestrador; o dono não entra, porque
    o painel não sabe o UUID dele no Plane (`ORQ_OWNER_USER_ID` é do Cadastro Único);
  - **conferência a cada 15 min**: uma chave trocada no disco é recusada até a próxima, e uma
    divergência corrigida volta sozinha; Plane fora deixa "pendente", não desliga;
  - **reserva sem SSO**: quem reserva é o agente local; o painel acha o processo do socket no `/proc`
    em vez de confiar num pid informado; humano sem CLI fica só com o lease local;
  - **mesa**: a recusa da carta reservada é um embrulho do `preparar` na montagem (nada muda em
    `decisao/`); vem depois do preparar da mesa e, se a resolução pela Guest falhar, a decisão do dono
    segue (a reserva coordena agentes, não trava o dono).
- **Fica para a F4b:** gate do zelador (J58, J59), sandbox (J60), o despacho do Hangar inteiro em
  round-robin (item 6), J72, o zelador e a skill `zeladoria-de-cartas` respeitarem a reserva (a
  porta é `ReservasCarta.ocupadaPorOutro`) e o zelador recusar chave igual à de um orquestrador (hoje
  só o lado do orquestrador confere).
- **Não verificado no real:** as identidades de CAD, EMU e PAINEL nunca foram conferidas contra o
  Plane de verdade (`member_role` em `GET /projects/<id>/` e o 403 de `/workspaces/<ws>/members/` para
  Guest foram lidos no código do Plane v1.4.2, não medidos); o script de reserva não rodou contra o
  painel em produção.

## F4 feita (31/10/2026)

A F4b fecha a F4: o zelador marca READY TO DEV e a vigília despacha no Hangar inteiro. Mecanismo em
[arquitetura/orquestrador-puxar.md](arquitetura/orquestrador-puxar.md) (F4b) e [arquitetura/invariantes.md](arquitetura/invariantes.md) (o texto completo da
regra 16, que saiu da linha curta de `invariants.md` para caber).
- **Janelas fechadas, cada uma com teste e mutação nomeada por cópia de arquivo**
  (`test/frota-f4b.test.js`, simulação em `test/frota-f4b-simulacao.test.js`):

| Janela | Teste | Mutação que o deixa vermelho |
|---|---|---|
| J58 | trava tirada pelo zelador segura o gate até o `DECISAO/v1`; dependência fechada por ele também | levantamento ignorado; dependência fechada não lida |
| J59 | PRONTA recusada pela prontidão ao vivo (dependência nova); ancestral com ASTARGNE; autores por gate; recibo de um autor não vale para a etiqueta do outro; chave UUIDv5; escritor sem `remover` | sem `validarGate`; ancestral ignorado; zelador em READY TO TEST; fonte do outro; autor do recibo ≠ da etiqueta; chave aleatória |
| J60 | filho sob o bwrap não lê a chave (HOME falso), `~/.ssh`, `.env`, o `environ` do painel; executor com CLIs e aceite no bwrap, aceite sem rede, `redeNoAceite`; sem bwrap o gate do zelador é inelegível e a tentativa dele, impedida | sem tmpfs; `/proc` da máquina; aceite com rede; aceite fora do bwrap; elegível sem bwrap; fila aceita sem elegibilidade; executor sem a segunda trava |
| J72 | POST do gate pendurado aborta no teto e solta a trava | POST sem teto |
| item 6 | round-robin PAINEL→CAD→PAINEL→CAD, uma por passada; teto diário do Hangar | sem a ordem; passada sem parar; sem teto |
| item 9 | reservada fica intocável no retrato; reservada no meio da sequência aborta sob a trava | reserva ignorada no retrato; e sob a trava |
| J56 (lado do zelador) | chave ou ator iguais aos de um orquestrador do catálogo recusam | hash ignorado |

- **Simulação ponta a ponta** (Plane, CLIs e executor falsos): o zelador marca PRONTA (recibo
  `zelador-gate-v1`, etiqueta posta por ele) → a vigília do Hangar despacha, com `origemDespacho:
  hangar` e `origemGate: zelador` no HANDOFF → o despacho manual simultâneo é recusado ("tentativa em
  curso") → o gate recolocado à mão e o recibo forjado em prosa ficam inelegíveis → a carta reservada
  por sessão viva é pulada pelo zelador e pela vigília.
- **Escolhas:**
  - a sandbox embrulha as CLIs do executor e o aceite, não a CLI do zelador (sem ferramentas, num
    diretório vazio): o bloco zelador continua só `claude` (B27);
  - sem bwrap funcional o executor roda como antes para o gate do dono; só o gate do zelador cai
    (inelegível na fila, impedido no executor), como o contrato pede;
  - máscaras além da lista do contrato: `~/.config/gh`, `/dev` e `/proc` próprios (o `environ` do
    painel tem a Guest e as chaves legadas do `.env`);
  - "o dono reconhecer" = um `DECISAO/v1` da mesa na carta depois do levantamento;
  - o round-robin conta a vez pela última TENTATIVA no diário da vigília (sobrevive ao reinício);
  - teto global `ORQ_TETO_DIA` (padrão 12), além do teto do contrato.
- **Provas reais sob bwrap (31/10, autorizadas pelo integrador):** `claude-sonnet-5`/low, prompt de
  uma linha, sem ferramentas: código 0, resposta "ok", US$ 0,0072, 1 turno. `codex` `gpt-5.6-luna`/low
  com `--sandbox workspace-write` aninhado: rodou `echo sandbox-ok` no sandbox próprio (aninhamento
  funciona), código 0; custo em tokens não capturado (assinatura). Nas duas a chave do zelador ficou
  invisível (`test -e`, sem ler o conteúdo), o `/proc` só com 4 processos e o aceite sem rede só com
  `lo`. Sem `--dev /dev` o `claude` (Bun 1.4.3) abortava na partida.
- **Não verificado no real:** nenhum job do zelador, gate do zelador nem despacho do Hangar rodou
  contra o Plane de verdade; `ORQ_AGENDADOR` não está na unit; `.orquestrador.json` de CAD, EMU e
  PAINEL é do integrador. O texto da skill `zeladoria-de-cartas` (reserva e lease) e o de
  `ORQUESTRADOR-PROJETOS.md` foram entregues ao integrador, não aplicados.
- **Resíduos:** fora das máscaras o disco do usuário segue legível (`/tmp`, outros `.env` fora do
  catálogo); as CLIs têm rede; a CLI do zelador não vai ao bwrap.

## PAINEL-62: preparo do zelador (01/11/2026)

O PRONTA da carta em Backlog sem declaração de dependências ganha um preparo: o painel, depois do
juiz real e da prontidão simulada, tira a carta do Backlog e/ou escreve a linha
`Dependências: nenhuma (declarada pelo zelador do Hangar em DD/MM/AAAA)` num PATCH único, e só então
marca o gate. Desenho, defesas e a tabela janela → teste → mutação em
[plano-frota-preparo.md](plano-frota-preparo.md) (partido por causa do teto do acervo).

## Mudanças nas regras (docs na mesma entrega)

- `ProjetosPessoais/ORQUESTRADOR-PROJETOS.md`: hoje só a marcação de gate
  nascida do Painel com sessão do dono é elegível. Passa a ser também a do
  zelador, com recibo, evidência e identidade própria. O seletor por carta e
  o `perfilPadrao` dão lugar à frota.
- `docs/invariants.md` §6: o escritor do zelador vale para vários projetos,
  mas só com a lista fechada. A chave fica num arquivo 600, nunca em
  `process.env`, o mesmo cuidado da mesa.
- A identidade é nova: **Zelador (Hangar)**, Member em cada projeto, sem
  administração. Não usa o Painel Admin (admin demais) nem as chaves técnicas
  de CKBL e PLAYER (projeto único).

## Ordem (dono, 29/10/2026: a frota vem antes da mesa)

1. **Feito em 28 e 29/10:**
   - o padrão (`PADROES-BACKLOG.md` § Zeladoria);
   - a skill;
   - a label `TAREFA DONO`;
   - a primeira passada manual, que deixou só CAD-21 e KHOR-18 com o dono.
2. **F1, limpeza da aba (sem escrita nova):**
   - Consumo com fonte real (Codex agora, Claude quando a leitura for
     escolhida);
   - o Canal legado sai;
   - Tentativas vira o diário da frota;
   - Conversa vira resumo.
3. **F2, a frota — feita em 29/10/2026** (seção "F2 feita"): a configuração
   geral, gravada com SSO e duas ações; o executor lê a frota no lugar do
   `PERFIL-IA/v1`. A cor do droid por papel ficou para a F3/F4.
4. **F3, o play por nave e o zelador — feita em 31/10/2026** (seção "F3 feita"):
   - **Liberação do projeto:** cada projeto é liberado pelo play.
   - **Identidade nova "Zelador (Hangar)":** Member em cada projeto. O
     escritor estreito dela segue a lista fechada.
   - **Jobs de limpeza:** rodam sem o dono, numa CLI real, pela frota.
   - **Destaque do bloqueio:** aparece no painel lateral quando a nave fica
     sem nada a fazer.
5. **F4, puxar — feita em 31/10/2026** (seções "F4a feita" e "F4 feita"): `READY TO DEV`
   pelo zelador e despacho do Hangar inteiro pela frota, sob o bwrap.
6. **A mesa (PAINEL-53)** absorve a aba Demanda.

## Decisões do dono (28/10/2026)

- **Limpeza: o zelador aplica sozinho.** Cada mudança leva comentário e fonte.
  O diário do C-3PO no Hangar lista o que ele fez, para o dono conferir e
  desfazer.
- **Puxar: sim, depois do piloto.** O zelador só marca `READY TO DEV` depois
  que o piloto real do executor (PAINEL-34) passar. A partir daí a frota
  despacha sozinha, sob uma chave liga/desliga do Hangar.
- **Tarefa do dono ganha a label `TAREFA DONO`.** Playtest, aparelho real e
  conta de fornecedor ficam na fila pessoal, num bloco à parte da aba
  Decisões, fora do chão do Hangar e da mesa. `ASTARGNE` fica só para
  decisão.
- ~~A mesa vem antes da frota.~~ Mudou em 29/10: a frota vem antes (veja Ordem).

Antes de abrir o executor, o desenho
passa pelo `validador-invariantes`: o zelador mexe em estado persistido
alheio (o Plane) e corre contra sessões vivas.
