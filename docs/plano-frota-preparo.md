# PAINEL-62: preparo do zelador (01/11/2026)

Parte do [plano da frota do Hangar](plano-frota-do-hangar.md). Mecanismo em
[arquitetura/orquestrador-puxar.md](arquitetura/orquestrador-puxar.md) (F4b, preparo) e a exceção da
J58 em [arquitetura/invariantes.md](arquitetura/invariantes.md).

**Por quê.** Decisão do dono (01/11/2026): "a ideia do zelador é justamente validar as dependências e
retirar do backlog". Antes, o PRONTA só virava READY TO DEV com a carta já em Todo/In Progress e já
declarando as dependências, e a J58 proibia o zelador de aproximar a carta do gate: a frota nunca
despachava. Caso real (01/11 16:09): a CAD-32 recusada por "estado inadequado para desenvolvimento"
e "dependência declaração: ausência de dependências não declarada na carta".

**O desenho** (parecer do validador de invariantes, D1–D15):
- o PRONTA ganha um **preparo**, tipo de mudança `{ tipo: 'preparo', estado, declarar }`, num PATCH
  único: Backlog → o estado de grupo unstarted de menor `sequence` (nunca um bloqueado/em espera;
  `sequence` ausente ou empate recusa) e/ou a linha fixa
  `Dependências: nenhuma (declarada pelo zelador do Hangar em DD/MM/AAAA)`, com a data de São Paulo;
- só o painel o monta, depois do juiz real (`preavaliar`: identidade de gate, nenhum gate, pendências
  contidas nos dois motivos) e da prontidão simulada na cópia (tem de dar pronta); nenhum JSON da CLI
  o produz e a prosa da CLI não entra nele;
- **o painel veta só o certo; o zelador julga a prosa** (decisão do dono, 01/11/2026, depois de a
  anti-lavagem anterior recusar 0 de 15 cartas reais do CAD por "Migrado do Linear: AST-181",
  ADR-0005, READY-20261022, "dependências" do npm e prosa comum). Em **todo** preparo, também no
  que só tira do Backlog (J1), MANTER sem escrita quando: há código de carta de sigla do catálogo (o
  mesmo conjunto do juiz), que não é a própria nem está formalizado como relação, no título (W1), na
  descrição ou num comentário de não-zelador (W2); há relação não formal (`relates_to`,
  `duplicate`…) ou relações fora da forma (as três listas de dependência ausentes); as relações são
  relidas sob a trava. Código de fora do catálogo (AST-, ADR-, READY-, ID3-) não veta;
- **linhas suspeitas:** prosa com o vocabulário de dependência no título, na descrição (fora das
  linhas que já declaram "sem dependências") ou num comentário de não-zelador não veta; vai ao
  retrato da CLI, e o PRONTA tem de trazer `prosaJulgada: [{linha, porque}]` para TODA linha
  suspeita, comparada pelo texto normalizado; faltou uma, MANTER "o zelador não julgou: <linha>".
  O campo só vale no PRONTA; o `porque` passa pelo filtro e pelos tetos do `comentario` da CLI, e cada
  julgamento entra inteiro como evidência do recibo GATE/v1 (até 8, de 500 caracteres; o que não cabe
  recusa antes do preparo). A intenção do preparo segue com texto fixo. O vocabulário tem fonte única
  (`texto-dependencia.js`, com os termos do estado bloqueado);
- tirar da descrição um código de carta ou uma linha com esse vocabulário conta como trava levantada
  pelo zelador (J58, segunda passada), até o `DECISAO/v1`. **Só destrava a mesa de verdade (W3):**
  `external_source` da mesa, autoria do Painel Admin (`PLANE_ADMIN_ACTOR_ID`, injetado pela montagem
  em `criarZelador` e no job), nunca editado, com o cabeçalho; sem o ator configurado nada destrava. O
  `ehDecisaoDaMesa` frouxo (qualquer ator, só o texto) fica só na B2, onde recusar é o lado seguro. Atividade de descrição do zelador ilegível
  vale do `created_at` dela; sem instante legível, da atividade legível mais recente da carta, e o
  motivo diz depois de quando o `DECISAO/v1` a reconhece. Descrição vazia (null) é legível;
- J57: não tira do Backlog a carta que um não-zelador pôs lá, venha de onde vier; não declara onde um
  não-zelador tirou uma declaração ou um marcador (qualquer data);
- J58: exceção ligada ao tipo — na própria carta só somem os dois motivos; numa vizinha só troca o nome
  do estado em `dependência <carta>: <estado>`, e ela segue não-pronta;
- o gate sai com a digital da releitura de verificação do preparo (D1); preparo feito e gate recusado
  ou abortado vira `PREPARADO_SEM_GATE` no diário, contado à parte, com comentário `[ZELADOR/v1]` na
  carta, de chave `<chave da intenção>:sem-gate` (salvo lease, reserva ou play de outro: só o diário,
  como na B4). Num erro comum (W4), as etiquetas são relidas antes do aviso: "não saiu"
  (`PREPARADO_SEM_GATE`) só com a releitura conferindo; READY TO DEV na carta vira
  `PREPARADO_GATE_INCERTO` "gate presente, mas a verificação falhou; conferir", e releitura que falha,
  "estado do gate incerto"; o erro segue depois disso; gate DIVERGENTE continua
  DIVERGENTE, com o motivo dizendo que o preparo foi aplicado;
- a reconciliação nunca rola o preparo para a frente (fecha APLICADO — só no id do estado alvo —,
  DESFEITO ou ABORTADO), e em todo tipo recusa o PENDENTE cuja descrição difere da recalculada ao vivo;
- o retrato da CLI leva, para cada candidata, as linhas suspeitas exatas e, para a em Backlog, as
  relações e os códigos citados com o estado.

**Janelas fechadas, cada uma com teste e mutação nomeada por cópia de arquivo** (`test/frota-preparo.test.js`,
a correção em `test/frota-preparo-correcao.test.js`, a prosa julgada em `test/frota-preparo-prosa.test.js`, a simulação
em `test/frota-f4b-simulacao.test.js`):

| Janela | Teste | Mutação que o deixa vermelho |
|---|---|---|
| forma da CAD-32 (D1, D10) | Backlog sem relação → 1 PATCH (Todo + linha), recibo, READY TO DEV com chave UUIDv5(carta, gate, D1); intenção sem a prosa da CLI | regex sem o sufixo do zelador; PATCH em duas partes; gate comparando com a digital do retrato; `v.comentario` na intenção |
| D2 | a linha fixa declara; "nenhuma (exceto CAD-31)" não; data de São Paulo | parêntese genérico na regex |
| D13 (15) | alvo = unstarted de menor `sequence`; sem `sequence` ou empate recusa | alvo sem excluir bloqueado/em espera |
| 5 | CAD-31 na descrição ou em comentário e `relates_to` vetam; "Bloqueada por" e "Requer LOR-45" (LOR fora do catálogo) exigem julgamento → MANTER, nada escrito | varredura de código do catálogo removida |
| 14 | relações `{}` → declarar recusado | chave ausente tratada como lista vazia |
| 13 | relação criada sob a trava, antes do PATCH → ABORTADO, sem PATCH | relações não comparadas no `conferirAntes` |
| 6 | ATUALIZAR do zelador tira "Ver também o CAD-31" → PRONTA seguinte MANTER | levantamento ignora código tirado |
| 7 | humano Todo → Backlog → MANTER | J57 do estado só olhando terminal |
| J1 | só estado: CAD-31, comentário com código, `relates_to` vetam; "Bloqueada pela migração" sem julgamento → MANTER | defesas só quando declara |
| J2 | ATUALIZAR tira "Bloqueada pela migração…" ou "Requer o deploy…" → PRONTA seguinte MANTER | segunda passada sem o vocabulário |
| J8 | termos novos e os do estado bloqueado casam (hoje marcam linha suspeita, não vetam); "depois do almoço" passa | vocabulário antigo |
| J3 | `marcarGate` lança erro comum → `PREPARADO_SEM_GATE` no diário e na carta, job ERRO | erro relançado sem diário nem carta |
| J4 | rascunho surgido depois do juiz → MANTER (a cópia tem de sair pronta) | sem a exigência de pronta |
| J4 | carta em triage não vai para Todo | estado sai de qualquer grupo |
| J4, J11 | humano In Progress → Backlog e Done → Backlog → MANTER | J57 só vinda de unstarted; só de unstarted/started |
| J4 | reserva de outra sessão entre o preparo e o gate → só o diário | comentário mesmo com posse alheia |
| J5 | descrição do zelador ilegível: MANTER com o instante; `DECISAO/v1` posterior destrava; sem instante, vale a atividade legível mais recente | `quando` NaN |
| J5 | carta sem descrição (null) prepara e recebe o gate | null tratado como ilegível |
| J9 | queda antes do PATCH e humano põe a carta noutro unstarted → ABORTADO | `jaAplicada` por grupo |
| J10 | chave do aviso = chave da intenção + `:sem-gate` | chave pela D1 (repete quando a D1 falta) |
| desvio 4 | DIVERGENTE depois do preparo diz "preparo aplicado" | DIVERGENTE devolvido como veio |
| L1 | forma da CAD-31 (AST-181, ADR-0005, "dependências" do npm) sem julgamento → MANTER com a linha; o retrato passa a linha | linha suspeita não exigida; qualquer sigla veta |
| L1 | com toda linha julgada → Todo, linha, READY TO DEV; o porquê no recibo | recibo sem o julgamento |
| L1 | duas suspeitas, uma julgada → MANTER pela outra | (a mesma de cima) |
| L1 | CAD-14 solto veta; formalizado como relação concluída, só a prosa é julgada | citação formalizada vetada |
| W1 | "Exportar CSV depois do CAD-31" no título veta | título ignorado |
| W2 | comentário "Bloqueada até a migração do banco sair." exige julgamento; "Ver o CAD-31." veta | comentários sem código |
| campo | `prosaJulgada` fora do PRONTA recusa; porquê curto, com marcador ou fora da forma recusa | campo aceito fora do PRONTA |
| W3 | DECISAO/v1 de humano não destrava; sem `PLANE_ADMIN_ACTOR_ID` nada destrava; o do Painel Admin destrava | destrave pelo texto de qualquer ator |
| W4 | erro depois da etiqueta → `PREPARADO_GATE_INCERTO` "gate presente"; releitura falha → "incerto"; sem etiqueta → "não saiu" | aviso sem a releitura |
| W5 | preparo ABORTADO há menos de 24 h → MANTER sem intenção nem escrita; depois de 24 h volta; diário ilegível → MANTER | freio ignorado; diário ilegível segue |
| 8 | humano tirou a linha (de 30/10) → MANTER | comparação pelo texto exato com a data de hoje |
| 4 | A bloqueia B: preparo de A passa com B só trocando o estado; outra mudança em B recusa | comparador de string inteira; vizinha ignorada |
| escopo | ATUALIZAR anexar "Sem dependências." segue recusado | exceção ligada ao motivo, não ao tipo |
| estreita | "Em espera" → MANTER; outro motivo que some recusa | exceção aceita qualquer remoção |
| 9 | identidade sem `escritorGate` → 0 PATCH | `podeRegistrarGate` ignorado (preparo sem o juiz) |
| 11 | humano comenta entre o preparo e o gate → `PREPARADO_SEM_GATE`, motivo e comentário | MANTER genérico |
| 10 | queda entre intenção e PATCH → reconciliação ABORTADO, sem PATCH | rolar para a frente |
| 10 | queda entre PATCH e recibo → reconciliação APLICADO; PRONTA seguinte com preparo vazio marca o gate | `jaAplicada` sem o tipo |
| D11 | PENDENTE adulterado (`descricaoNova` diferente) → ABORTADO | reconciliação sem a comparação |
| D3 | marcadas depois = antes + a linha fixa | aceita qualquer linha marcada nova |
| D1 | nenhum JSON da CLI produz o preparo | tipo aceito em `validarVeredito` |
| simulação | Backlog sem declaração → Todo, linha, READY TO DEV e despacho do Hangar | regex sem o sufixo do zelador |

**Escolhas (provisórias, para o orquestrador):**
- a relação da janela 13 nasce no gancho `aoPedir` do Plane falso, na leitura dos comentários sob a
  trava: o `antesDoPatch` dispara dentro do próprio PATCH, depois de qualquer conferência possível;
- gate DIVERGENTE depois do preparo continua DIVERGENTE (suspende o play), não `PREPARADO_SEM_GATE`;
- J5: o destrave da atividade ilegível sem `created_at` é o `DECISAO/v1` posterior à atividade legível
  mais recente da carta (sem nenhuma legível, a recusa fica);
- o comentário de intenção do preparo usa um texto fixo do painel, não o comentário da CLI.

**Fora desta fatia (irmãs registradas, não corrigidas):** janela 18 — o gate repõe READY TO DEV que
um humano tirou; janela 19 — `<p>Sem dependências.</p><p>Depende de CAD-31</p>` passa no juiz hoje.

**Resíduos declarados:**
- **a prosa é julgada pela IA, com o julgamento no recibo:** a linha suspeita que a CLI julgar como
  não-dependência passa; o painel só garante que ela foi julgada e que o porquê ficou registrado;
- a decisão da mesa que destrava é conferida pela fonte, pelo ator, pelo `edited_at` e pelo
  cabeçalho, não pelos campos do corpo (`lerDecisao` mora atrás da porta `decisao.js`, que só exporta
  a fonte e o cabeçalho);
- abort por relações divergentes (W5, **fechado** em 02/11/2026): o preparo abortado grava o PENDENTE,
  a intenção e o recibo ABORTADO uma vez; o freio, pelo diário local, não repete o preparo numa carta
  cujo último preparo fechou ABORTADO nas últimas 24 h (MANTER "preparo abortado há menos de 24 h",
  sem intenção, PENDENTE nem escrita; diário ilegível também recusa). Resta uma escrita por carta a
  cada 24 h enquanto a divergência durar;
- TOCTOU entre o `GET /relations/` sob a trava e o PATCH (milissegundos): uma relação criada nesse
  intervalo, fora do painel, não é vista;
- rollback para uma versão anterior com PENDENTE de preparo aberto: ela o lê como `FORA_DA_LISTA`
  "nada escrito", e o rótulo mente; a regra é não voltar assim ([operacao.md](operacao.md) § rollback);
- no real, em 01/11, a chave do zelador leu `/relations/` igual à Guest nas 35 cartas do CAD, e
  nenhuma tinha relação: a forma de lista não vazia não foi medida; se ela divergir entre as duas
  leituras, vale o abort com freio acima;
- um nbsp (`&#160;` ou outro que a normalização não troque) entre "nenhuma" e "(" na linha
  fixa faz o juiz não ver a declaração (o preparo então não sai, pela prontidão simulada).

**Não verificado no real:** nenhum preparo rodou contra o Plane de verdade. A J57 da declaração (D9) e a
lavagem em duas passadas (D7) leem `old_value`/`new_value` das atividades de descrição; se o Plane
gravar esses campos vazios na edição de descrição, as duas ficam cegas e sobram a anti-lavagem pelo
texto atual e a CLI. Dependência em prosa sem código e sem o vocabulário não vira linha suspeita: só a CLI a vê.
