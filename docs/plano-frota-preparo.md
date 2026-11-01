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
- anti-lavagem: para declarar, nenhum código de carta (de qualquer sigla, salvo o da própria) na
  descrição nem nos comentários de não-zelador, nenhum vocabulário de dependência na descrição, as
  três listas de dependência presentes nas relações e nenhum tipo além de `blocking`/`*_before`;
  as relações são relidas sob a trava; tirar código de carta da descrição conta como trava levantada
  pelo zelador (J58), até o `DECISAO/v1`;
- J57: não tira do Backlog a carta que um não-zelador pôs lá vinda de Todo/In Progress; não declara
  onde um não-zelador tirou uma declaração ou um marcador (qualquer data);
- J58: exceção ligada ao tipo — na própria carta só somem os dois motivos; numa vizinha só troca o nome
  do estado em `dependência <carta>: <estado>`, e ela segue não-pronta;
- o gate sai com a digital da releitura de verificação do preparo (D1); preparo feito e gate recusado
  vira `PREPARADO_SEM_GATE` no diário, contado à parte, com comentário `[ZELADOR/v1]` na carta (salvo
  lease ou reserva de outro: só o diário, como na B4);
- a reconciliação nunca rola o preparo para a frente (fecha APLICADO, DESFEITO ou ABORTADO), e em
  todo tipo recusa o PENDENTE cuja descrição difere da recalculada ao vivo;
- o retrato da CLI leva, para a candidata em Backlog, as relações e os códigos citados com o estado.

**Janelas fechadas, cada uma com teste e mutação nomeada por cópia de arquivo** (`test/frota-preparo.test.js`;
a simulação em `test/frota-f4b-simulacao.test.js`):

| Janela | Teste | Mutação que o deixa vermelho |
|---|---|---|
| forma da CAD-32 (D1, D10) | Backlog sem relação → 1 PATCH (Todo + linha), recibo, READY TO DEV com chave UUIDv5(carta, gate, D1) | regex sem o sufixo do zelador; PATCH em duas partes; gate comparando com a digital do retrato |
| D2 | a linha fixa declara; "nenhuma (exceto CAD-31)" não; data de São Paulo | parêntese genérico na regex |
| D13 (15) | alvo = unstarted de menor `sequence`; sem `sequence` ou empate recusa | alvo sem excluir bloqueado/em espera |
| 5 | "Depende de CAD-31", "Dependência: CAD-31", "Bloqueada por", "Requer LOR-45", comentário humano com código, `relates_to` → MANTER, nada escrito | varredura de código e vocabulário removida |
| 14 | relações `{}` → declarar recusado | chave ausente tratada como lista vazia |
| 13 | relação criada sob a trava, antes do PATCH → ABORTADO, sem PATCH | relações não comparadas no `conferirAntes` |
| 6 | ATUALIZAR do zelador tira "Precisa do CAD-31" → PRONTA seguinte MANTER | levantamento ignora código tirado |
| 7 | humano Todo → Backlog → MANTER | J57 do estado só olhando terminal |
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
- o comentário de intenção do preparo usa um texto fixo do painel, não o comentário da CLI.

**Fora desta fatia (irmãs registradas, não corrigidas):** janela 18 — o gate repõe READY TO DEV que
um humano tirou; janela 19 — `<p>Sem dependências.</p><p>Depende de CAD-31</p>` passa no juiz hoje.

**Não verificado no real:** nenhum preparo rodou contra o Plane de verdade. A J57 da declaração (D9) e a
lavagem em duas passadas (D7) leem `old_value`/`new_value` das atividades de descrição; se o Plane
gravar esses campos vazios na edição de descrição, as duas ficam cegas e sobram a anti-lavagem pelo
texto atual e a CLI. Resíduo declarado: dependência em prosa sem código e sem o vocabulário só a CLI julga.
