# painel-admin — invariantes

Uma linha por regra; texto completo em [`arquitetura.md`](arquitetura.md)
§ "Invariantes — texto completo" (mesma ordem). Quem muda código confere
a lista.

1. **Sem login, então porta fechada** — escuta só em `127.0.0.1:7777`; fora dele, só a borda do tailnet restrita ao Windows; Host/origem: `guarda.js`. (§1)
2. **SSH só-leitura** em `/api/producao/ssh` e na `consulta_ssh` (lista fixa, sob demanda) — única exceção: o `ssh` de `contas.js` muda só o banco do CadastroUnico, por `/interno/*`, pela tabela fechada `OPERACOES` e com SSO do dono; infra continua SSH manual + `validador-deploy`. (§2)
3. **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** — não entra no `.env` do painel, não é lido, logado nem devolvido em HTTP; o script remoto monta o cabeçalho lá. (§3)
4. **O motor lê e só propõe** — `tools: []` + treze ferramentas MCP; `propor_*` registram; executar e gravar a L1 é do dono (SSO + duas ações) ou da reflexão, fora do motor; sem `.env`. (§4)
5. **Voz não fura o canon de deploy** — ação que mude estado no `astargne.com` exige `validador-deploy` + validação de premissas. (§5)
6. **Segredo só no `.env`** (salvo chaves de escrita do Plane — orquestrador-\*, zelador, Painel Admin: arquivo 600 lido por operação, ator fixo) — Guest só lê; orquestrador: projeto único; zelador: play, lista fechada; mesa (sem Anya/CKBL): lista fechada, SSO + confirmação. Nunca no navegador, código, log, commit ou HTTP; Chaves troca por SSO + duas ações, grava 600, só nomes voltam. Resíduos: janela releitura→PATCH da mesa; filtro de segredo. (§6)

## Regras fixas espalhadas pelo texto de arquitetura

O porquê, no título de `arquitetura.md`.

7. O motor **nunca faz HTTP para o próprio processo** — rotas e ferramentas chamam as funções de `coletores.js`. (§ coletores.js)
8. `resolverDentroDaRaiz` só aceita `ProjetosPessoais` e `ProjetosCompartilhados`; **`Exitlag/` fica fora do alcance de propósito**, por nome ou por `..`. (§ coletores.js)
9. Dado de usuário **jamais entra na linha de comando** do ssh: corpo só por stdin, `:id` inteiro positivo, tabela fechada; 401 do central vira 502. (§ contas.js)
10. `test/contas.test.js` **nunca chama ssh de verdade**. (§ contas.js)
11. Modelo `claude-sonnet-5` fixo; upgrade do SDK (versão sem `^`) é decisão consciente. (§ motor.js)
12. `projetos.js` anda com `../../CLAUDE.md` e `../../../PORTAS.md`; `relacoes.js` e `../../../RELACOES.md` **mudam juntos**. (§ projetos.js, § relacoes.js)
13. Aba Contas **sem polling**: busca ao entrar na aba e após cada ação. (§ contas.js (publico/))
14. Gasto e fila **sem fonte real** mostram vazio honesto, nunca número inventado. (§ Gasto e fila de jobs)
15. Persona por voz só com **gatilho explícito** do dono, e grounding antes de falar de estado. (`operacao.md` § C-3PO por voz)
16. **Executor só atrás de todos os portões** — nasce só com `ORQ_EXECUCAO_HABILITADA=true`; worktree, sem shell, ambiente e comandos por lista branca, CLIs sem MCP; infra é `impedido`, sem retry. Modelos só da frota (SSO + duas ações), relida na reserva; frota ≠ ok para tudo; contrato liga projeto e provedor. Uma tentativa por vez (no disco); gate só com recibo amarrado à etiqueta atual; carta reservada por sessão viva fica fora. Vigília e zelador: só com o play (SSO; sem ele, só recibo de PENDENTE aberto) e `ORQ_AGENDADOR`; zelador só `claude`; sem push nem merge. Voz paga só com SSO, também no loopback; `/api/conversa` aberto por decisão do dono. (§ orquestrador/)
