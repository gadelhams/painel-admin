# painel-admin — mapa: coletores (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## coletores/

- `acervo.js` — Acervo compartilhado (a Oficina central do Hangar): padrões, orientações, skills e lições. Só lista nomes; não lê conteúdo.
- `acoes-sessao.js` — Uma chamada de ferramenta de sessão de IA → ação segura para o Hangar. Nunca devolve texto livre da chamada.
- `backlog.js` — Monta o backlog de cada projeto: Plane quando há id, markdown no resto. Nada é escrito.
- `caminhos.js` — Raiz e portão de caminho. Exitlag fica fora de propósito.
- `catalogo.js` — Catálogo estático de relações. Rota e motor leem daqui, não de relacoes.js direto.
- `decisoes.js` — Decisões derivadas do backlog. A idade do markdown vem de idade-linha.js; a do Plane, da criação do item.
- `docs.js` — Docs de um projeto do catálogo, já dentro da raiz. A lista e o corte moram ao lado.
- `estado-local.js` — Monta o resumo de cada projeto: existência, git e portas. Não sonda produção.
- `git-leitura.js` — Três leituras de git (status curto, diff --stat, log de 15) de um projeto do catálogo; nunca diff de conteúdo, nunca caminho livre.
- `git-local.js` — Git local de um projeto do catálogo. Não sonda porta.
- `hangar.js` — Naves do Hangar: por projeto, peças (módulos) com a contagem de cartas, próximas fases e decisões. Só leitura sobre o backlog.
- `idade-linha.js` — Idade de uma linha no git, pelo log -L. Não monta a decisão.
- `leitura-md.js` — Lê um markdown e corta no teto. Não escolhe o caminho.
- `modeladores.js` — Lista os markdowns de um diretório já autorizado. Não lê o conteúdo.
- `parser-backlog.js` — Lê o markdown de backlog. Não consulta o Plane.
- `portas-locais.js` — Escuta TCP em 127.0.0.1. Não lê git.
- `sessoes-estritas.js` — Leitor ESTRITO de sessões para o zelador: diz se alguma sessão de IA tocou um projeto nas últimas 2 h; erro de leitura = ocupado. Nunca devolve prompt, resposta nem argumento.
- `sessoes.js` — Sessões de IA vivas na máquina (os droids do Hangar): /proc + cauda dos transcripts. Só leitura; nunca devolve prompt, resposta nem argumento.
- `sonda-https.js` — Um GET HTTPS com teto de tempo. Não escolhe qual serviço sondar.
- `sondas.js` — Quais endereços de produção sondar. O GET mora em sonda-https.js.
- `ssh-leitura.js` — SSH somente leitura do servidor, sob demanda: a rota /api/producao/ssh e a ferramenta do C-3PO usam esta classe e esta lista, e nenhuma outra.
- `transcript-cauda.js` — Lê só o fim de um transcript .jsonl e devolve as linhas que são JSON. Não interpreta o conteúdo.
- `transcript-claude.js` — Uma sessão do Claude Code a partir da cauda do transcript: última atividade, cwd, fim de turno e ações. Não lê prompt nem resposta.
- `transcript-codex.js` — Uma sessão do Codex a partir da cauda do rollout: última atividade, cwd, fim de turno e ações. Não lê prompt nem resposta.
