# Frota do Hangar — droids configurados no Hangar, zelador varrendo o Plane

Plano de 28/10/2026, ainda não construído (PAINEL-54). Pedido do dono: "os CLIs têm que ser
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
1. Pula o projeto que tem sessão viva de outro droid (o coletor de sessões já
   sabe), os congelados e o Anya.
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
3. **F2, a frota:** a configuração geral, gravada com SSO e duas ações. O
   executor lê a frota no lugar do `PERFIL-IA/v1`. No Hangar, a cor do droid
   passa a ser a do papel.
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
- **A mesa vem antes da frota.**

Antes de abrir o executor, o desenho
passa pelo `validador-invariantes`: o zelador mexe em estado persistido
alheio (o Plane) e corre contra sessões vivas.
