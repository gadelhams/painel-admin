> Registro histórico — não é estado atual. Primeira fatia do Orquestrador (11/10/2026); o estado vigente está em `../orquestracao-v2-integracao.md`. Movido de `docs/orquestracao.md` em 24/10/2026.

# Orquestrador de Projetos — primeira fatia (11/10/2026)

Registro histórico da primeira fatia. A implementação modular integrada
localmente em 20/10 está em [orquestracao-v2-integracao.md](orquestracao-v2-integracao.md);
o serviço local foi reiniciado após validação. Os nomes de módulos e da
interface abaixo descrevem a versão legada, preservada como adaptador.

O padrão transversal está em [ProjetosPessoais/ORQUESTRADOR-PROJETOS.md](../../ORQUESTRADOR-PROJETOS.md).
As cartas de migração são PAINEL-29 (épica), PAINEL-30 a PAINEL-36. Esta
fatia implementa os contratos (30), a projeção da fila e a simulação (31), e o
núcleo local de elegibilidade/lease/recuperação (32). O portão de execução,
piloto CKBL e retirada da porta 7791 permanecem fechados.

## Fluxo de leitura

**Gate** aqui é a etiqueta de fase `READY TO DEV` ou `READY TO TEST` aplicada
por pessoa ou IA com identidade de escrita autorizada e evidência registrada
na carta. Não é um estado do Plane, teste aprovado,
permissão de execução nem lease. Exatamente uma dessas etiquetas é necessária
para a carta entrar na fila candidata; todos os demais portões de elegibilidade
continuam obrigatórios. A aba e o C-3PO não aplicam gate: ambos usam apenas
a identidade Guest de leitura. Agentes externos autorizados podem marcá-lo no
Plane ao concluir discussão, avaliação ou pendência; sem inferir prontidão
apenas de uma etiqueta ou de texto solto.

`orquestracao.js` usa apenas `PLANE_API_KEY` Guest já usada por `plane.js`.
Consulta projetos e cartas paginadas; consulta relações formais para cartas
com READY TO DEV ou READY TO TEST. A resposta da aba contém estado, gate,
dependências, motivos, agente, lease, tentativa e histórico. `Depende de:` na
descrição sem relação formal bloqueia a carta; sem relação, exige declaração
explícita de ausência de dependências. Leitura de relação com erro
também bloqueia. Não se interpreta a etiqueta como autorização.

O contrato `.orquestrador.json` é lido no servidor pelo ID exato do projeto
Plane do catálogo; não aceita caminho do navegador. Contrato ausente,
malformado, sem opt-in ou com modelo/esforço diferente do declarado gera
impedimento. Nenhum executor está marcado disponível nos contratos atuais.
O navegador recebe apenas os campos necessários da fila, nunca a chave.

## Estado local e recuperação

`orquestracao-core.js` porta a semântica útil de `registro.py` do
SupervisorHandoff: trava exclusiva de curta duração (trava órfã expira após
30 s e só é recuperada se o PID antigo morreu), lease por carta com
expiração, touchpoints JSONL, tentativa nomeada, chave de idempotência e
resultado. A reserva concorrente é serializada; repetição da mesma chave
devolve a tentativa anterior. Lease expirado gera `RECUPERACAO` antes de nova
reserva. Lease ou touchpoint ilegível bloqueia. O diretório padrão é
`~/.local/state/painel-admin/orquestracao`, fora do repositório.

`GET /api/orquestracao` só lê. `POST /api/orquestracao/simular` recalcula a
fila e confere um comando estático do contrato, mas não cria lease nem inicia
processo. Todas as outras rotas de orquestração recusam ação. O C-3PO consulta
`fila_orquestracao` e pode explicar/propor; suas ferramentas seguem só leitura
e `tools: []`. Nenhuma identidade de escrita foi colocada no Painel.

`GET /api/orquestracao/prontidao?carta=<UUID>&gate=READY%20TO%20DEV` (ou
`READY TO TEST`) faz pré-checagem de uma carta sob demanda, inclusive sem
etiqueta. Consulta as relações formais dessa carta, simula o gate escolhido e
devolve pendências técnicas de despacho e ajustes de gate/evidência separados
na mensagem, sem
alterar Plane, contrato, lease ou executor. Um resultado técnico verde não
aplica a etiqueta nem autoriza despacho. Contrato ausente ou agente indisponível
bloqueiam despacho, mas não, por si só, a marcação de READY no Plane.

## Interface (protótipo Protocolo)

O HTML anexado pelo dono em 11/10/2026 é referência **de layout**, não uma
especificação de autorização ou fonte de dados. A aba usa a hierarquia do
protótipo (projetos, consulta central, impedimentos, relatório/fila e
touchpoints). Desde 12/10, `publico/protocolo.css` aplica a identidade visual
às cinco abas sem mudar as interações. Os números,
estados e motivos vêm da leitura real; não há progresso, agentes ativos ou
eventos de exemplo. A lista lateral mostra todos os projetos do catálogo,
inclusive os sem gate ou sem acesso Guest ao Plane; CKBL entrou no catálogo,
mas não tem contrato opt-in. O filtro inicial mostra candidatas com um ou dois
gates; "Aguardando gate" isola cartas ainda sem etiqueta e "Todas as cartas"
expõe também rejeições sem gate. Cada cartão revela os
motivos, dependências, agente, lease, tentativa, resultado e histórico; o
botão de simulação não inicia processo. Os botões "Pré-checar DEV/TEST"
mostram as pendências atuais para cada fase e tornam explícita a exigência de
evidência e autoria, humana ou de IA autorizada.

O botão de consulta abre o console C-3PO sem enviar mensagem nem ligar o
microfone. A voz permanece push-to-talk explícita no console existente;
O dono confirmou em 12/10 que a entrada planejada é a API de voz da xAI
(`XAI_API_KEY`), com ElevenLabs na saída; esta fatia não copia a chave nem
muda provedor ou habilita escuta contínua. O modo
"mãos livres" e confirmações do mock não são recursos ativos.

## Ativação local e decisões do dono (11/10/2026)

O dono autorizou reiniciar a cadeia até `painel.casa.astargne.com`. O serviço
`painel-admin` foi reiniciado às 23:43 WEST; `GET /api/orquestracao` respondeu
200 com 324 cartas, 9 candidatas e 0 elegíveis, todas as candidatas sem
contrato local. HTML e JavaScript novos responderam 200 no loopback. O Caddy
permaneceu ativo, sem reinício: sua configuração não mudou e ele também atende
Plane/S3. TLS do domínio validou; o 404 a partir do Linux é o bloqueio
esperado, pois somente o Windows do dono pode acessar o painel pela borda.
Falta conferir a tela no navegador desse Windows.

Escolhas registradas, **não implementadas ainda**: piloto CKBL somente
offline/sem jogo; identidade exclusiva de escrita/execução restrita ao piloto
em vez da chave Guest do Painel; GrokBot Voice para entrada e ElevenLabs para
saída. Nenhuma identidade foi criada ou recebeu permissão nesta fatia.

## Passos pendentes para despacho

1. Formalizar relações de dependência no Plane e revisar estados/gates dos
   projetos piloto. CKBL continua sem contrato opt-in.
2. Definir identidade de serviço separada, autorização por projeto, executor
   disponível, confirmação explícita vinculada à carta/versão/comando,
   revalidação atômica e auditoria de resultado no Plane.
3. Provar com piloto offline controlado e revisão humana; só depois avaliar
   a aposentadoria do dashboard legado e da porta 7791.

Nenhum ciclo real do SupervisorHandoff, deploy, launcher, Steam, Proton,
Bannerlord, save ou playtest nativo participa deste portão.
