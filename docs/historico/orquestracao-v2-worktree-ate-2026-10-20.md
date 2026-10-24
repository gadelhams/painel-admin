> Registro histórico — não é estado atual. Doc exclusivo do worktree `painel-admin-orq` (branch `orquestrador-v2`), integrado à árvore principal em 20/10/2026 e removido em 23/10/2026; o estado vigente está em `../orquestracao-v2-integracao.md`.

# Orquestrador de Projetos — extração modular (20/10/2026)

Esta worktree deriva de `main` sem copiar as alterações locais misturadas do
Painel ou do SupervisorHandoff. Seu módulo v2 foi integrado na árvore local
do Painel em 20/10; o serviço local foi reiniciado após o portão e atende
`painel.casa.astargne.com` pelo acesso restrito. Nenhum estado ou gate do Plane foi alterado
pela execução do produto.

## Fonte e canal

O Plane é a fonte de demandas, estados e conversas. O card é o canal entre
orquestrador, desenvolvedor e validador. `orquestrador/canal-plane.js` lê seus
comentários com a identidade Guest do Painel, sem escrever. Comentários novos
podem ser classificados por um cabeçalho textual opcional:

`[ORQ/v1 papel=orquestracao tentativa=<UUID>] Resumo e próxima ação`

Papéis aceitos: `orquestracao`, `desenvolvedor`, `validador`, `decisao`,
`resultado`. Comentário sem cabeçalho continua visível como `geral`.
Uma escrita futura deverá usar identidade restrita, comentário auditável,
chave de idempotência e referência à versão do card; não usará a Guest nem
interpretará texto livre como autorização. O doc 59 do SupervisorHandoff
permanece canal legado somente para consumidores antigos, não fonte
paralela da fila nova. Ainda não há sincronização doc 59 → Plane nem mapa
automático entre `C-NNNN` e os novos cards; o dashboard/porta 7791 não são
retirados nesta etapa.

## Handoff por entrega no Plane

Cada fatia verificável deve deixar comentário nas cartas PAINEL relevantes,
incluindo marcador único, autor, código/fluxo alterado, testes e resultados,
limites do que **não** foi ativado e próximo impedimento. Depois de publicar,
reler o card para confirmar o comentário e preservar estado, descrição e
gates salvo mudança autorizada e justificada separadamente. Comentário é
handoff/auditoria, nunca autorização de execução. A identidade de agente usada
para estes registros é distinta da chave Guest de leitura do Painel e da futura
identidade de serviço restrita ao piloto; nenhuma das três é compartilhada no
navegador.

Fatia SSO de 20/10/2026: comentários `ORQ-V2-SSO-20261020` verificados uma
vez em PAINEL-29, PAINEL-31 e PAINEL-33; estados e gates intactos. A distinção
entre comentário manual de handoff e escrita pelo produto permanece explícita:
o produto ainda não registrou perfil real no Plane.

## Módulos

- `politica.js`: contrato opt-in, elegibilidade, comando permitido.
- `estado.js`: lease, trava, tentativas, touchpoints e recuperação.
- `fila.js`: projeção do Plane, dependências, simulação e pré-checagem.
- `canal-plane.js`: leitura paginada e normalização dos comentários do card.
- `modelos.js`: catálogo declarado no contrato e validação da escolha por
  orquestração, codificação/testes e validação.
- `perfil-plane.js`: protocolo versionado no comentário da carta, vinculado a
  autor de serviço, projeto, carta, versão e chave de idempotência; escritor
  limitado a um projeto e injetável para testes.
- `sso.js`, `confirmacoes.js` e `api-perfil.js`: sessão do Cadastro Único
  verificada a cada ação privilegiada, permissão local pelo ID estável do
  proprietário, origem exata e desafio de confirmação de uso único.
- `consumo.js`: adaptadores de fonte verificável para porcentagens.

`POST /api/orquestracao/modelos/validar` valida uma **proposta**, sem persistir
nem chamar IA. O contrato declara modelos e esforços permitidos. Os padrões
existentes continuam Claude `max` e OpenAI `extreme high` (representado como
`xhigh` no seletor); uma eventual escolha diferente é explícita por papel.
`prepararPlanoExecucao` recebe as três escolhas e exige o executor exato de
cada papel; modelo ou esforço ausente, não permitido ou indisponível bloqueia
sem fallback. A simulação não escolhe mais o primeiro agente do contrato:
sem perfil explícito devolve `executaria: false`, e com perfil válido mostra o
plano exato. Isso é uma invariante para o futuro portão de execução, não uma
autorização de despacho. Com escritor falso, duas solicitações de mesma chave criam um
único comentário; versão obsoleta é rejeitada, escrita incerta não é repetida
automaticamente e só comentários do autor configurado são autoritativos.
Uma validação na UI não afeta execuções posteriores. O registro confirmado no
card passa a ser a fonte do perfil para simulações seguintes, sem despacho.
Disponibilidade no contrato não equivale a acesso real do provedor.

## Identidade local; caixa Brevo desacoplada

Correção de rumo de 20/10/2026: como as identidades Codex/Claude, o
Orquestrador usa conta local `orquestrador-ckbl@astargne.local`, sem senha
utilizável, e token próprio em `~/.config/plane/orquestrador-ckbl.token` (0600).
Não há login interativo, convite nem dependência de caixa postal. O usuário é
Guest no workspace e Member **somente** no CKBL; a API devolveu 200 para
leitura de CKBL e 403 para leitura de PAINEL. As permissões de escrita de
entidade foram conferidas na aplicação: CKBL permitido, PAINEL negado;
criação de projetos/membros negada. Reexecução do provisionamento conservou
os mesmos IDs de usuário e token. Isso não é escopo criptográfico da chave:
como Member no CKBL, a credencial pode fazer mais que comentar naquele
projeto. O produto deve limitar suas rotas e auditar cada escrita; não usar a
chave em outro serviço. Ela ainda **não foi configurada no Painel**.

O convite sem token emitido pela API v1 para
`orquestrador-ckbl@contas.astargne.com` foi revogado pela API suportada após
verificação de que estava pendente e não aceito. Não há convite ativo nem
link a enviar. A tentativa anterior de corrigir o token diretamente no banco
foi recusada pela revisão de segurança e não foi repetida.

Brevo permanece no backlog como caixa técnica **opcional** para futuros
códigos/notificações, não como pré-requisito de escrita no Plane. Se for
implementada, usar `contas.astargne.com` com Brevo Inbound Parsing, MX do
subdomínio, webhook HTTPS autenticado, armazenamento/visor local restritos,
retenção e teste end-to-end. Brevo não fornece uma caixa IMAP pronta nesse
fluxo. Não encaminhar à caixa pessoal; não publicar SMTP/MX no Omarchy nem
instalar servidor completo. Nenhum DNS/webhook foi alterado nesta fatia.

## Cadastro Único e registro confirmado

Somente `POST /api/orquestracao/modelos/preparar` e
`POST /api/orquestracao/modelos/confirmar` mudam de modo nesta fatia. A primeira
valida e guarda, por até 2 minutos, a carta, sua versão e as três escolhas,
sem escrever. A segunda aceita **somente** o ID do desafio e usa o conteúdo
guardado no servidor para registrar o comentário. Ações concorrentes, sessão
diferente, versão da carta alterada e confirmação expirada falham fechadas.
Após falha de escrita, o resultado é tratado como incerto: consultar o card e
os touchpoints antes de uma nova ação. Reiniciar o processo cancela desafios
pendentes. Não há rota de escrita direta, de gate ou de execução.

As duas rotas exigem Host `painel.casa.astargne.com`, Origin
`https://painel.casa.astargne.com`, `Sec-Fetch-Site: same-origin`, JSON e cookie
`astargne_session` válido. A sessão é revalidada por SSH no endpoint interno do
Cadastro Único em **cada** requisição; `TOKEN_INTERNO` continua no servidor
remoto, nunca é copiado para o Painel. `app: null` só autentica a sessão;
autorização fina usa `usuario.id` e `ORQ_OWNER_USER_ID` local. O cookie nunca
vai para URL, argv, log, browser JavaScript ou resposta. A leitura do Painel,
Contas, Severino e voz conservam as permissões existentes; isto **não** é uma
migração de autenticação do Painel inteiro.

Para habilitar **somente registro de perfil** após provisionar uma identidade
Plane exclusiva e restrita ao projeto piloto, configurar no `.env` **local do
worktree/serviço que será publicado**, fora do Git:

```text
ORQ_OWNER_USER_ID=<id numérico estável do proprietário no Cadastro Único>
PLANE_ORQ_WRITE_KEY=<chave de serviço distinta da PLANE_API_KEY Guest>
PLANE_ORQ_WRITE_PROJECT_ID=<UUID do único projeto permitido>
PLANE_ORQ_WRITE_ACTOR_ID=<UUID do usuário de serviço correspondente à chave>
```

O processo não herda `PLANE_API_KEY` para escrita. Sem qualquer uma dessas
quatro variáveis, a aba só valida/simula e mostra o impedimento. Antes de
configurar, confirmar no Plane que a chave não escreve fora do CKBL e que o
ator devolvido é o configurado; dentro do CKBL, limitar a rota a comentários
versionados e auditar cada escrita. Um limite somente no código local não
substitui a restrição da credencial. Não colocar
`TOKEN_INTERNO` no PC nem chaves no navegador. O piloto escolhido é CKBL,
offline e sem jogo; registrar perfil não cria lease nem roda testes. Despacho
real continua fechado e precisará de autorização/portão próprios.

A barra da aba agrupa Demanda, Conversa no card, Papéis e modelos, Consumo e
Tentativas. Cada carta mostra os impedimentos e pré-checagens DEV/TEST. O
consumo agora aceita **somente cotas incluídas na assinatura** Claude/OpenAI,
por janela e com amostra recente (até 15 minutos). Admite porcentagem da
própria fonte ou uso/limite da mesma janela; rejeita gasto, créditos, limite
de API e dados antigos. Sem ponte autenticada para as assinaturas, mostra
“indisponível”, não números estimados ou obtidos com chaves de API.

## Limites antes de produção

### Onda de desenvolvimento 1 — dependências auditáveis (20/10/2026)

As relações `blocked_by` explícitas dos cards PAINEL-31–36 foram
formalizadas e relidas no Plane: 31←30, 32←30, 33←31/32,
34←30/32/33, 35←32/34 e 36←32. A épica PAINEL-29 não foi usada como
pré-requisito dos filhos, evitando ciclo com seu próprio aceite; PAINEL-43
permanece opcional. As descrições PAINEL-30–36 foram reconciliadas dos
aliases `ORQ-00`–`ORQ-05` para IDs canônicos. PAINEL-30 declara ausência
de dependência executável e vínculo de escopo com a épica; os demais citam
as relações correspondentes. Nenhum estado ou gate foi alterado.

O leitor de dependências agora exige correspondência entre cada identificador
após `Depende de:` e uma relação formal na carta. Uma relação com outra carta
não satisfaz a menção textual; texto sem identificador auditável e declaração
`Sem dependências` contradita por relações também bloqueiam. As razões entram
na fila e na pré-checagem já exibidas na UI. O portão desta fatia foi
`npm test` (79/79). A leitura integrada com a chave Guest retornou 13
projetos, 423 cartas e 0 elegíveis. Pré-checagens reais só-leitura de
PAINEL-31, 33 e 34 mostraram todas as relações pendentes pelos IDs canônicos,
além do gate/estado/agente ausente. Sem escrita de produto, lease ou executor
ativados.

Mesmo com a identidade local provisionada, as variáveis continuam ausentes
do ambiente atual: **não há escrita real no Plane pelo produto**;
o portão autenticado está implementado e testado com executores falsos, mas
não foi ativado ou testado contra o Cadastro/Plane reais. Não há marcação
automática de gate, execução de CLI, voz xAI ou despacho. Falta verificar a
aba num
navegador do Windows, conectar fontes oficiais de consumo de assinatura,
conectar a identidade de escrita já validada ao portão autenticado e formalizar dependências do
piloto. `npm test` em 20/10/2026: 79/79 (inclui concorrência, sessão, origem,
duplicação, versão obsoleta e falha incerta). CKBL permanece offline e sem
jogo/playtest. Não executar ciclos reais do SupervisorHandoff nem fazer deploy
para validar a extração.

### Onda 2 — recuperação e integração local

`estado.js` agora reconcilia resultado já persistido com lease remanescente,
tentativa órfã anterior ao primeiro touchpoint e lease vencido, sob a mesma
trava da reserva. Repetir a recuperação não duplica eventos; lease ativo de
outro agente não é tomado. Reserva e renovação reconciliam antes de agir.
O teste adicional passou, totalizando 80/80 na worktree.

Os módulos, a aba e a suíte v2 foram integrados por patch seletivo em
`painel-admin/`, preservando o reskin e arquivos legados. A suíte da árvore
integrada passou 90/90; smoke HTTP local em porta temporária retornou
13 projetos, 423 cartas, 0 elegíveis e execução desativada. A rota de
preparo sem sessão recusou com 403. A porta temporária foi encerrada; naquele
ponto o serviço ainda não fora reiniciado. Handoff `ORQ-ONDA2-20261020` relido uma
vez em PAINEL-29/31/32/33/37, sem mudança de estados ou gates. A documentação
do corte fica na árvore principal em `docs/orquestracao-v2-integracao.md`.
Depois, uma revisão independente detectou `motor.js` ainda na fila legada;
o import foi alinhado ao v2, `npm test` 90/90 repetido e o serviço local
reiniciado. A fila na 7777 respondeu 13/423/0, modelos/consumo/canal
responderam após reinício, sem ativar identidade de escrita ou despacho.
