# Frota do Hangar — droids configurados no Hangar, zelador varrendo o Plane

Plano de 28/10/2026 (PAINEL-54); a F2 foi feita em 29/10/2026 (seção abaixo), F3 e F4 não. Pedido do dono: "os CLIs têm que ser
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
| Consumo (sempre "indisponível") | **Consumo** com fonte real. O Codex grava `rate_limits` em cada sessão (`~/.codex/sessions`: `used_percent`, janela, `resets_at`; 26% da semana em 29/10). No Claude, o CLI mostra o uso no `/usage`; falta escolher a leitura. |
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

## Parecer do validador de invariantes (29/10/2026)

O parecer foi NÃO RATIFICÁVEL: 50 janelas, 7 que bloqueiam e 5 contradições
de documento (já corrigidas). As regras abaixo entram no desenho, e o número
é o da janela no parecer.

**Achado que vale também para o executor de hoje (J7), resolvido em 29/10.**
O `claude -p --bare` autentica só por chave de API e nunca pelo OAuth da
assinatura, então o papel Claude do executor não autenticava. O dono
autorizou uma prova mínima.
- O executor passou a usar `--restricted --strict-mcp-config` com `--tools`
  explícito. Isso foi provado numa chamada real: resposta pela assinatura,
  com ~5 mil tokens de contexto, contra ~178 mil no modo normal.
- O Codex já estava certo: sandbox só-leitura, aprovação "never", ~2 mil
  tokens.
- O papel de codificação com Bash não rodou de verdade. Isso fica para o
  PAINEL-34.

**F2, a frota:**
- **Projetos (J1):** a frota só escolhe modelos e nunca habilita um projeto.
  O interruptor por projeto continua no contrato até o play da F3.
- **Perfil antigo (J2):** o `PERFIL-IA/v1` deixa de valer, por decisão do
  dono (28/10), e o doc muda na mesma fatia. A fila mostra "perfil antigo
  ignorado".
- **Troca de frota (J3):** a tentativa congela a frota inteira na reserva, e
  o HANDOFF grava as tuplas. Trocar a frota não cancela o que já está
  rodando.
- **Confirmação (J4):** o preparar guarda a versão-base, e o confirmar
  recusa se ela mudou. A versão é um inteiro crescente mais um hash, com
  histórico só de acréscimo.
- **Arquivo ruim (J5):** frota ilegível, ausente ou inválida trava tudo, sem
  cair para nenhum padrão. A gravação usa tmp + rename.
- **Catálogo e falhas (J6):** o catálogo de modelos é fechado no código.
  `impedido` de CLI ou modelo pausa a frota sem gastar tentativa da carta. A
  pausa por limite de uso vale por provedor, para todos.
- **Blocos (J8):** são dois blocos com validadores separados, o executor
  (três papéis) e o zelador.
- **Origem (J9):** o HANDOFF passa a ter `origemModelos`, com valor
  `frota` ou `perfil-ia`.
- **Leitores (J10):** todos os leitores e escritores de perfil mudam na
  mesma entrega, inclusive o `passo-vigilia`.

**F3, o play e o zelador:**
- **Play (J11–J14):**
  - o play é relido antes de cada carta;
  - play ilegível conta como desligado e aparece assim na tela;
  - a vigília antiga é desligada na migração;
  - o job tem um lease em disco por projeto e um global.
- **Sessões (J16–J19):** o leitor de sessões é estrito. Um projeto fica
  ocupado se qualquer ação recente tocou um caminho dele ou uma carta dele.
  O zelador pula carta com lease, HANDOFF em andamento ou atividade de outro
  ator nas últimas horas.
- **Isolamento da CLI (J20, J21, J25):**
  - o retrato usa `GIT_OPTIONAL_LOCKS=0`;
  - a CLI roda num diretório vazio, recebe o retrato pela entrada padrão e
    fica em modo só-leitura;
  - a prosa passa por um filtro de segredo.
- **Vereditos (J22–J24):**
  - o painel confere a evidência e monta o HTML;
  - commit só vale se estiver no ramo principal;
  - cada veredito leva a digital da carta, e se a digital mudou o veredito
    vira MANTER.
- **Escrita no Plane (J26–J28):**
  - `external_id` = carta + tipo + hash;
  - cada GET vai pelo caminho do projeto;
  - labels são resolvidas por nome dentro do projeto; se a label não existe,
    o veredito vira MANTER;
  - toda escrita é verificada, e divergência suspende o play.
- **Elegibilidade (J29):** a escrita do zelador nunca pode mudar a
  elegibilidade. A prontidão é calculada antes e depois, e ele não toca
  carta com gate nem carta que bloqueia uma carta com gate.
- **Carta contestada (J30):** o zelador nunca desfaz um ato humano. Se o
  estado atual contraria o último recibo dele, a carta fica "contestada" e
  ele só pergunta. Uma `DECISAO/v1` impede repor `ASTARGNE`.
- **Concorrência (J31–J34):**
  - o zelador pula carta que está aberta na mesa;
  - CLI nunca roda sob a trava global, e o tempo sob a trava é curto;
  - o diário marca `ZELADOR_PENDENTE`, grava o comentário de intenção e,
    depois, o recibo de aplicação;
  - nada em carta com gate ou com tentativa nas últimas 24 h.
- **O que ele não toca (J35–J37):**
  - só carta folha;
  - descrição só se o trecho aparecer exatamente uma vez na releitura;
  - chave em arquivo 600, conferida a cada uso;
  - nunca Member no Anya.
- **Labels e consumo (J39, J40):**
  - o zelador põe `PRODUTO` junto com `ASTARGNE` e nunca o tira;
  - `IA_DECIDE` entra no padrão;
  - há teto diário de jobs, e o zelador cede quando o consumo fica alto.

**Fim do job (J41–J44):** "nada fazível" é calculado do Plane atual, sem
cache, por uma tabela fechada de quem destrava cada label. Três categorias
ficam separadas: "espera puxar (F4)", "tarefa do dono" e "decisão". Feita
quer dizer zero abertas e zero em andamento, não 100% arredondado.

**Diário (J45–J50):** um log só, de acréscimo, que o Hangar, a aba e o
C-3PO leem. Linha truncada no fim é tolerada; corrupção no meio do arquivo
falha fechada. Rotação diária, só campos estruturados. O droid do zelador
nasce do estado do job. O Hangar ganha rotas de escrita, cobertas pelo teste
que varre as rotas.

## F2 feita (29/10/2026)

O mecanismo está em [arquitetura.md](arquitetura.md) § orquestrador/ (Frota).
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
  mutação. Mecanismo em [arquitetura.md](arquitetura.md) § orquestrador/ (Frota):
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
    credencial dos dois CLIs; confirmar no piloto PAINEL-34. As fixtures seguem
    o formato documentado ("Claude AI usage limit reached|<epoch>" no `result`,
    com `is_error`).
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
4. **F3, o play por nave e o zelador:**
   - **Liberação do projeto:** cada projeto é liberado pelo play.
   - **Identidade nova "Zelador (Hangar)":** Member em cada projeto. O
     escritor estreito dela segue a lista fechada.
   - **Jobs de limpeza:** rodam sem o dono, numa CLI real, pela frota.
   - **Destaque do bloqueio:** aparece no painel lateral quando a nave fica
     sem nada a fazer.
5. **F4, puxar:** `READY TO DEV` e `READY TO TEST` pelo zelador e despacho pela
   frota, depois do piloto PAINEL-34.
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
