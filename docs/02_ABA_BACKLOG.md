# Aba Backlog — o quadro kanban dos projetos (fase 1: só-leitura)

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
> "Como este arquivo funciona" — o parser segue a gramática (5 tags); o texto da linha
> continua visível no card, nada se perde.

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

- `projetos.js` ganha campo **opcional** `backlog` (caminho relativo à pasta do projeto).
  Primeiro e único por ora: `SistemaLoreEngine` → `docs/39_BACKLOG.md`. Projeto sem o
  campo simplesmente não aparece na aba — nenhum erro, nenhuma inferência.
- Outros projetos entram quando adotarem um arquivo no mesmo formato (decisão por projeto,
  do dono).

## O contrato de parsing (gramática do doc 39)

A gramática mora no doc 39, seção "Como este arquivo funciona" — **mudou lá, muda o parser
aqui NA MESMA ENTREGA** (regra do orquestrador da raiz; há nota espelhada no próprio doc
39). O que o parser reconhece:

- `## ` = **feature**; o estado dela é o token `[ ]`/`[x]` no título.
- Item de lista `- ` com `[ ]`/`[x]` = **épico / story / task**, nível pela indentação
  (0 / 2 / 4 espaços). Os rótulos `Épico:`/`Story:`/`Task:` quando presentes são
  informativos; o nível estrutural vem da indentação.
- Tags entre parênteses no fim da linha: `(DONO)`, `(EMPÍRICA)`, `(BLOQUEADA: motivo)`,
  `(SEM ESCOPO)`, `(CONGELADA)`.
- Links markdown são renderizados como texto simples (fase 1 não navega para docs).
- Linha que não casa com a gramática é **exibida crua no card da feature**, nunca
  descartada em silêncio — o quadro não pode esconder o que não entendeu.

## Implementação (no padrão da casa)

- **`coletores.js`**: `lerBacklog()` — `fs.readFile` + parse por projeto com campo
  `backlog`; sem cache (arquivo pequeno, leitura sob demanda); arquivo ausente devolve
  estado nomeado (`sem_arquivo`), nunca lista vazia silenciosa. Compartilhado por função,
  como os demais (rota e, um dia, ferramenta do motor chamam a MESMA função).
- **`servidor.js`**: `GET /api/backlog` — devolve a árvore parseada de todos os projetos
  com backlog.
- **`publico/`**: a aba no dashboard vanilla — colunas por feature; cards de épico/story
  com placar **derivado na hora** das tasks (`n/m` marcadas — contagem nunca armazenada);
  filtro por tag, com destaque para `(DONO)` (a fila pessoal do dono é o motivo da aba).

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
