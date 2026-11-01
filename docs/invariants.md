# painel-admin — invariantes

Uma linha por regra; texto completo em
[`arquitetura/invariantes.md`](arquitetura/invariantes.md) (mesma ordem). Quem
muda código confere a lista.

1. **Sem login, então porta fechada** — escuta só em `127.0.0.1:7777`; fora dele, só a borda do tailnet restrita ao Windows; Host/origem: `guarda.js`. (§1)
2. **SSH só-leitura** em `/api/producao/ssh` e na `consulta_ssh` (lista fixa, sob demanda) — única exceção: o `ssh` de `contas.js` muda só o banco do CadastroUnico, por `/interno/*`, pela tabela fechada `OPERACOES` e com SSO do dono; infra continua SSH manual + `validador-deploy`. (§2)
3. **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** — não entra no `.env` do painel, não é lido, logado nem devolvido em HTTP; o script remoto monta o cabeçalho lá. (§3)
4. **O motor lê e só propõe** — `tools: []` + treze ferramentas MCP; `propor_*` registram; executar e gravar a L1 é do dono (SSO + duas ações) ou da reflexão, fora do motor; sem `.env`. (§4)
5. **Voz não fura o canon de deploy** — ação que mude estado no `astargne.com` exige `validador-deploy` + validação de premissas. (§5)
6. **Segredo só no `.env`** (salvo chaves de escrita do Plane — orquestrador-\*, zelador, Painel Admin: arquivo 600 lido por operação, ator fixo) — Guest só lê; orquestrador: projeto único; zelador: play, lista fechada; mesa (sem Anya/CKBL): lista fechada, SSO + confirmação. Nunca no navegador, código, log, commit ou HTTP; Chaves troca por SSO + duas ações, grava 600, só nomes voltam. Resíduos: janela releitura→PATCH da mesa; filtro de segredo. (§6)

## Regras fixas espalhadas pelo texto de arquitetura

O porquê, no arquivo de `arquitetura/` entre parênteses.

7. O motor **nunca faz HTTP para o próprio processo** — rotas e ferramentas chamam as funções de `coletores.js`. (coletores.md)
8. `resolverDentroDaRaiz` só aceita `ProjetosPessoais` e `ProjetosCompartilhados`; **`Exitlag/` fica fora do alcance de propósito**, por nome ou por `..`. (coletores.md)
9. Dado de usuário **jamais entra na linha de comando** do ssh: corpo só por stdin, `:id` inteiro positivo, tabela fechada; 401 do central vira 502. (contas.md)
10. `test/contas.test.js` **nunca chama ssh de verdade**. (contas.md)
11. Modelo `claude-sonnet-5` fixo; upgrade do SDK (versão sem `^`) é decisão consciente. (motor.md)
12. `projetos.js` anda com `../../CLAUDE.md` e `../../../PORTAS.md`; `relacoes.js` e `../../../RELACOES.md` **mudam juntos**. (projetos.md, relacoes.md)
13. Aba Contas **sem polling**: busca ao entrar na aba e após cada ação. (publico.md)
14. Gasto e fila **sem fonte real** mostram vazio honesto, nunca número inventado. (publico.md)
15. Persona por voz só com **gatilho explícito** do dono, e grounding antes de falar de estado. (`operacao.md` § C-3PO por voz)
16. **Executor só atrás de todos os portões** — nasce só com `ORQ_EXECUCAO_HABILITADA=true`; worktree, sem shell, ambiente e comandos por lista branca, CLIs sem MCP; CLIs e aceite sob bwrap (aceite sem rede); infra é `impedido`, sem retry; modelos só da frota; uma tentativa por vez no Hangar (disco); gate só com recibo amarrado à etiqueta atual (zelador: só READY TO DEV, com bwrap, conferido ao vivo); reservada por sessão viva fica fora; vigília e zelador só com o play e `ORQ_AGENDADOR`; sem push nem merge; voz paga só com SSO. Texto completo (frota, play, zelador, `/api/conversa`): invariantes.md. (orquestrador.md)
