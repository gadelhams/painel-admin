# Relatório do executor — fatia F5-CONTAS-PAINEL (aba Contas)

**Data**: 13/09/2026.
**Estado**: ENTREGUE PELO EXECUTOR — aguarda cético + integrador; sem commit.

Contrato: Fase 5 do `../../../historico/PLANO-CADASTRO-UNICO.md` — aba **Contas** no painel
para administrar o CadastroUnico (convidar, permissões, desativar/reativar,
redefinir senha) sem que o `TOKEN_INTERNO` jamais chegue ao PC. Desenho fixado
pelo contrato e seguido: toda ação roda **no servidor**, via `ssh`, pelo backend
do painel; corpo JSON pelo **stdin**; tabela **fechada** de método+rota; `:id`
validado antes de entrar na string.

Abordagem melhor, em uma frase (dita e NÃO seguida, como manda a cláusula
base): um túnel `ssh -L 8790:127.0.0.1:8790` persistente pouparia ~2 s por
ação, mas exigiria o token no PC (ou um proxy autenticador no servidor) —
contraria a governança do dono; ficou o desenho contratado.

## (A) Entregue, por arquivo

Números copiados de `git diff --numstat` / `wc -l` (L-EXE-06). Tudo dentro de
`painel-admin/`.

| Arquivo | Linhas | O quê |
|---|---|---|
| `contas.js` **(novo)** | 228 | Tabela fechada `OPERACOES` (10 operações), `montarComando` (id `^[1-9]\d{0,9}$`, mesma regra do central), script remoto fixo (`umask 077; sudo grep TOKEN_INTERNO … \| sed → /tmp/painel-contas.$$; curl -s -K … -X <M> … -d @- -w "\n%{http_code}"; rm -f`), `executarSsh` (`spawn` sem shell, stdin=JSON, timeout 15 s, teto 1 MB), `interpretarSaida` (última linha = status; qualquer forma inesperada → `ErroContas 502`), `redigirSegredo` (log nunca carrega `Bearer …`), `criarClienteContas({ executar, log })`, `resolverRotaContas` + `criarManipuladorContas` (adaptador HTTP puro: `(método, caminho, corpo) → {status, corpo}`) |
| `servidor.js` | +16 | import + `manipularContas`; ramo `pathname.startsWith('/api/contas/')` lê o corpo (não-GET) e repassa status+corpo do central. Só `127.0.0.1:7777`, como antes (I4) |
| `publico/contas.js` **(novo)** | 319 | Aba: usuários (nome/e-mail/ativo/chips de apps; permissões via checkboxes dos apps `sso:true`, desativar/reativar, redefinir senha), convites pendentes (e-mail/nome/apps/expira em; reenviar/revogar), formulário Convidar; resultado com `enviado`, `erro` e `link` (campo + "copiar link"); `confirm()` em desativar e revogar; uma ação por vez; recarrega após cada ação; nunca `innerHTML` |
| `publico/index.html` | +10 | botão "Contas" na nav, `#aba-contas`, `<script src="contas.js">` antes de `projeto.js` |
| `publico/app.js` | +12/−1 | `paineis.contas`, `viewAtual`, ramo `#/contas` no `rotear()` — busca só ao ENTRAR na aba (o `rotear()` de 60 s não dispara ssh) |
| `publico/estilo.css` | +63 | bloco "Aba Contas" com os tokens do design system (nenhum hex novo) |
| `test/contas.test.js` **(novo)** | 296 | 19 testes, `node --test`, executor sempre injetado |
| `package.json` | +2/−1 | script `test`: `node --test "test/**/*.test.js"` |
| `CLAUDE.md` | +41/−7 | `npm test`; módulo `contas.js`; aba Contas; exceção delimitada ao "SSH só-leitura"; princípio **"o token nunca sai do servidor"** |
| `docs/01_ESTADO.md` | +72/−4 (dos quais **+4 já estavam sujos antes da fatia** — nota "303 → /login", de outra sessão) | seção "Aba Contas: ENTREGUE PELO EXECUTOR" com as provas; correção da linha "teste automatizado não existe" (L-EXE-05) |
| `docs/BACKLOG.md` | +22 | seção F4 com o selo `[x]` e 4 pendências |
| `docs/RELATORIO-F5-CONTAS.md` **(novo)** | — | este arquivo |

**Não é meu**: `projetos.js` (+11, entrada `CadastroUnico` no catálogo) já estava
modificado no working tree antes de eu começar — não toquei; o integrador
decide se entra no mesmo commit.

## (B) Testes e mutações

`npm test` → **19 testes, 19 verdes, 0 falhos** (5 suítes, ~150 ms). Cobrem:
tabela fechada (inclusive `constructor`/`__proto__`, que o primeiro rascunho
deixava passar — o teste pegou e virou `Object.hasOwn`), id validado (14 formas
inválidas), comando **byte a byte** com o esperado, corpo só no stdin, stdin
vazio nas operações sem corpo, `TOKEN_INTERNO` no ambiente do PC não entra em
nada, stderr com bearer redigido no log, mapeamento status/corpo (inclusive
corpo com `\n` interno), 6 formas de falha → 502, spawn ENOENT → 502, e a
**fronteira HTTP** (L-EXE-01: `http.createServer` + `fetch` de verdade, corpo
inteiro pinado com `deepEqual` — L-EXE-04): 200 repassado, 400 sem ssh para
`abc`/`1e3`/`-1`/`0`, 404 fora da tabela (`importar`, `sessao/verificar`), 400
para JSON inválido/array/vazio, `502 {erro:"sem acesso ao servidor"}`, 201 do
convite com `enviado:false`+`link`, 409 do central passando como está.

Mutações nomeadas (L-EXE-02), aplicadas ao `contas.js` real, suíte rodada,
arquivo restaurado (`diff` idêntico, suíte verde de novo):

| Mutação | O que foi mudado | Resultado |
|---|---|---|
| **M-I1** | `redigirSegredo` devolve o texto sem redação | 2 ✖ |
| **M-I2** | corpo interpolado no comando (`-d '<json>'`) em vez do stdin | 5 ✖ |
| **M-I3a** | `RE_ID = /^.+$/` | 2 ✖ |
| **M-I3b** | `OPERACOES[nome]` em vez de `Object.hasOwn` | 1 ✖ |
| **M-I3c** | checagem de formato do id removida (só `typeof`) | 2 ✖ |
| **M-502** | falha de ssh vira 500 | 3 ✖ |

Lição de processo: a primeira rodada de M-I1 e M-I3a ficou **verde** porque o
`sed` não casou o padrão (o `grep` mostrou a linha original intacta) —
mutação não aplicada não prova nada; refeita com substituição exata por Node.

## (C) Prova viva e navegador

**Contra o servidor real, só GET, uma vez cada** (permitido pelo contrato;
e-mails mascarados na impressão):

```
listarApps     -> 200 {"apps":[filosofia·player·jogos (sso:true), tarado·ro·anya (sso:false)]}  3028ms
listarUsuarios -> 200 {"usuarios":[{"id":1,"email":"g***@gmail.com","nome":"Matheus","ativo":true,
                       "criado_em":"2026-09-12T22:56:59.702Z","apps":["filosofia","jogos","player"]}]} 1707ms
listarConvites -> 200 {"convites":[]}                                                    3273ms
grep Bearer na saída do módulo + logs: nada (I1 ok) · logs emitidos: 0
no servidor: ls /tmp/painel-contas.* -> No such file or directory (rm -f funcionou)
no PC: env | grep TOKEN_INTERNO -> 0 · log do painel de prova: 0 ocorrências de "Bearer"
```

Pré-condições conferidas antes: `ssh -o BatchMode=yes` ok, `sudo -n true` ok,
`sudo test -r /opt/conta-astargne/.env` ok, `conta-astargne` active.

**Nenhuma escrita contra a produção** — POST/PUT/DELETE só rodaram contra um
central falso.

**Navegador** (Playwright headless, Chromium 1440×1000): subi o painel
**real** em `PORTA=7797` com `node --import ssh-falso.mjs servidor.js` — o
preload (scratchpad da sessão) troca `child_process.spawn` só para
`ssh … /tmp/painel-contas.$$` e responde como o central; `servidor.js`,
`contas.js` e `executarSsh` rodaram inteiros. Percurso: abrir `#/contas` (3
usuários, 1 convite), editor de permissões → salvar (`PUT … stdin=27B`, chips
atualizados), convidar `…sememail@…` → 201 com caixa vermelha "e-mail NÃO
enviado — provedor fora do ar" + link no campo, desativar (confirm aceito →
linha riscada), reativar, revogar (confirm → 0 convites), trocar de aba
esconde a Contas. **Erros de console/página: nenhum.** Dois acertos de CSS
saíram do screenshot (e-mail em caixa alta pelo `.kicker`; caixa de resultado
vazando a coluna) e foram corrigidos antes do percurso final.

Screenshots (efêmeros — scratchpad da sessão
`%LOCALAPPDATA%\Temp\claude\c--Users-gadel-OneDrive--rea-de-Trabalho-Projetos-Pessoais\a35677bc-…\scratchpad\`):
`01-usuarios.png`, `02-convites.png`, `03-formulario.png`,
`04-editor-permissoes.png`, `05-convite-sem-email.png`, `06-final.png`.
Ver pendência 3 em (E).

**Processos**: o painel de prova (PID 21304, porta 7797) foi **parado** por
`taskkill`; `netstat` mostrou nada escutando em 7797 nem 7777 ao final. O
painel do workspace (7777) **não estava de pé** durante a fatia — nada de
outro ator foi tocado.

## (D) O que o dono precisa fazer

- **Nada de token no PC — confirmado**: o painel não lê `.env` novo, não há
  variável nova, `grep TOKEN_INTERNO` no painel só acha o nome dentro do
  script remoto. O único pré-requisito no PC é o que já existia: a chave
  `~/.ssh/paroquia-vultr` e `sudo` sem senha para `linuxuser` no servidor
  (ambos conferidos funcionando).
- Reiniciar o painel (`npm start` ou reabrir o workspace) para as rotas novas
  subirem; abrir **Contas** na nav.
- Primeira **ação de escrita real** (convidar alguém) é sua — o executor só
  leu. Latência esperada: 2–3 s por ação (um ssh completo cada).
- Revisão cética + commit (integrador). Sugestão de mensagem: "Aba Contas:
  administração do CadastroUnico por ssh, token nunca sai do servidor (F5)".

## (E) Pendências e as cinco coisas que NÃO fiz (L-EXE-13)

1. **Decisão de produto/arquitetura** — não implementei "sair de todos os
   dispositivos", teto de sessões, importar usuário (`/interno/usuarios/importar`
   existe na API mas o contrato não lista na aba) nem exibição de sessões
   ativas. Alternativa que eu escolheria: nenhuma agora; `importar` só faria
   sentido na migração do filosofia (Fase 2 do plano-mãe), não numa aba
   diária.
2. **Ampliação de escopo (arquivo fora da lista)** — não gravei os screenshots
   em `docs/provas-f5/` nem toquei `docs/00_PLANO.md` (permitido mas não
   exigido; o plano é do C-3PO e a fatia não muda o motor). Alternativa:
   `docs/provas-f5/*.png` no mesmo commit, 6 arquivos, ~400 KB — decisão do
   integrador (os originais somem com o scratchpad).
3. **Ação destrutiva/irreversível** — nenhuma escrita em produção, nenhum
   processo de outro ator morto, nenhum commit/push. A única coisa parada foi
   o meu próprio painel de prova.
4. **Chamada paga fora do card** — nenhuma: motor do C-3PO e ElevenLabs não
   foram acionados; Playwright só abriu a aba Contas.
5. **Conflito de autoria** — `projetos.js` e 4 linhas de `docs/01_ESTADO.md`
   já estavam modificados por outra sessão (entrada `CadastroUnico` no
   catálogo; nota "303 → /login"). Não resolvi nem revertí; declaro para o
   integrador decidir o agrupamento do commit.

Pendências técnicas honestas:

- **Sem teste do front** (`publico/contas.js`): o painel nunca teve suíte de
  front; a prova é o percurso Playwright, não repetível sem o preload do
  scratchpad. Se quiser repetir: o preload `ssh-falso.mjs` tem ~110 linhas e
  cabe em `test/` como fixture — arquivo fora da lista, ficou de fora.
- **`redefinir senha` para usuário desativado** devolve 409 do central e a aba
  mostra o erro; o botão continua visível (com `title` explicando). Escondê-lo
  seria decisão de UI — deixei visível para não esconder a regra do central.
- **Convite sem app marcado**: a aba pergunta (`confirm`) e permite; o central
  aceita `apps: []`. Não sei se o dono quer proibir — fica como está, declarado.
- **Desvio declarado (L-EXE-09)**: acrescentei `-w "\n%{http_code}"` ao curl do
  script fixo do contrato — sem isso o módulo não teria o `status` que o
  próprio contrato exige devolver. É a única diferença em relação ao script
  literal.
- **`-d @-` em GET** manda `Content-Length: 0` com `content-type: json`; o
  Express do central aceita (provado pelos três 200). Se um dia recusar, a
  saída é tirar `-d @-` nas operações sem corpo — o script deixaria de ser
  "um só", por isso não fiz.

## (F) Lições — o que o briefing não dizia

- **`Object.freeze` não fecha a tabela**: `OPERACOES['constructor']` resolve
  pelo protótipo. Tabela fechada indexada por nome exige `Object.hasOwn` — o
  teste com `constructor`/`__proto__` deveria ser padrão em toda "allowlist
  por objeto" da raiz.
- **Mutação que fica verde pode ser mutação que não aconteceu.** Sempre
  `grep` da linha mutada antes de aceitar o resultado; `sed` com regex
  escapado em bash é o lugar clássico do silêncio.
- **`node --import` + `module.syncBuiltinESMExports()`** permite trocar
  `child_process.spawn` por baixo de um ESM que fez `import { spawn }` — dá
  para provar o servidor inteiro no navegador sem seam de teste no código de
  produção e sem tocar a produção. Vale para qualquer projeto Node da raiz
  que fale com processo externo.
- **`node --test test/` falha no Windows** (tenta carregar o diretório como
  módulo); o script precisa do glob entre aspas: `node --test "test/**/*.test.js"`.
- **O `.kicker` do design system transforma em caixa alta**: nunca colocar
  dado (e-mail, nome) dentro dele — só rótulo. Rótulo de checkbox dentro de
  um contêiner `.contas-rotulo` herda o mesmo e precisa de reset explícito.
- **Latência real do desenho**: 1,7–3,3 s por ação (ssh + sudo + curl). É o
  preço da governança "token só no servidor"; a aba precisa travar botões e
  dizer "ssh até o servidor" durante a ação, senão parece quebrada.

---

# Correções após o cético — 13/09/2026

**Papel**: CORRETOR. **Estado**: corrigidos os 10 achados confirmados pelo
integrador (o 10 relatado, não feito — ver D); sem commit; **aguarda selo do
dono**. Nenhuma escrita em produção; a única leitura por ssh foi a prova do
achado 4 (`cat` no lugar do script — o central não foi tocado). Nenhum
subagente.

Retificação ao registro datado acima (append-only): as menções a "19 testes",
"6 mutações", `/tmp/painel-contas.$$` e "o rm -f do script limpa" descrevem o
estado da entrega do executor; o estado corrente é o desta seção (28 testes;
`mktemp` + `trap`).

## (A) Por achado — o que mudou e como foi provado

Linhas lidas nesta sessão após a edição (`grep -n`).

**1. Falha de `sudo`/token vazio virava 401 "legítimo"; stderr descartado.**
- `contas.js:78` `f=$(mktemp …) || exit 97`; `:81-82` pipeline `… > "$f" || { echo "sem token" >&2; exit 97; }`; `:83` `test -s "$f" || { …; exit 97; }`; `:184` stderr não-vazio com exit 0 vai ao log; `:189` `status === 401` → `ErroContas('sem acesso ao servidor (token interno recusado)', 502)` com log. O comentário `:53-74` explica o porquê de cada pedaço.
- Provas: `test/contas.test.js:183` (casos `codigo: 97`/`stderr: 'sem token'` e `codigo: 7`/`\n000` do `curl -sS` → 502, stderr no log); `:209` (o estado que o runtime ANTIGO produzia — `codigo: 0`, `\n401`, `stderr` do sudo — → 502 "token interno recusado" + stderr no log; mais `\n401` puro e com corpo); `:227` (stderr com exit 0 → resposta passa, 1 linha de log redigida; sem stderr → 0 linhas); `:395` e `:402` fronteira HTTP com corpo pinado. O caso `codigo: 1` foi removido (nenhuma cadeia produz 1); o `'\n401' → {status: 401}` da entrega virou 403 (esse sim passa como está).
- Prova do script em shell (§C): sudo falhando → exit 97; chave ausente → exit 97; ambos com `sem token` no stderr e zero restos em `/tmp`.

**2. Front: `carregarContas` sem try/catch; "feito" sobrescrevia erro da recarga.**
- `publico/contas.js:44-66` try/catch, devolve `true`/`false`; fetch que lança → `tipo: 'erro'`; `:90-95` `feito` só se a recarga voltou, senão `"<ação>: feito, mas <erro da recarga> — a lista pode estar velha"` em `tipo: 'erro'`.
- Prova (§B, harness `vm` no scratchpad): 2a fetch rejeitando → `erro` e botão "recarregar" habilitado; 2b ação 200 + recarga 502 → texto "feito, mas … (HTTP 502) — a lista pode estar velha". Mutações M-2a/M-2b vermelhas.

**3. `executarSsh` sem cobertura.**
- `contas.js:120` `criarExecutorSsh({ binario = 'ssh', timeoutMs, maxSaida })`; `:153` `export const executarSsh = criarExecutorSsh()` (assinatura de produção intocada); resultado ganhou `sinal`.
- `test/contas.test.js:254-312`, binário falso = `process.execPath` com `-e`: `:261` stdin com acentos/CR/LF é recebido inteiro e **fechado** (o falso lê até EOF) e a saída passa por `interpretarSaida`; `:271` cadeia `criarClienteContas → executor real → falso → corpo de volta`; `:282` timeout 300 ms mata processo que dorme 3 s → `codigo null`, `sinal 'SIGKILL'`, < 2,5 s, 502; `:293` 4 KiB com teto 1 KiB → morto, `stdout ≤ 1024`, 502; `:306` binário inexistente → `ENOENT` → 502.
- Mutações M-3a (`stdin.end`→`write`), M-3b (sem `timeout`), M-3c (sem teto), M-3d (`SIGTERM`) — todas vermelhas (§B).

**4. Prova só-leitura do stdin contra o `ssh.exe` real** — §C.

**5. `curl -s` engolia erro; `rm -f` solto; `$$` previsível.**
- `contas.js:84` `curl --max-time 10 -sS`; `:79` `trap 'rm -f "$f"' EXIT`; `:78` `mktemp /tmp/painel-contas.XXXXXX` sob o `umask 077` de `:77`. O painel mantém `TIMEOUT_SSH_MS = 15_000` (`:23`).
- Prova: contrato byte a byte (`test/contas.test.js:29-39` `scriptEsperado`, usado em 5 testes); §C: central fora → exit 7 com `curl: (7) Failed to connect…` no stderr, `restos em /tmp: 0` em todos os 6 casos. Mutações M-5a/M-5b/M-5c vermelhas.

**6. `sed` não tolerava `TOKEN_INTERNO="valor"`.**
- `contas.js:81` `s/^[\"']\(.*\)[\"']$/\1/` depois de tirar o prefixo; comentário `:64-67` (o `.env` do central é lido por `node --env-file` e `EnvironmentFile=`, ambos aceitam com ou sem aspas; hoje sem).
- Prova §C: `abc123SEMASPAS`, `"abc123COMASPAS"`, `'abc123ASPASIMPLES'` → os três chegam como `Bearer abc123…` no central falso. Mutação M-6 vermelha (contrato).

**7. Front: destravava antes da recarga; revogar deixava link morto na caixa; "7 dias"/"1 h" fixos.**
- `publico/contas.js:90-91` `acaoEmCurso = false` **depois** de `await carregarContas()` (`:85` mantém o destrave imediato no caminho de erro da ação); `:234` revogar o convite cujo `id === ultimoConvite.id` limpa a caixa; `:189` e `:278-281` textos sem número — o prazo é do central (`CONVITE_DIAS`), a data real já aparece em `resultadoConvite` via `expiraEm`. O `redefinir` do central não devolve prazo, por isso texto e não dado.
- Prova §B: 7a durante a recarga `acaoEmCurso === true` e todos os botões `disabled`; 7b revogar #5 com `ultimoConvite.id === 5` → `null`; 7b' revogar com `ultimoConvite.id === 9` mantém. Mutações M-7a/M-7b vermelhas. Grep `7 dias|1 h|link de 1` em `painel-admin/` (sem `node_modules`): 0 ocorrências.

**8. BACKLOG com `[x]` antes do selo.**
- `docs/BACKLOG.md:51` título "(Fase 5 do plano-mãe)" + nota da numeração; `:58-64` épico `[ ]` com estado "entregue pelo executor em 13/09/2026; corrigido após o cético em 13/09/2026; aguarda selo do dono"; `:73-76` pendência nova do achado 10.

**9. "três abas" vs "Quatro abas".**
- `CLAUDE.md:101-103`. Conferido no fonte antes de escrever (L-COR-02): `projetoSelecionado` é lido por `app.js`, `backlog.js`, `projeto.js` — **nem `decisoes.js` nem `contas.js`** o leem; então nem "três" nem "quatro": "compartilhado entre as abas Projetos e Backlog (… `decisoes.js` e `contas.js` não a leem)".
- Varredura de classe (`grep -rn "três abas"`): `publico/app.js:188` (comentário vivo — corrigido com a mesma frase) e `docs/00_PLANO.md:197` (registro datado da decisão do reskin de 21/08, "Decisões tomadas durante a implementação" — **não alterado**: era verdade sobre o desenho daquela data e o arquivo está fora da lista da fatia; fica declarado).
- Também em `CLAUDE.md:51-67` a descrição do módulo `contas.js` foi atualizada para o script novo e o 401→502 (senão o documento descreveria a aspiração antiga, regra 1).

**10. Fronteira HTTP testa réplica da cola.** Não feito — ver (D).

## (B) Testes e mutações

`npm test` → **28 testes, 28 verdes, 0 falhos** (6 suítes, ~1,6 s — os 4 testes
do executor real spawnam `node`). Antes: 19. `node --check` verde em `contas.js`,
`publico/contas.js`, `publico/app.js`, `test/contas.test.js`, `servidor.js`.

Mutações do backend, aplicadas ao `contas.js` real por substituição exata
(scratchpad `mutar.mjs`/`mutar2.mjs`), suíte rodada, arquivo restaurado e
conferido com `cmp` (idêntico). Toda mutação teve a linha mutada impressa
antes de contar (lição do executor: mutação não aplicada não prova nada — duas
das minhas não casaram na primeira tentativa por escape e foram refeitas por
índice de linha):

| Mutação | Mudança | ✖ |
|---|---|---|
| M-1a | linha `status === 401` removida (401 repassado) | 2 |
| M-1b | stderr com exit 0 não vai ao log | 1 |
| M-1c | script sem `test -s` | 5 |
| M-1d | script sem `\|\| exit 97` na pipeline | 5 |
| M-3a | `stdin.end` → `stdin.write` (sem EOF) | 2 |
| M-3b | sem `timeout` no spawn | 1 |
| M-3c | sem teto de saída | 1 |
| M-3d | `killSignal: 'SIGTERM'` | 1 |
| M-5a | `curl -s -K` (sem `-S`, sem `--max-time`) | 5 |
| M-5b | sem `trap` | 5 |
| M-5c | `$$` em vez de `mktemp` | 5 |
| M-6 | sed sem strip de aspas | 5 |

Mutações do front (harness `vm` do scratchpad, `prova-front.mjs`, sobre cópias
mutadas de `publico/contas.js`): M-2a catch relança (= sem try/catch) → erro
não tratado; M-2b "feito" mesmo com recarga em erro → asserção de texto; M-7a
`acaoEmCurso = false` antes da recarga → "deveria seguir true durante a
recarga"; M-7b revogar sem limpar → "ultimoConvite deveria ter sido limpo".
**4/4 vermelhas.** O harness não entra no repo (o painel não tem suíte de
front; `publico/contas.js` não é módulo) — comando para repetir:
`node prova-front.mjs [caminho-do-contas.js]`.

## (C) Prova do stdin e do script

**Achado 4 — ssh REAL, uma vez, só-leitura** (`node -e` chamando o
`executarSsh` de produção com os args de `montarComando('criarConvite')` e
o último arg trocado por `cat`):

```
args: ["-i","C:\\Users\\gadel\\.ssh\\paroquia-vultr","-o","BatchMode=yes","-o","ConnectTimeout=8","linuxuser@astargne.com","cat"]
stdin bytes: 209 chars: 186     (JSON com "joão.ção", "Ágüe — “aspas” ’ ç Ç ñ", \n, \r\n, \t, "ü ß €")
ms: 2997 codigo: 0 sinal: null stderr: ""
stdout bytes: 209
IGUAL byte a byte: true
sha256 in : 6141671ccfcfc426
sha256 out: 6141671ccfcfc426
```

**Script remoto, LOCAL** (`prova-script.sh` no scratchpad: a string exata que
`montarComando` gera, com duas substituições textuais — `sudo grep … /opt/conta-astargne/.env`
→ `grep` num arquivo local, `127.0.0.1:8790` → central falso em `:18790` que
devolve 401 sem bearer e 201 ecoando o header):

```
== sem aspas            exit=0  {"auth":"Bearer abc123SEMASPAS", corpo ecoado}   201  restos /tmp: 0
== aspas duplas         exit=0  {"auth":"Bearer abc123COMASPAS", …}              201  restos /tmp: 0
== aspas simples        exit=0  {"auth":"Bearer abc123ASPASIMPLES", …}           201  restos /tmp: 0
== chave ausente        exit=97 stdout=[] stderr=[sem token]                          restos /tmp: 0
== sudo falhando        exit=97 stdout=[] stderr=[sem token]                          restos /tmp: 0
== central fora         exit=7  stdout=[\n000] stderr=[curl: (7) Failed to connect to 127.0.0.1:18799 …]
```

## (D) O que NÃO fiz e por quê

- **Achado 10 (fronteira HTTP real)**: o ramo `/api/contas/*` em
  `servidor.js:308-317` não é uma função — são 3 linhas dentro do `if` do
  `createServer`, e `servidor.js` faz `listen(7777)` e `criarClienteContas()`
  real ao ser importado. Testar o roteamento real exige separar "montar o
  handler" de "escutar" (ou subir o processo com preload de ssh falso, como o
  executor fez à mão) — refatoração além de extrair. Relatado; pendência
  registrada em `docs/BACKLOG.md:73`.
- **`docs/00_PLANO.md:197`** ("três abas"): registro datado, fora da lista —
  declarado em (A.9), não alterado.
- **`docs/01_ESTADO.md:36`** ("o rm -f do script limpa") e as menções a "19
  testes"/"6 mutações"/`$$` neste relatório acima: registros datados da
  entrega do executor — retificados por esta seção, não reescritos.
- Não toquei `projetos.js`, `coletores.js`, `relacoes.js`, nada fora de
  `painel-admin/`, nem o desenho (ssh + script remoto continua; sem túnel,
  sem token no PC). Nenhum `git commit`.
- Não acrescentei `set -o pipefail` ao script remoto: `test -s` já cobre o
  caso e `pipefail` dependeria do shell de login do `linuxuser`; ficou o
  `|| exit 97` pedido (cobre falha do `sed`/redirecionamento) mais o `test -s`.

## (E) Lições

- **Exit code de pipeline sem `pipefail` é o do último comando** — `a | b > f;
  rm -f f` devolve 0 mesmo com `a` morto. A checagem certa é sobre o
  RESULTADO (`test -s "$f"`), não sobre o status da pipeline.
- **401 numa rota interna cujo bearer o próprio servidor monta nunca é
  resposta de usuário**: é o painel dizendo "meu encanamento quebrou". Vale
  para qualquer proxy da raiz que injeta credencial por conta própria.
- **Binário injetável > executor injetável** para provar encanamento de
  processo: `node -e` como falso prova stdin/EOF/timeout/kill de verdade no
  SO real (o Windows reportou `sinal: 'SIGKILL'` e `codigo: null`, como o
  código presumia — agora está provado, não presumido).
- **Mutação por substituição de string pode não casar por escape** — imprimir
  a linha mutada antes de contar os ✖ é obrigatório; duas das doze aqui
  precisaram ser refeitas por índice de linha.
- **Front sem módulo ainda se prova**: `vm.runInContext` com `document`/`el`/
  `fetch` falsos roda `publico/contas.js` inteiro e expõe as funções internas
  com um sufixo — barato o bastante para virar suíte de front se o painel
  um dia quiser uma.
- **"Corrija a frase" tentou virar "quatro abas"; o fonte dizia outra coisa**
  (`decisoes.js` nunca leu `projetoSelecionado`). Conferir antes de escrever
  (L-COR-02) mudou a correção.
