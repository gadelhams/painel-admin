# painel-admin — invariantes

Uma linha por regra; o texto completo de cada uma está em
[`arquitetura.md`](arquitetura.md) § "Invariantes — texto completo" (mesma
ordem). Quem muda código confere a lista inteira antes do portão.

1. **Sem login, então porta fechada** — escuta só em `127.0.0.1:7777`; fora dele, só a borda do tailnet restrita ao Windows, com Host e origem conferidos em `guarda.js`. (§1)
2. **SSH só-leitura** em `/api/producao/ssh` (comandos fixos, chave `~/.ssh/paroquia-vultr`, só sob demanda) — única exceção: o `ssh` de `contas.js` muda só o banco do CadastroUnico, só por `/interno/*`, só pela tabela fechada `OPERACOES` e só com SSO do dono; infra continua SSH manual + `validador-deploy`. (§2)
3. **O `TOKEN_INTERNO` do CadastroUnico nunca sai do servidor** — não entra no `.env` do painel, não é lido, logado nem devolvido em HTTP; o script remoto monta o cabeçalho lá. (§3)
4. **Ferramentas de IA só-leitura até a fase 3** — `tools: []` + allowlist de seis ferramentas MCP; o processo do modelo não herda o `.env`; limitação estrutural. (§4)
5. **Voz não fura o canon de deploy** — ação que mude estado no `astargne.com` exige `validador-deploy` + validação de premissas. (§5)
6. **Segredo só no `.env`** — Guest só lê Plane; escritor opcional usa chave própria, projeto único, SSO e confirmação. Nunca no navegador, código, log, commit ou resposta HTTP; a aba Chaves troca valores só por SSO + duas ações, escrita 600, e só nomes voltam. (§6, § chaves.js)

## Regras fixas espalhadas pelo texto de arquitetura

Proibições vivas do `CLAUDE.md` antigo; o porquê está no título indicado de `arquitetura.md`.

7. O motor **nunca faz HTTP para o próprio processo** — rotas e ferramentas chamam as mesmas funções de `coletores.js`. (§ coletores.js)
8. `resolverDentroDaRaiz` só aceita `ProjetosPessoais` e `ProjetosCompartilhados`; **`Exitlag/` fica fora do alcance de propósito**, por nome ou por `..`. (§ coletores.js)
9. Dado de usuário **jamais entra na linha de comando** do ssh: corpo só por stdin, `:id` inteiro positivo, tabela fechada; 401 do central vira 502. (§ contas.js)
10. `test/contas.test.js` **nunca chama ssh de verdade**. (§ contas.js)
11. Modelo `claude-sonnet-5` fixo; upgrade do SDK (versão sem `^`) é decisão consciente. (§ motor.js)
12. `projetos.js` anda em sincronia com `../../CLAUDE.md` (mapa da área) e `../../../PORTAS.md`; `relacoes.js` e `../../../RELACOES.md` **mudam juntos**. (§ projetos.js, § relacoes.js)
13. Aba Contas **sem polling**: busca ao entrar na aba e após cada ação. (§ contas.js (publico/))
14. Gasto e fila de jobs **sem fonte real** mostram vazio honesto, nunca número inventado. (§ Gasto e fila de jobs)
15. Persona por voz (Remote Control) só com **gatilho explícito** do Astargne, e grounding antes de falar de estado. (`operacao.md` § C-3PO por voz)
16. **Executor só atrás de todos os portões** — nasce só com `ORQ_EXECUCAO_HABILITADA=true`; worktree próprio, sem shell, ambiente por lista branca, CLIs sem MCP/plugins, só comandos do contrato; falha de infra é `impedido`, sem retry. Modelos só da frota (SSO + duas ações), relida sob a trava na reserva; frota ≠ ok para tudo, sem padrão; o contrato liga projeto e provedor. Vigília: mesmo caminho, uma por vez, ligada por SSO; sem push nem merge. Risco aberto (o dono decide): `/api/conversa` e `/api/tts` sem SSO, ao alcance do executor pelo loopback; fechar antes do PAINEL-34. (§ orquestrador/)
