# contas.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta. A tabela fechada mora em `contas/tabela.js`, o processo em
`contas/processo-ssh.js`, a redação em `contas/redacao.js`, a leitura da
saída em `contas/saida-central.js` e `contas/ssh.js` só reexporta. O cliente
e as rotas `/api/contas/*` ficam em `contas/fronteira.js`. **Escrita exige
SSO** (29/10/2026, N5 da correção da F2): toda rota de escrita da tabela passa
pelo mesmo autorizador das ações privilegiadas (`criarAutorizador`, sessão do
Cadastro Único + origem da borda + JSON) **antes** de ler o corpo; sem a sessão,
401, e sem autorizador configurado, 503. Assim o executor local, que alcança o
loopback, não muda o banco do CadastroUnico. A leitura (GET) segue como antes.

(13/09/2026, Fase 5 do `../../../historico/PLANO-CADASTRO-UNICO.md`) —
administração do **CadastroUnico** (login único do `astargne.com`). A API
interna do central (`/interno/*`, `127.0.0.1:8790`) só existe no loopback
**do servidor**, autenticada por `TOKEN_INTERNO` — e **o token nunca sai
do servidor**: cada ação da aba vira UM `ssh` (`spawn`, sem shell no PC,
chave `paroquia-vultr`, timeout 15 s) rodando um script fixo lá dentro que
lê o token com `sudo`, grava um config do `curl` em `mktemp` sob
`umask 077` (apagado por `trap … EXIT`), aborta com exit 97 se o token
não veio (`test -s`), e chama o central com `curl --max-time 10 -sS`. O
PC só vê `{ status, corpo }`. Tabela **fechada** de operações
(`OPERACOES`: método + rota), `:id` validado como inteiro positivo antes
de entrar na string, corpo JSON **só pelo stdin** (`curl -d @-`) — dado de
usuário jamais entra na linha de comando. Falha de ssh/script vira
`502 {erro:'sem acesso ao servidor'}`; **401 do central também é 502**
(`… (token interno recusado)`): o bearer nasce no servidor, então 401 só
significa encanamento quebrado, nunca "usuário sem permissão"; stderr vai
ao log mesmo com exit 0, redigindo qualquer `Bearer …` por defesa em
profundidade. Executor injetável (`{ executar }`) e binário injetável
(`criarExecutorSsh({ binario, timeoutMs, maxSaida })`) —
`test/contas.test.js` nunca chama ssh de verdade: o encanamento real
(stdin/EOF/timeout/teto) é provado com `node -e` como binário falso.


Papéis por app (24/10/2026, ADR-0006 do central): `/api/contas/apps` traz
`papeis` e `papelPadrao` por app; o editor de permissões e o convite mostram,
por app, uma seleção "sem acesso / papéis" e mandam `apps: [{app, papel}]`; os
chips mostram "App · Papel". Central antigo (sem papéis) cai no comportamento
anterior: checkbox entra/não entra. O backend do painel não muda (o corpo
passa pelo stdin do ssh como sempre).
