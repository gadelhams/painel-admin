# Orquestrador v2 — integração local da onda 2 (20/10/2026)

Esta é a árvore de trabalho servida em `127.0.0.1:7777` após reinício local
em 20/10/2026. A integração preservou o reskin Protocolo das cinco
abas, o catálogo de projetos, C-3PO e as alterações locais anteriores. Os
arquivos `orquestracao.js`, `orquestracao-core.js` e
`publico/orquestracao.js` ficam como adaptadores legados, mas o servidor e a
aba usam `orquestrador/` e `publico/orquestrador.js`. SupervisorHandoff e sua
porta 7791 não foram alterados ou retirados; doc 59 segue legado, sem
sincronização automática com cards.

O Plane é a fonte de cartas, estados, relações e conversas. O card é o canal
de handoff entre orquestração, desenvolvimento e validação; comentários são
lidos com a chave Guest. A aba contém Demanda, Conversa no card, Papéis e
modelos, Consumo e Tentativas. Cada carta mostra razões de inclusão ou
rejeição e pré-checagem de `READY TO DEV`/`READY TO TEST`. Uma IA autorizada
poderá aplicar ambos os gates com evidência no Plane; a aba atual só calcula
pendências, não os marca e não despacha.

`orquestrador/politica.js` exige carta folha, estado compatível, exatamente
um gate, dependências formais concluídas e coerentes com a descrição,
contrato opt-in válido, agente elegível e lease livre. ASTARGNE, bloqueio e
decisão humana impedem despacho. O contrato local limita ambiente,
comandos, testes, aceite, proibições, modelos e esforço. A seleção manual
por papel é vinculante: Claude `max` e OpenAI `xhigh` (extreme high) são os
padrões; não há downgrade nem escolha substituta silenciosa.

`orquestrador/estado.js` mantém trava, lease, touchpoints, tentativa e chave
de idempotência. Recuperação sob a trava remove lease cujo resultado já foi
gravado, registra tentativa órfã antes do touchpoint e expira lease vencido,
sem tomar lease ainda ativo. Reserva e renovação reconciliam antes de agir.
Nenhuma rota de execução foi aberta; a simulação não cria lease nem processo.

O registro de perfil no card tem preparação e confirmação separadas, revalida
sessão do Cadastro Único e origem HTTPS, usa identidade Plane exclusiva e
limitada por projeto, versão do card e idempotência. Na onda 2, o `.env` do
serviço não continha `PLANE_ORQ_WRITE_KEY`; a escrita estava desativada.
A chave Guest não pode ser promovida a escritor.
O painel não recebe token no navegador. O medidor de consumo aceita apenas
fonte recente de cota de assinatura; sem ponte, mostra indisponível, não
estima uso pela chave de API.

Verificação local: `npm test` 90/90 e `git diff --check` sem erro. Instância
temporária em `127.0.0.1:7787` respondeu 200 para HTML, JS, CSS e fila:
13 projetos, 423 cartas, 0 elegíveis, `execucaoHabilitada: false`; depois
foi encerrada. Uma revisão independente exigiu alinhar o C-3PO à fila v2;
feito, o portão foi repetido e aprovado. Reiniciou-se somente
`painel-admin.service` local. Na 7777, HTML, JS, CSS, fila, modelos, canal
do card e consumo responderam 200; preparo sem sessão recebeu 403. Consumo
sem fonte foi mostrado como indisponível. Uma leitura de canal teve timeout
ao concorrer com outras consultas, mas a repetição isolada retornou 200 e
15 comentários. Sem Caddy/DNS/servidor externo, ciclo Supervisor ou jogo.
O domínio via borda só é acessível pelo Windows autorizado; renderização
nesse navegador permanece por conferir.

Próximo portão: validar visualmente no navegador do proprietário, completar
contrato/dependências do piloto CKBL offline e sem jogo, conectar a identidade
restrita ao SSO para registro de perfil e provar handoff real no card. O
despacho exige outra entrega com confirmação explícita, revalidação atômica,
executor validado e auditoria; concluir cards não é licença automática para
executar. Brevo continua opção para notificações técnicas, não requisito de
conta Plane. A porta 7791 só sai depois de equivalência funcional comprovada.

## Onda 3 em desenvolvimento (20/10/2026)

As dependências de PAINEL-37 a PAINEL-42 foram formalizadas como relações
`blocked_by` no Plane e suas descrições passaram a declarar `Depende de:` com
IDs exatos. Os cards receberam comentários de handoff; nenhum gate foi
marcado. A aba separa agora pendências **para marcar o gate** de impedimentos
**para despachar depois do gate**. O primeiro conjunto não exige contrato nem
executor, mas exige folha, estado adequado, dependências concluídas e ausência
de bloqueio humano. A marcação por IA usa `GATE/v1`, evidência, identidade
restrita, sessão do Cadastro Único e confirmação em duas ações; falha parcial
fica incerta, sem retry automático.

O canal do card tem `HANDOFF/v1` para orquestração, desenvolvimento e validação,
com tentativa, resumo, resultado, evidências, versão, autoria e idempotência.
Desenvolvedor/validador precisam de tentativa registrada, e o validador de um
handoff do desenvolvedor da mesma tentativa. Comentários livres não são
autoritativos. A interface permite preparar/confirmar; sem identidade de
escrita configurada, apenas lê.

Entrada por voz: push-to-talk de até 45 segundos/8 MiB envia áudio ao proxy
do servidor, que usa xAI `grok-voice-transcribe-2.0` em `pt-PT`. O retorno é
somente texto de proposta; para usá-lo no handoff ainda é preciso evidência e
confirmação. A saída ElevenLabs existente não foi alterada. A chave
`XAI_API_KEY` existe no `.env` de `_oldSistemaLoreEngine`, mas não foi copiada
para o serviço do Painel: a rota falha fechada com 503 sem ela. Nenhuma API de
voz real foi chamada nos testes.

Suíte local após esta fatia: 103/103 testes e docs 0 erros. O Painel publicado
e o domínio não foram reiniciados por esta fatia. Ainda faltam portão de
execução, contrato e piloto CKBL offline, prova de ponta a ponta com identidade
restrita, consumo de assinatura com fonte verificável e aceitação no Windows.

## Portão de despacho preparado, ainda desligado (20/10/2026)

O servidor agora oferece preparação e confirmação SSO em duas ações para o
despacho, mas **não injeta executor e mantém `execucaoHabilitada: false`**.
Nenhuma requisição consegue iniciar um agente real nesta configuração. O
núcleo testado com executor falso revalida card, gate, relações, contrato,
comando, perfil autoritativo e modelo/esforço antes e depois do lease. Grava
handoff de início e resultado no card e touchpoints locais. Falha após lançar
o executor conserva o lease para revisão; vencimento não reexecuta. A chave
de idempotência fica vinculada a carta, comando, versão, perfil e usuário;
repetição após perda da confirmação em memória não cria segunda tentativa.
A UI mostra o portão desligado e, quando houver habilitação específica,
exibirá comando e perfil exatos antes de confirmar.

O executor **real** ainda exige isolamento, prova dos flags exatos da CLI,
política offline/sem jogo e uma identidade técnica Plane exclusiva. Não
marcar agentes `disponivel: true` ou ligar o portão sem essa prova. A chave
Guest, o C-3PO e a voz continuam incapazes de executar. A matriz em
[casos-de-teste-orquestrador.md](casos-de-teste-orquestrador.md) distingue
testes falsos de aceitação humana. Nenhuma execução paga, ciclo do Supervisor
ou deploy foi usada. O serviço local `painel-admin.service` foi reiniciado
após 110/110 testes e docs 0/0. Em `127.0.0.1:7777`, HTML, JS, CSS e fila
responderam 200: 13 projetos, 423 cartas, zero elegíveis, despacho desligado.
Painel, SupervisorHandoff e CK3 Bannerlord seguem visíveis. Não houve mudança
de Caddy/DNS nem prova visual do Windows autorizado.

O ID estável do proprietário (1) foi conferido pela lista do Cadastro Único,
e IDs de projeto/ator CKBL foram anotados no `.env` local 0600. A primeira
tentativa de transferência automática das chaves foi recusada pela revisão de
segurança por usar stdout; seus marcadores temporários foram removidos. Após
pedido explícito do dono, as chaves `PLANE_ORQ_WRITE_KEY` e `XAI_API_KEY`
foram instaladas por patch local que não imprimiu valores. `PLANE_API_KEY`
Guest foi preservada, o `.env` ficou 0600 e o serviço local foi reiniciado.
Leitura com a conta técnica: ator esperado, CKBL 200, PAINEL 403. A fila na
7777 respondeu 200 com 13 projetos/423 cartas/0 elegíveis, execução false;
pré-checagem CKBL-19 indicou portão de escrita de gate disponível. Nenhuma
etiqueta ou comentário foi aplicado para essa verificação. Ainda faltam prova
SSO/Plane confirmada em card descartável e chamada real de voz xAI; presença
da chave não prova o serviço externo. O despacho permanece desligado.

## Onda 4 — contrato do piloto e comandos estáticos (20/10/2026)

CKBL optou pelo contrato local `.orquestrador.json` com três comandos G0
offline: documentação, planejamento e testes de planejamento. O contrato
valida, mas seus agentes permanecem `disponivel: false`; nenhuma carta CKBL
tem gate, portanto a fila continua sem candidato executável. Os checks G0
passaram (docs 64 arquivos, 0 erro/aviso; planejamento 16 módulos, 16 épicos,
76 histórias; 11/11 testes). Não houve jogo, save ou playtest.

A validação de contratos agora aceita apenas formatos estáticos de teste
enumerados no padrão geral, recusando `node -e`, `python -c`, flags extras,
travessia, modelos com formato de flag e IDs duplicados. Uma função pura
prepara as flags de modelo/esforço: Claude `--model`/`--effort`; Codex
`exec --model`/`model_reasoning_effort`. Ela não lança processo, passa prompt
ou escolhe permissões. O teste não inspeciona o conteúdo dos scripts nem
`npm test`; isso continua pendente para um executor isolado. Não foi
injetado executor real nem alterado `execucaoHabilitada: false`.
Suíte completa do Painel: 112/112 testes; docs 14 arquivos, 0 erros/avisos;
`git diff --check` limpo. Após reiniciar apenas `painel-admin.service`,
`GET /api/orquestracao` na 7777 mostrou 13 projetos, 423 cartas, 92 CKBL,
zero elegíveis e execução desligada. CKBL-19 expõe “sem gate de prontidão”
e “nenhum agente elegível”; o contrato não é mais marcado como ausente.

## Onda 5 — prova de escrita CKBL e candidato PLAYER (20/10/2026)

Por autorização do dono, a identidade técnica criou e comentou CKBL-93.
O card está publicado, sem gate, e visível ao leitor Guest do Painel;
o comentário foi relido com autoria técnica esperada. A mesma chave retorna
403 para PLAYER. Isso prova escopo básico de API, **não** confirma ainda o
fluxo SSO/preparar/confirmar no navegador. Nenhum lease ou CLI foi iniciado.

O dono propôs PLAYER-35 como piloto. A pré-checagem na fila atual (13 projetos,
425 cartas, zero elegíveis) mostra: sem gate, estado não executável, contrato
local ausente e nenhum agente. A pré-checagem READY TO DEV acrescenta ausência
de declaração formal de dependências; não pode registrar o gate. O plano de
proxy exige primeiro F0 (comparação casa/RackNerd com a lista fechada) e F1
(prova do navegador à rede local). Nenhuma dessas evidências foi entregue,
portanto não avançamos para F2 nem alteramos o player, a borda ou o deploy.
PLAYER precisará de identidade própria; a chave CKBL não será ampliada.
Handoffs foram relidos em PLAYER-35 e PAINEL-29/33/34, sem alterar estados ou
etiquetas.

## Onda 6 — candidato PLAYER e identidade por projeto (20/10/2026)

O dono registrou F0 (PLAYER-36) e F1 (PLAYER-37) no Plane. PLAYER-38 é a
única folha com `READY TO DEV`; o contrato local autoriza apenas `npm test` e
`node scripts/portao.mjs`, mas ambos os agentes continuam indisponíveis.
PLAYER-39–41 têm `ASTARGNE` e não foram alteradas nesta entrega.

O serviço agora seleciona escritor e autor técnico pelo ID do projeto, com
identidades CKBL e PLAYER separadas e fixadas no catálogo. A chave PLAYER está
apenas no `.env` local 0600; Guest continua só leitura, a chave CKBL não foi
ampliada e `execucaoHabilitada` permanece falso. O validador legado importa a
política canônica; a declaração “sem dependências” só vale como linha isolada,
não como comentário incidental sobre pacotes ou código.

Prova local sem deploy: `npm test` 113/113 e docs 14 arquivos, 0 erro/aviso;
instância temporária em loopback mostrou PLAYER-38 com somente “nenhum agente
elegível”, prontidão sem pendências de gate, canal com `READY TO DEV` assinado
pelo autor PLAYER, registro de perfil disponível e POST sem SSO rejeitado 403.
A instância foi encerrada; o serviço público não foi reiniciado. Não houve
despacho, CLI paga, teste de stream, deploy ou escrita nas cartas PLAYER-39–41.
Falta selecionar agente com aprovação do dono, provar SSO e confirmação em
navegador autenticado e revisar o executor antes de qualquer piloto real.

## Onda 7 — agente aprovado e leitura publicada (20/10/2026)

O dono aprovou OpenAI `gpt-6-astra`/`xhigh` para orquestração, codificação e
testes, e validação no primeiro piloto PLAYER, bem como o reinício local do
Painel. Só `OpenAI.disponivel` passou a `true` no contrato PLAYER; Claude
continua `false`. A aprovação ainda **não** gravou o perfil de modelos no
card: isso exige sessão SSO e confirmação pela interface. Tampouco ligou o
executor do servidor.

Após `npm test` 113/113 e docs 0 erros/avisos, `painel-admin.service` foi
reiniciado na 7777. GET da fila mostrou PLAYER-38 elegível, sem motivos de
rejeição, com os dois comandos do contrato, enquanto o modo permaneceu
`leitura-e-simulacao` e `execucaoHabilitada: false`. GET de modelos mostrou
OpenAI disponível, Claude indisponível e nenhum perfil registrado; o canal
releu `READY TO DEV`. POST de preparo de despacho sem SSO retornou 403. Uma
simulação explícita confirmou `gpt-6-astra/xhigh` nos três papéis, sem
fallback, lease, processo ou escrita no Plane. HTML com Host canônico
respondeu 200 no loopback e o serviço permaneceu ativo sem erros no journal.

A prova em navegador Windows com SSO e confirmação continua pendente: nenhum
navegador está conectado ao Codex neste ambiente. Não foram executados os
comandos do PLAYER, nem houve stream, deploy do player ou despacho.

## Onda 8 — ambos os modelos no seletor (21/10/2026)

O dono esclareceu que quer Claude e OpenAI disponíveis para a seleção
manual por papel. O contrato PLAYER agora marca `claude-opus-5/max` e
`gpt-6-astra/xhigh` como disponíveis; nenhum perfil foi escrito no card.
A escolha exata, inclusive uma combinação mista, fica para a etapa final de
configuração e prova da interface com SSO e confirmação. Disponibilidade no
contrato não comprova que as CLIs/modelos pagos estão operacionais e não
ativa o executor real. Os cenários finais estão em
[casos-de-teste-orquestrador.md](casos-de-teste-orquestrador.md).

Verificação: contrato validado com seleções Claude/max, OpenAI/xhigh e mista,
sem iniciar CLI. A API ativa da 7777 mostrou ambos disponíveis e nenhum
perfil registrado; a simulação mista devolveu os três papéis exatos, sem
fallback, lease, processo ou escrita. O contrato é relido a cada consulta,
então sua ativação não exigiu reiniciar o serviço. A fila agora lista os dois
agentes disponíveis separadamente do responsável da tentativa, que permanece
“não atribuído” até haver lease; a projeção anterior podia fazer Claude parecer
escolhido por ser o primeiro da lista. Após reiniciar apenas o serviço local
do Painel, GET da fila mostrou PLAYER-38 elegível, Claude e OpenAI em
`agentesDisponiveis`, sem lease/tentativa e `execucaoHabilitada: false`.
O portão do Painel passou 114/114 testes e docs 14/0/0; Player check-docs
7/0/0 e diff check limpo. Não houve despacho nem CLI real.

## Onda 9 — navegador isolado e roteiro SSO seguro (22/10/2026)

Foi acrescentado um pacote de desenvolvimento isolado em `e2e/`, sem alterar
as dependências do serviço. Sete testes Playwright exercitam a UI real com
Plane, SSO e consumo simulados: cinco abas, inclusão/rejeição com motivos,
pré-checagem de gate, seleção mista Claude/max + OpenAI/xhigh, resposta sem
SSO e preparo com segunda confirmação. A fixture serve apenas os arquivos
estáticos em loopback, intercepta a API e não acessa o serviço 7777.

O smoke separado para Windows abre um navegador temporário no Cadastro Único,
espera o login do dono e visita a aba pelo domínio `painel.casa.astargne.com`.
Ele permite apenas POST de validação/preparo, verifica o botão de confirmação
sem clicá-lo e relê perfil, lease e tentativa. Não guarda senha, cookie, trace
ou screenshot da sessão. Não houve registro de perfil, execução de CLI,
comando PLAYER, despacho nem deploy.
Handoffs com o marcador `ORQ-ONDA9-PLAYWRIGHT-20261022` foram registrados e
relidos uma vez em PAINEL-29/31/33 e PLAYER-38; estados e gates não mudaram.
No primeiro smoke do dono, o script contou os seletores antes de a API de
modelos responder e falhou com `0 !== 3`, antes de validar ou preparar. A
espera explícita foi acrescentada e coberta por resposta atrasada no
Playwright local.
O handoff da correção (`ORQ-ONDA9-SMOKE-WAIT-20261022`) foi comentado em
PAINEL-29/31/33 e PLAYER-38 sem mudar estados ou gates.
No segundo smoke, o dono passou pela validação e pelo preparo com SSO real:
a UI exibiu a segunda confirmação e as escolhas exatas, sem clicar nela.
O script então reprovou uma contagem global de oito requisições POST que ele
próprio bloqueou, sem registrar a origem. GET direto após a falha confirmou
perfil, lease e tentativa nulos e execução desligada. A v3 continua a
bloquear qualquer escrita alheia a validar/preparar, mas separa tentativas
dirigidas ao Painel das de outras origens. No terceiro smoke (v3, Windows),
o dono informou `Painel 0, outras origens 8` e `PASSOU`: SSO real, três papéis
e preparo em duas ações comprovados. Oito escritas de outras origens foram
bloqueadas; nenhuma escrita inesperada ao Painel foi tentada. O script não
clicou em confirmar e o GET final dele, seguido de releitura local, mostrou
perfil, lease e tentativa ausentes e execução desligada. O teste local passa
7/7. Permanecem pendentes confirmação deliberada do perfil e portão real
de execução; este smoke não os autoriza.
O handoff final `ORQ-ONDA9-SSO-PASS-20261022` foi comentado e relido em
PAINEL-29/31/33 e PLAYER-38, sem alterar estados ou gates.

## Onda 10 — seletores separados por papel (22/10/2026)

Após a prova Windows, o dono observou que o primeiro campo misturava provedor
e modelo. A UI agora apresenta **Provedor → Modelo → Esforço** em cada papel.
O catálogo continua vindo do contrato via API: trocar provedor filtra os
modelos; trocar modelo repõe apenas os esforços permitidos para ele. Qualquer
alteração apaga uma confirmação preparada, sem escrever no card. O esforço
`xhigh` continua exibido como `extreme high`; o valor enviado e auditado
permanece `xhigh`. Não há modelos inventados nem fallback.

Playwright local 9/9, inclusive catálogo com dois modelos por provedor,
payload exato, invalidação de confirmação e layout desktop/celular; portão
do Painel 114/114 e docs 14/0/0. O smoke Windows no repositório foi adaptado
para os três campos; a prova SSO v3 anterior permanece válida para o portão,
mas não é prova visual desta nova disposição. Serviço e API não foram
reiniciados: os arquivos estáticos são lidos a cada GET. Nenhum perfil,
lease, tentativa ou executor foi ativado.
Handoff `ORQ-ONDA10-3SELECTS-20261022` registrado e relido em
PAINEL-29/31/33/42, sem mudar estado ou gate.

## Revisão de prontidão — proveniência dos gates (22/10/2026)

A auditoria transversal encontrou etiquetas READY anteriores sem recibo
estruturado no card. A fila integrada agora lê o canal do Plane para toda
carta com um gate e só a considera elegível quando encontra `GATE/v1` do
mesmo gate, assinado pela identidade de escrita configurada para o projeto.
Ausência de identidade, comentário ausente, autoria diferente ou leitura
ilegível aparecem como impedimentos explícitos no cartão. A pré-checagem
separa o ajuste de evidência dos impedimentos técnicos de despacho. Não
marca gates retroativamente nem transforma comentário livre em autorização.
O portão de execução continua desligado.
Após o portão local (115/115 testes; docs 14/0/0), somente o serviço de
usuário `painel-admin` foi reiniciado. A API local respondeu 200 com 432
cartas, 10 candidatas, apenas PLAYER-38 elegível e execução desligada;
CAD-24 mostra o novo impedimento de proveniência, enquanto PLAYER-38 mantém
`provenienciaGate: verificada`. Sem deploy ou despacho.

## Triagem de pendências para READY TO DEV (22/10/2026)

A aba ganhou uma classificação só-leitura, acionada manualmente, das cartas
abertas sem READY. Ela lê as relações formais das folhas com concorrência
limitada, exclui concluídas/canceladas e separa carta-pai, rascunho,
marcadores humanos, dependência pendente/indisponível/não auditada, estado
inadequado e escopo/aceite ainda a revisar. As categorias se sobrepõem;
`ASTARGNE` não é automaticamente uma decisão de produto. O filtro por
categoria mostra as cartas e o detalhe expõe seus motivos. A triagem não
marca gate, não altera Plane e não mistura contrato/agente/lease — portões
posteriores de despacho — com prontidão do trabalho.

Na fotografia de 22/10, 432 cartas foram lidas, 357 estavam abertas sem gate,
54 delas eram cartas-pai e 303 folhas. Nas folhas, 122 tinham marcador
explícito de intervenção humana; a triagem reconhece também uma anotação
legada `DONO` (123 no total). Havia 82 com dependência formal pendente, 219 com dependências sem
prova formal suficiente e 289 estado inadequado. São contagens sobrepostas,
não 122 decisões de produto. O detalhamento e as ressalvas ficam no relatório
da auditoria do workspace Codex desta tarefa.
O portão local passou 117/117 testes e documentação 14/0/0; Playwright
isolado 10/10. Após reinício somente do serviço local, a rota GET na 7777
respondeu 200 com as mesmas 357/303/54 cartas e mostrou PAINEL-33 em
`DEPENDENCIA_PENDENTE` (31/32) e `ESTADO_INADEQUADO`. Handoffs com marcador
`ORQ-TRIAGEM-DEV-20261022` foram registrados e relidos uma vez em
PAINEL-29/31/41, sem mudar estado ou gate. Nenhum despacho ou deploy.

## Conversa sobre pendências no C-3PO (22/10/2026)

O C-3PO usa a mesma triagem e a mesma pré-checagem por carta da aba, via
`fila_orquestracao` em modos `triagem_dev` e `prontidao`. A ferramenta MCP
continua uma das quatro permitidas, só-leitura, com resposta limitada a
30 cartas. Para discutir escopo e aceite, ele deve consultar os documentos
modeladores do projeto, separar problema técnico, autorização e decisão real
de produto e nunca assumir que `ASTARGNE` significa escolha de produto.
No card, **Discutir pendências com C-3PO** abre o console com a pergunta
pré-preenchida; enviar texto ou acionar voz exige gesto do dono. Nenhum gate,
perfil, comentário, lease ou despacho decorre desta conversa.
Verificação desta fatia: `npm test` 121/121 e docs 14/0/0; Playwright local
11/11, incluindo abertura contextual sem POST; `git diff --check` limpo.
Somente `painel-admin` foi reiniciado na 7777; HTML e JS responderam 200.
Handoff `ORQ-C3PO-TRIAGEM-20261022` foi relido uma vez em PAINEL-29/31/41,
sem alterar estado ou gate. Nenhuma chamada real ao LLM foi usada no teste.

## Fecho de 24/10/2026 — auditoria, executor real e canal legado

Auditoria adversarial do subsistema (cinco lentes concluídas: política,
concorrência, protocolo, front e docs; segurança e testes caíram no limite de
sessão e ficam para a próxima rodada). Correções aplicadas e pinadas em
`test/correcoes-auditoria.test.js`: `Depende de:` lido em bloco (`<ul><li>` do
Plane) e na forma `Dependências: X`, com códigos só de siglas lidas; filtro de
canceladas pela grafia real `cancelled`; anotação legada `(DONO …)` conta como
decisão humana; proibidos por substring; estado ilegível impede gate;
`registrarGate` faz as varreduras fora da trava e exige evento local de
aplicação antes de dizer "aplicado"; `comTrava` espera até 60 s enquanto o dono
da trava viver; renovação de lease deixa de ser pegajosa; `RESULTADO_EXECUTOR`
é gravado antes de qualquer chamada ao Plane; lease vencido sem `TENTATIVA`
expira como órfão; recusas anteriores a qualquer escrita devolvem 422 e
descartam o desafio; teto de confirmações conta só pendentes; escritores tratam
409 do Plane como idempotência e o de gate relê as etiquetas antes do PATCH;
`recuperarInterrupcoes` roda no arranque. No front: ajustes de gate e gates
atuais na pré-checagem, resultado confirmado sobrevive ao re-render, perfil
registrado inicializa os seletores, dependências da triagem, caixas de
confirmação não acumulam, limites de texto antes do POST, leituras pesadas
abortam a anterior e o canal é lido direto pelo projeto. Módulos legados
`orquestracao.js`, `orquestracao-core.js` e `publico/orquestracao.js` removidos
(cópias divergentes, sem importador); worktree `painel-admin-orq` removido
(snapshot em `git stash`, doc em `historico/`).

**Executor real** em `orquestrador/executor-cli.js` (contrato X01–X06 da matriz):
três papéis como CLIs descartáveis num worktree fora da árvore, comando de
aceite do contrato sem shell, ambiente por lista branca, flags fixas de
isolamento, timeout por grupo, `impedido` para infraestrutura. `servidor.js` só
o constrói com `ORQ_EXECUCAO_HABILITADA=true`; a variável **não** está no
`.env` — ligar é o "vai" do dono (PAINEL-34). Limitação registrada: a
proveniência aceita recibo `GATE/v1` antigo para etiqueta removida e recolocada
à mão; a correção exige ler as atividades do card e fica como pendência.

**Canal legado**: `orquestrador/canal-legado.js` + `SupervisorHandoff/scripts/estado_canal.py`
(só leitura, sem fetch) mostram no tópico "Canal legado (doc 59)" o que o
dashboard 7791 mostra: cards do controle, quem tem a vez, trava, pausas,
execução e touchpoints dos dois configs. Equivalência de leitura provada na
7787 (19 e 30 cards; 1 e 2 pendências); as ações do ciclo não migram por
decisão do dono. A suíte legada ficou verde no Omarchy (PAINEL-36).

Portão: `npm test` 133/133, docs 14/0/0, Playwright 11/11; smoke em 7787 com
fila (13/418, PLAYER-38 elegível, execução `false`), legado 200, despacho sem
SSO 403, HTML 200. Commit `b7d59fb` no painel e `93473fc` no SupervisorHandoff
(autorizados pelo dono em 24/10; rollback do painel = `dba9618`). Sem push,
sem deploy, sem CLI paga.
