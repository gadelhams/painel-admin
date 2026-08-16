# Aba Backlog — o quadro kanban dos projetos (fase 1: só-leitura)

> **Incremento: MULTI-PROJETO + FILTRO DE PROJETO, 16/08/2026 (pedido do
> dono no mesmo dia).** Os 8 projetos restantes da raiz adotaram o padrão
> (`PADROES-BACKLOG.md`, tabela de praticantes) e todos os 9 estão
> registrados no campo `backlog` do catálogo — inclusive o próprio
> painel-admin, que entrou no catálogo para isso. A aba ganhou **filtro de
> projeto**: chips no mesmo padrão visual do filtro de tag, "todos" por
> padrão, client-side como o de tag; os dois filtros compõem (projeto decide
> quais blocos entram, tag decide quais linhas dentro deles) e as contagens
> dos chips de tag seguem o recorte de projeto. Cada coluna de feature ganhou
> subtítulo discreto com o projeto dono — com vários projetos no quadro, a
> coluna rolada para longe do cabeçalho do bloco se identifica sozinha.
> Nada disso mudou parser, rota ou contrato: só catálogo e projeção.

> **Status: fase 1 IMPLEMENTADA em 16/08/2026.** `parsearBacklog()`/`lerBacklog()` em
> `coletores.js` (compartilhadas por função, sem cache), `GET /api/backlog` no
> `servidor.js`, campo `backlog` no catálogo (só o SistemaLoreEngine) e a aba no
> dashboard vanilla. **Provado por sonda na entrega**: a rota devolve as 8 features
> reais do doc 39 (52 itens, 7 prontos, 9 linhas cruas preservadas, 8 linhas `(DONO)`
> — conferido por grep independente no arquivo); arquivo ausente devolve o estado
> nomeado `sem_arquivo`; o mesmo caminho parseado 2× com conteúdos diferentes refletiu
> cada versão (sem cache) — inclusive ao vivo: o doc 39 mudou DURANTE a entrega e o
> parse seguiu o arquivo. Os aceites de olho humano (1–3, na tela) ficam com o dono.
> Nota de gramática: `(PÓS-PLAYTEST)` apareceu no doc 39 sem estar declarada na seção
> "Como este arquivo funciona"; em 16/08/2026 ela foi DECLARADA no parser (6ª tag do
> `RE_TAG`) — falta a seção de gramática do doc 39 declará-la também (escrita lá é do
> Lore Engine; este painel só lê). A anotação `(NOT TO DO — doc 09)` na F7 segue fora
> da gramática: o texto fica visível no card (cru), sem chip — decidir se ela vira tag
> é conversa do dono, junto com qualquer revisão da PÓS-PLAYTEST.

**Origem (15/08/2026, conversa no Lore Engine):** o dono se perdia no formato dos docs de
planejamento; nasceu o `SistemaLoreEngine/docs/39_BACKLOG.md` — a vista única do que está
aberto, em Feature → Épico → Story → Task, cada pedaço com estado. O dono quer o "jeito
Jira" de olhar isso: um quadro visível. Decisão dele: **uma aba do painel-admin, local —
"não é pra subir nada"** (a hipótese de hospedar no servidor foi descartada por ele no
mesmo dia).

## A decisão de desenho que não se negocia

**O arquivo markdown é a VERDADE; o quadro é PROJEÇÃO.** A aba nunca tem banco, nunca
armazena estado próprio, nunca vira segunda fonte — foi exatamente por isso que um Jira
real (Plane/Taiga/etc.) foi descartado: estado num banco de ferramenta é estado que os
motores de IA (que leem o checkout) não veem, e a regra "todo selo atualiza o backlog na
mesma entrega" morre no primeiro esquecimento de atualizar dois lugares.

Corolário bom do local-only: a aba lê o **working tree** — mais fresco que qualquer push.

## Fonte de dados e multi-projeto

- `projetos.js` tem o campo **opcional** `backlog` (caminho relativo à pasta do projeto —
  para projeto com sub-repo, o caminho leva o prefixo do sub-repo, como o
  `filosofia/docs/BACKLOG.md` do ConversaComDeus: `lerBacklog` junta RAIZ + pasta +
  backlog e não consulta `subRepo`). Projeto sem o campo simplesmente não aparece na
  aba — nenhum erro, nenhuma inferência.
- Primeiro praticante: `SistemaLoreEngine` → `docs/39_BACKLOG.md`. Desde 16/08/2026 os
  **9 projetos** do catálogo têm o campo — a lista viva de praticantes mora na tabela do
  `PADROES-BACKLOG.md` da raiz, não aqui.

## O contrato de parsing (gramática do doc 39)

A gramática mora no doc 39, seção "Como este arquivo funciona" — **mudou lá, muda o parser
aqui NA MESMA ENTREGA** (regra do orquestrador da raiz; há nota espelhada no próprio doc
39). O que o parser reconhece:

- `## ` = **feature**; o estado dela é o token `[ ]`/`[x]` no título.
- Item de lista `- ` com `[ ]`/`[x]` = **épico / story / task**, nível pela indentação
  (**exatamente** 0 / 2 / 4 espaços). Os rótulos `Épico:`/`Story:`/`Task:` quando
  presentes são informativos; o nível estrutural vem da indentação. Indentação fora
  da gramática (ímpar, 6+, tab) **não é reinterpretada**: a linha vai crua ao card —
  hierarquia adivinhada em silêncio disfarçaria o que o parser não entendeu.
- Leniência DELIBERADA, mais larga que a gramática escrita do doc 39: as crases em
  volta do token são opcionais para o parser (`- [ ] foo` sem crases ainda é item),
  para um deslize de formatação não sumir com item. Quem for mudar a gramática no
  doc 39 precisa saber que o parser já aceita isso.
- Tags entre parênteses — `(DONO)`, `(EMPÍRICA)`, `(BLOQUEADA: motivo)`,
  `(SEM ESCOPO)`, `(CONGELADA)` e, desde 16/08/2026, `(PÓS-PLAYTEST)` (declarada no
  parser à frente da seção de gramática do doc 39, que só o Lore Engine edita) —
  reconhecidas em **qualquer posição** do texto do
  item, após a junção das linhas de continuação (não só no fim da linha): o doc 39
  real traz `(DONO)` no meio de texto e dentro de parêntese maior (3 dos 8 casos), e
  uma tag pode quebrar entre a linha e a continuação. Custo declarado: prosa futura
  com "(DONO …)" literal no meio de uma frase viraria chip — se doer, muda-se a
  gramática no doc 39 e o parser NA MESMA ENTREGA.
- Links markdown são renderizados como texto simples (fase 1 não navega para docs).
- Linha que não casa com a gramática é **exibida crua**, nunca descartada em
  silêncio — o quadro não pode esconder o que não entendeu. O cru preserva a
  hierarquia do arquivo (linha indentada dentro de um épico aparece DENTRO dele,
  pela mesma régua de indentação) e perde só o marcador `- ` de lista na projeção
  (sintaxe markdown não vaza; o resto do texto vai verbatim, e tag declarada na
  gramática ainda vira chip).

## Implementação (no padrão da casa)

- **`coletores.js`**: `lerBacklog()` — `fs.readFile` + parse por projeto com campo
  `backlog`; sem cache (arquivo pequeno, leitura sob demanda); falha de leitura devolve
  estado nomeado — `sem_arquivo` para arquivo ausente (ENOENT), `erro_leitura` (com o
  código do erro) para qualquer outra falha — nunca lista vazia silenciosa nem o nome
  errado para a causa. Compartilhado por função, como os demais (rota e, um dia,
  ferramenta do motor chamam a MESMA função).
- **`servidor.js`**: `GET /api/backlog` — devolve a árvore parseada de todos os projetos
  com backlog.
- **`publico/`**: a aba no dashboard vanilla — colunas por feature, cada uma com
  subtítulo discreto do projeto dono; cards de épico/story
  com placar **derivado na hora** das tasks (`n/m` marcadas — contagem nunca armazenada);
  filtro por tag, com destaque para `(DONO)` (a fila pessoal do dono é o motivo da aba);
  filtro por projeto (16/08/2026), client-side como o de tag, "todos" por padrão.

## Aceite observável

1. Abrir a aba → o quadro reflete o doc 39 real (features, estados, tags).
2. Marcar um checkbox **no arquivo** (editor) e recarregar → o quadro muda.
3. Filtro `(DONO)` mostra exatamente as linhas com a tag, de todos os projetos.
4. Apontar `backlog` para arquivo inexistente → a aba diz "sem arquivo", não quebra.

## Fase 2 — só se a fase 1 provar uso (não construir agora)

Clicar num checkbox do quadro **edita a linha correspondente do markdown** (a escrita
volta pro arquivo; a verdade continua uma só). É ação local que muda arquivo de outro
projeto: entra no regime da fase 3 do Severino — confirmação explícita na UI + log local.

## O que a aba NÃO faz

Banco próprio · sync com ferramenta externa · exposição fora do localhost (inegociável do
painel) · escrita na fase 1 · leitura de repositório remoto (é o checkout local, sempre).
