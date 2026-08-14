# painel-admin

Hub administrativo **local** dos projetos da raiz: estado do git, portas locais
ativas, sondas HTTPS da produção no `astargne.com` e consulta SSH sob demanda.

## Como roda

```powershell
node servidor.js   # http://localhost:7777 (porta via env PORTA)
```

Sobe sozinho ao abrir o workspace da raiz no VS Code (junto com o severino):
gatilho `folderOpen` em `.vscode/tasks.json` da raiz, idempotente por sonda
de porta — não duplica processo se já estiver de pé.

Node ≥ 20.11, **zero dependências** — só módulos embutidos. Não há build.

## Arquitetura

- `servidor.js` — HTTP + API (`/api/projetos`, `/api/producao`,
  `/api/producao/ssh`) e estáticos de `publico/`.
- `projetos.js` — catálogo dos projetos: metadados que não dão para derivar do
  disco (portas, URL de produção, subpasta do repo). **Mantenha em sincronia
  com o `CLAUDE.md` da raiz** quando um projeto nascer, morrer ou mudar de porta.
- `publico/` — página única em JS vanilla, sem framework.

## Restrições

- Escuta só em `127.0.0.1` e não tem autenticação — **nunca** expor fora da
  máquina nem publicar em porta aberta.
- A rota SSH (`/api/producao/ssh`) executa apenas comandos de **leitura**
  (`uptime`, `systemctl is-active`, `docker ps`, `df`, `free`) com a chave
  `~/.ssh/paroquia-vultr`. Qualquer comando que mude estado no servidor está
  fora do escopo deste painel — ação administrativa de verdade se faz por SSH
  manual, seguindo `/opt/servidor/LEIA-ME.md`.
- SSH roda só sob demanda (botão), nunca no refresh automático de 60 s.
