# Casos de teste — Orquestrador de Projetos

Data-base: 21/10/2026. Estes casos separam a prova automatizada com Plane,
SSO, voz e executor **falsos** da aceitação humana. Não iniciar `ciclo`/`vigiar`
do Supervisor, CLI paga, jogo, Steam, Proton, launcher, save, playtest nativo
ou deploy para cumprir esta matriz.

## Preparação segura

1. Executar `npm test` no `painel-admin`. A suíte usa serviços falsos e não
   exige chave Plane de escrita, xAI ou agente pago.
2. Abrir a aba Orquestração. Conferir a fila, filtros, projeto, card, estado,
   gate, dependências, contrato, motivos, agente, lease, tentativa, resultado
   e histórico. A chave Guest continua apenas de leitura.
3. Para ensaios manuais de escrita antes da etapa final, usar **projeto e card descartáveis** no
   Plane e identidade técnica separada, limitada a esse projeto. Não usar o
   token Guest nem os cards de produção. Preparar não equivale a confirmar.
4. Para piloto CKBL, pedir uma autorização específica de despacho offline e
   comprovar contrato, dependências, modelos, isolamento e comandos antes de
   mudar `disponivel` ou ligar o executor. Nenhum dos casos abaixo concede
   essa autorização.
5. Na etapa final do PLAYER-38, escolher os três papéis no Painel e registrar
   o perfil no card apenas com sessão SSO e confirmação do dono. O registro
   do perfil não autoriza despacho nem inicia os comandos `testes`/`portao`.

## Núcleo e elegibilidade

| ID | Cenário | Passos | Resultado esperado | Prova automática |
|---|---|---|---|---|
| E01 | Carta folha, estado correto, gate único, dependências concluídas, contrato válido e agente disponível | Simular comando permitido | Mostra elegível e plano exato; não cria lease nem processo | `orquestrador-core-v2.test.js` |
| E02 | Dependência formal pendente | Pré-checar e filtrar a carta | Mostra ID e estado da dependência; despacho negado | `orquestrador-core-v2.test.js`, `gate-plane.test.js` |
| E03 | Dependência citada em `Depende de:` sem relação Plane | Pré-checar | Mostra “não formalizada”; gate/despacho negados | `orquestrador-core-v2.test.js` |
| E04 | Carta com `READY TO DEV` e `READY TO TEST` | Pré-checar ambos | Conflito visível; não marca gate nem despacha | `orquestrador-core-v2.test.js`, `gate-plane.test.js` |
| E05 | Contrato ausente ou opt-in inválido | Selecionar carta | Mostra impedimento distinto do gate; simulação não executa | `orquestrador-core-v2.test.js` |
| E06 | Comando fora da lista ou proibido (`steam`, `playtest`, `deploy`, `ssh`); `node -e`, `python -c`, flag extra ou `../` | Solicitar simulação/preparo | Rejeitado antes de spawn, sem shell nem token no navegador | `orquestrador-core-v2.test.js` |
| E07 | ASTARGNE, BLOQUEADA ou decisão humana no card | Pré-checar | Impedimento explícito, mesmo com READY isolado | `orquestrador-core-v2.test.js`, `gate-plane.test.js` |
| E08 | Sem agente elegível | Selecionar carta com contrato válido e todos indisponíveis | Impedimento “nenhum agente elegível”, sem fallback | `orquestrador-core-v2.test.js` |
| E09 | Gate sem contrato/executor | Pré-checar carta folha pronta | Pode registrar prontidão com evidência; despacho continua impedido | `gate-plane.test.js` |
| E10 | Modelo ou esforço escolhido manualmente; agente indisponível ou nome com flag | Preparar prévia CLI sem processo | Flags refletem escolha exata; indisponível ou nome inválido falha sem fallback | `orquestrador-core-v2.test.js` |

## Concorrência, recuperação e escrita no card

| ID | Cenário | Passos | Resultado esperado | Prova automática |
|---|---|---|---|---|
| C01 | Dois despachos simultâneos para a mesma carta | Confirmar em paralelo com executor falso | Uma tentativa inicia; a outra vê lease e não executa | `despacho-controlado.test.js` |
| C02 | Mesma confirmação repetida | Repetir a confirmação com o mesmo id (processo vivo) ou reenviar a mesma chave ao serviço | Mesmo ID de tentativa; nenhum segundo spawn. Perdida a confirmação em memória (reinício), a proteção é o **lease** e a tentativa concluída pode ser reexecutada por nova confirmação — por desenho | `despacho-controlado.test.js` |
| C03 | Chave de idempotência reutilizada com comando/perfil diferente | Reenviar a chave alterando seleção | Erro; nenhuma execução adicional | `despacho-controlado.test.js` |
| C04 | Lease de simulação expirado | Avançar relógio falso e reservar | Recuperação nomeada uma vez; nova reserva só após reconciliação | `orquestrador-core-v2.test.js` |
| C05 | Lease real expirado ou falha após lançar executor | Avançar relógio falso ou lançar erro | Lease permanece para revisão humana; TTL não autoriza repetição | `orquestrador-core-v2.test.js`, `despacho-controlado.test.js` |
| C06 | Interrupção entre RESULTADO e remoção do lease | Simular reinício/reconciliação | Resultado conservado, lease removido, um touchpoint de recuperação | `orquestrador-core-v2.test.js` |
| C07 | Card alterado entre preparar e confirmar | Mudar versão do card no serviço falso | Confirmação falha fechada; não reserva lease nem chama executor | `despacho-controlado.test.js` |
| C08 | Handoff de validador sem desenvolvedor da mesma tentativa | Preparar handoff | Recusado; comentário livre não substitui handoff estruturado | `handoff-plane.test.js` |
| C09 | Gate com escrita parcial incerta | Falhar PATCH após comentário de evidência | Não repetir automaticamente; conferir card e etiqueta | `gate-plane.test.js` |
| C10 | Sessão SSO diferente ou ausente | Preparar em uma sessão e confirmar noutra | 401/403; corpo não processado sem autenticação | `orquestrador-sso.test.js`, `despacho-controlado.test.js` |
| C11 | Recusa antes de qualquer escrita (carta mudou, gate já presente, identidade ausente) | Confirmar | 422 `recusado; nada foi gravado` e desafio descartado; `incerta` só após evento `*_PENDENTE` | `correcoes-auditoria.test.js` |
| C12 | Lease vencido sem `TENTATIVA` (queda entre as duas gravações da reserva) | Reconciliar | Expira como órfão mesmo em modo real; nunca "revisão humana" eterna | `correcoes-auditoria.test.js` |

## Executor real (CLIs falsas; `ORQ_EXECUCAO_HABILITADA` ausente no serviço)

| ID | Cenário | Passos | Resultado esperado | Prova automática |
|---|---|---|---|---|
| X01 | Validação sem efeito colateral | `validar` com pasta sem git, binário ausente, `scripts.test` com `\|`/`ssh`, script com token proibido, modelo fora do contrato | Cada caso recusa com motivo; nada criado em disco | `executor-cli.test.js` |
| X02 | Execução completa | Três papéis (claude/codex falsos) + comando do contrato | Flags exatas por papel; prompt com carta, aceite e briefing; worktree `orq/<carta>-<id>` fora da árvore; commit no ramo; árvore principal intacta; `concluido`; resultado respeita `validarHandoff` | `executor-cli.test.js` |
| X03 | Ambiente limpo | Papel falso grava o ambiente recebido | `PLANE_API_KEY`/`XAI_API_KEY` ausentes; `CI=1`, `NO_COLOR=1` presentes | `executor-cli.test.js` |
| X04 | Comando de aceite falha ou veredito `REPROVADO`/`INCONCLUSIVO` | Script que sai 1; validador falso reprova | `rejeitado`; sem alterações não há commit | `executor-cli.test.js` |
| X05 | Timeout e limite de uso | Papel que dorme além do limite; stderr com `usage limit` | `impedido`; grupo de processos morto (o dormente não deixa marcador); para no primeiro papel | `executor-cli.test.js` |
| X06 | Dependências | `package-lock.json` sem `node_modules` | `npm ci --ignore-scripts --no-audit --no-fund` no worktree; npm ausente → `impedido` | `executor-cli.test.js` |
| X07 | Primeira execução paga | Com o "vai" do dono: `ORQ_EXECUCAO_HABILITADA=true`, carta descartável com perfil e gate, confirmar | Worktree, logs em `saidas/<tentativa>/`, dois handoffs no card, resultado e custo na evidência; comandos do projeto piloto só os do contrato | **pendente** — decisão do dono |

## Canal legado (doc 59)

| ID | Cenário | Passos | Resultado esperado | Prova automática |
|---|---|---|---|---|
| L01 | Leitura dos dois canais | Abrir o tópico "Canal legado (doc 59)" | Cards, quem tem a vez, trava, pausas, touchpoints por config; nenhum fetch, ciclo ou escrita | `canal-legado.test.js`, `SupervisorHandoff/tests/test_estado_canal.py`; leitura real na 7787 em 24/10 (19 e 30 cards) |
| L02 | Falhas do leitor | Config ausente, JSON ruim, código ≠ 0, timeout | `disponivel: false` com motivo; cache evita um python por clique | `canal-legado.test.js` |

## Interface e integrações

| ID | Cenário | Passos | Resultado esperado | Prova automática / aceitação |
|---|---|---|---|---|
| I01 | Cinco abas no tema Protocolo | Percorrer Projetos, Backlog, Decisões, Orquestração e Contas no Windows autorizado | Layout consistente, sem perder funções anteriores | `protocolo-ui.test.js`; visual humano pendente |
| I02 | Projetos sem READY, incluindo CKBL, Painel e Supervisor | Selecionar “Todas as cartas” e “Aguardando gate” | Projetos aparecem com motivos por carta; não somem por falta de gate/contrato | `orquestrador-ui.test.js`; conferência humana |
| I03 | Voz xAI | Gravar até 45 s e pedir transcrição em projeto de teste | Só proposta de texto; não grava card, gate ou despacho sem confirmações | `voz-xai.test.js`; API real não chamada |
| I04 | Consumo de assinatura sem fonte atual | Abrir tópico Consumo | “Indisponível”; não mostrar uso de API como percentual do plano | `orquestrador-v2.test.js` |
| I05 | Identidade técnica ausente em instância de teste | Preparar gate, perfil e handoff | UI informa indisponibilidade; Guest não ganha escrita | `perfil-plane.test.js`, `gate-plane.test.js` |
| I06 | Portão real desligado | Abrir card elegível | UI informa que nenhum comando será iniciado | `despacho-controlado.test.js`; conferência humana |
| I07 | Doc 59 e dashboard 7791 | Ler status legado sem iniciar ciclo | Permanecem operacionais até equivalência comprovada | Inspeção, sem ciclo real |
| I08 | Claude e OpenAI selecionáveis no PLAYER-38 | Abrir Papéis; escolher provedor, modelo filtrado e esforço em cada papel; validar combinações homogêneas e mista, sem confirmar perfil | Ambos aparecem disponíveis; fila lista os dois, mas não atribui responsável; cada prévia conserva provedor/modelo/esforço, sem fallback ou escrita no card | `orquestrador-v2.test.js`, `orquestrador-core-v2.test.js`, Playwright; API ativa em leitura |
| I09 | Configuração final do perfil no card | Com SSO do dono, selecionar os três papéis, preparar, revisar carta/versão/esforços e confirmar uma vez | Antes de confirmar, nenhum perfil; depois, um comentário `PERFIL-IA/v1` de autoria técnica PLAYER e GET mostra a seleção exata; nenhum lease ou comando iniciado | `perfil-plane.test.js`, `orquestrador-sso.test.js`; smoke SSO Windows de preparo passou em v3; confirmação real pendente |
| I10 | Confirmação não abre despacho | Após I09, consultar fila e tentativa, sem clicar em despacho | `execucaoHabilitada: false`, lease ausente e histórico sem nova tentativa; `PLAYER-39`–`41` intactas | `despacho-controlado.test.js`; leitura da API/Plane na etapa final |
| I11 | Acesso real aos dois modelos e esforços | Na etapa final autorizada, conferir autenticação das CLIs e fazer ensaio isolado por modelo/esforço em carta descartável, sem comandos do PLAYER nem despacho | Claude/max e OpenAI/xhigh realmente acessíveis; erro explícito se indisponível, nunca troca silenciosa de provedor/modelo/esforço | Prévia de argumentos em `orquestrador-core-v2.test.js`; prova paga real pendente |
| I12 | Interface real com Plane/SSO simulados | Rodar `npm ci && npm test` em `e2e/` | Cinco abas, motivos de elegibilidade, gate, três seletores por papel com filtro e layout responsivo, carregamento atrasado, bloqueio de escrita inesperada e separação preparar/confirmar; nenhuma escrita real | Playwright `e2e/tests/orquestrador.spec.mjs` 9/9 (22/10) |
| I13 | SSO real até o limite seguro | No Windows autorizado, rodar `e2e/windows-sso-smoke.mjs`; entrar na janela temporária | Validação e preparo funcionam com SSO do dono; confirmar não é clicado, e GET posterior conserva perfil/lease/tentativa ausentes | **Passou no Windows (v3, 22/10):** três papéis e escolhas exatas, 0 escritas inesperadas ao Painel, 8 de outras origens bloqueadas; GET final e releitura local sem perfil/lease/tentativa |
| I14 | Troca de provedor/modelo após preparar | Em fixture SSO, preparar perfil e trocar o provedor de um papel | A confirmação anterior desaparece; modelo e esforço são recalculados só entre as opções daquele provedor; nova validação envia a combinação exata | Playwright `e2e/tests/orquestrador.spec.mjs`; 9/9 (22/10) |

## Critério de saída

O núcleo pode ser aceito com a suíte local verde, documentação sem erro e
interface conferida. **Despacho real** requer uma prova adicional: identidade
técnica restrita configurada e verificada, contrato do projeto piloto revisado,
relações formais completas, executor isolado que prove modelo/esforço/comando
e inspecione os scripts permitidos (inclusive o conteúdo de `npm test`),
ensaio com serviço falso e confirmação humana específica para um card. A
matriz não converte “READY” em autorização de execução.
