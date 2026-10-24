# painel-admin — invariantes

Uma linha por regra; o texto completo de cada uma está em
[`arquitetura.md`](arquitetura.md) § "Invariantes — texto completo" (mesma
ordem). Quem muda código confere a lista inteira antes do portão.

1. **Sem login, então porta fechada** — escuta só em `127.0.0.1:7777`; fora dele, só a borda do tailnet restrita ao Windows (06/10/2026), com Host e origem conferidos em `guarda.js`. (§1)
2. **SSH só-leitura** em `/api/producao/ssh` (`uptime`, `systemctl is-active`, `docker ps`, `df`, `free`; chave `~/.ssh/paroquia-vultr`; só sob demanda, nunca no refresh) — única exceção: o `ssh` de `contas.js` muda só o banco do CadastroUnico, só por `/interno/*`, só pela tabela fechada `OPERACOES`; infra continua SSH manual + `validador-deploy`. (§2)
3. **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** — não entra no `.env` do painel, não é lido, logado nem devolvido em HTTP; o script remoto monta o cabeçalho lá; "copiar pro `.env` pra simplificar" é não. (§3)
4. **Ferramentas de IA só-leitura até a fase 3** — `tools: []` + allowlist de quatro ferramentas MCP, inclusive a fila; limitação estrutural. (§4)
5. **Voz não fura o canon de deploy** — ação que mude estado no `astargne.com` exige `validador-deploy` + validação de premissas, como para qualquer agente. (§5)
6. **Segredo só no `.env`** — Guest só lê Plane; escritor opcional usa chave própria, projeto único, SSO e confirmação. Nunca no navegador, código, log, commit ou resposta HTTP. (§6)

## Regras fixas espalhadas pelo texto de arquitetura

Não estavam na seção "inegociável", mas são proibições/decisões vivas do
mesmo `CLAUDE.md`; a explicação está no título indicado de `arquitetura.md`.

7. O motor **nunca faz HTTP para o próprio processo** — rotas e ferramentas chamam as mesmas funções de `coletores.js`. (§ coletores.js)
8. `resolverDentroDaRaiz` só aceita `ProjetosPessoais` e `ProjetosCompartilhados`; **`Exitlag/` fica fora do alcance de propósito**, por nome ou por `..`. (§ coletores.js)
9. Dado de usuário **jamais entra na linha de comando** do ssh: corpo só por stdin, `:id` inteiro positivo, tabela fechada; 401 do central vira 502. (§ contas.js)
10. `test/contas.test.js` **nunca chama ssh de verdade** (executor e binário injetáveis). (§ contas.js)
11. Modelo `claude-sonnet-5` fixo; upgrade do `@anthropic-ai/claude-agent-sdk` (versão sem `^`) é decisão consciente, nunca automática. (§ motor.js; `operacao.md` § Como roda)
12. `projetos.js` anda em sincronia com `../../CLAUDE.md` (mapa da área) e `../../../PORTAS.md`; `relacoes.js` e `../../../RELACOES.md` **mudam juntos**. (§ projetos.js, § relacoes.js)
13. Aba Contas **sem polling**: busca ao entrar na aba e após cada ação. (§ contas.js (publico/))
14. Gasto por projeto e fila de jobs **não têm fonte real**: estado vazio honesto, nunca número inventado. (§ Gasto e fila de jobs)
15. Persona por voz (Remote Control) só com **gatilho explícito** do Astargne, e grounding antes de falar de estado. (`operacao.md` § Severino por voz)
16. **Executor só atrás de todos os portões** — nasce só com `ORQ_EXECUCAO_HABILITADA=true`; roda num worktree próprio, sem shell, ambiente por lista branca (nenhuma chave do Painel), CLIs sem MCP/plugins e só com os comandos do contrato; falha de infraestrutura é `impedido`, nunca retry. A vigília usa esse mesmo caminho, uma tentativa por vez, dentro dos freios do contrato, e só é ligada por SSO + confirmação; nunca faz push nem merge. (§ orquestrador/)
