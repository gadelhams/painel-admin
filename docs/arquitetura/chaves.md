# chaves.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta. O catálogo mora em `chaves/catalogo.js`, o inventário em `chaves/inventario.js` (arquivo local em `inventario-local.js`, servidor em `inventario-servidor.js`),
o diário em `chaves/eventos.js`, a troca em `chaves/troca.js` (arquivo local em `troca-local.js`, servidor em `troca-servidor.js`) e `chaves/servico.js`
só compõe os três. A confirmação em duas ações fica em `chaves/confirmacoes.js`
e o HTTP em `chaves/api.js`.

(24/10/2026, decisão do dono) — a tela **Chaves**: inventário dos segredos por projeto
e a troca de valor pelo painel, para que o dono rotacione o que vazou sem abrir
terminal. `CATALOGO` declara, por projeto, o `.env` local (relativo a
`~/Work/ProjetosPessoais`, com a unit de usuário que reinicia), os caminhos
candidatos do `.env` no servidor (só `/opt/...`, com a unit do systemd de lá), as
variáveis conhecidas e a **rotação pendente** (card que a pediu, data, motivo, o que
fazer depois); `foraDoEnv` é segredo que vive no provedor ou na base — o painel só
registra que foi rotacionado. Só **nomes** saem do servidor: o inventário local lê os
arquivos e devolve nomes, presença e modo; o do servidor é UM ssh com script fixo
montado do catálogo (`sudo test -f` + `grep -oE '^NOME='`), cacheado até a próxima
leitura. A troca é em duas ações com SSO (`criarConfirmacoesChaves`): o valor viaja
uma vez, no corpo do `confirmar`, e termina no `.env` local (cópia `.bak` 600,
escrita atômica 600, `systemctl --user restart` da unit 1 s depois — se a unit for o
próprio painel, ele reinicia) ou no servidor (valor pelo **stdin** do ssh, `sudo
python3 -c` fixo que reescreve a linha com o dono e o modo originais e reinicia a
unit do catálogo; só o arquivo descoberto pelo inventário). O inventário devolve também
`rotacoesFeitas` (rotação do catálogo já satisfeita por evento): a aba Decisões a
usa para mostrar "rotação registrada — card a fechar" em vez de cobrar o dono, até
o orquestrador fechar o card no Plane. A escrita no servidor
só existe com `CHAVES_SERVIDOR_ESCRITA=true`, depois do APROVADO do
`validador-deploy`. O validador **REPROVOU** a 1ª versão (24/10/2026) e o código já
traz a correção mínima pedida: `bloqueado` (TOKEN_INTERNO do central e os
SSO_*TOKEN* que dependem dele — trocar um sozinho derruba player e fliperama),
`depois` obrigatório fora da rotação (DATABASE_URL do player: `ALTER USER` + mesma
troca no `.env` local, porque o deploy recria o do servidor), `servidor.aviso` por
unit no preparo (compose do filosofia/ragpt derruba conversas/jogo), ssh da troca
com teto próprio de 180 s (restart de compose passa dos 15 s do executor comum),
`os.umask(0o077)` e `.tmp` exclusivo no python remoto, dois candidatos existentes =
ambíguo (409, nomes não se misturam), valor para o servidor sem espaço/`#`/`$`/aspas
(env_file do compose truncaria), nome descoberto só no inventário (trocar exige
catalogar) e o EmuladorWeb como `foraDoEnv` (o token vive cru em
`secrets/sso-internal-token` e só muda pelo instalador). A 2ª rodada do validador
**APROVOU** (24/10, 13:46 UTC): flag ligada, master do servidor com a nota "Escritor
de `.env` fora do deploy" (§3) publicada pelo §8. Retenção (decisão do dono,
24/10): fica **só o `.bak` da troca atual**, local e no servidor — a troca seguinte
apaga os anteriores do mesmo arquivo (`.env.bak-*` também no `.gitignore`).
Residual aceito: restart de compose acima de 180 s vira `ROTACAO_INCERTA` falsa. Eventos em `~/.local/state/painel-admin/chaves.jsonl` nunca
levam valor; a pendência some quando há evento posterior à data do catálogo. O
bloco **Astargne** da aba Decisões (`publico/decisoes.js`) junta as rotações
pendentes com os cards abertos `ASTARGNE`/`TAREFA DONO`/`EMPÍRICA` em quatro grupos — chaves e
contas externas, push/deploy/sudo, tarefas suas (`TAREFA DONO` sempre cai aqui), decisões de produto — por etiqueta
e verbo do título (heurística dita na tela). O bloco é um `<details>` (aberto por
padrão; estado lembrado em `localStorage`), ignora projetos com `congelado: true`
no catálogo (`projetos.js`, propagado por `coletores.js`) e lista à parte as
rotações já registradas.
