# Mesa de decisão — discutir com o C-3PO e destravar a carta (painel-admin)

Plano de 28/10/2026, ainda não construído. Decidido pelo dono: grava **comentário +
destravar** (lista fechada) e mora no **Hangar e na aba Decisões** (um componente só).
Só carta que espera decisão do dono (`ASTARGNE`/`PRODUTO`) entra na mesa; bloqueio
por outra carta não é decisão (dono, 28/10/2026). Destravar = tirar `ASTARGNE` e
trocar só o marcador `(DONO…)`/`(ASTARGNE…)` da descrição por `(decidido em …)`.
Primeira fila: as 12 perguntas da revisão de cartas de 28/10.

## O que o dono vê
1. No popup da decisão (peça no chão, estação de planejamento) e em cada linha
   da aba Decisões: botão **"Discutir com o C-3PO"**.
2. Abre a **gaveta da mesa**: à esquerda a carta inteira (título, módulo,
   tags, descrição, comentários, link do Plane); à direita o chat do C-3PO,
   numa sessão própria daquela carta (volta onde parou se reabrir).
3. O C-3PO abre a conversa dizendo qual é a pergunta e o que a carta trava.
   Discute com as ferramentas só-leitura dele (+ `carta_plane`, nova).
4. **Registro de decisão** (formulário abaixo do chat): decisão em uma frase,
   motivo, efeitos marcáveis. Botão "Pedir rascunho ao C-3PO" preenche o
   formulário a partir da conversa; o dono edita.
5. **Gravar no Plane** → SSO + duas ações (preparar mostra exatamente o que
   vai mudar; confirmar grava). Resultado na gaveta e no diário do C-3PO; o
   Hangar tira a peça do chão no próximo ciclo do Plane.

## Efeitos permitidos (lista fechada, v1)
- comentário `DECISAO/v1` (sempre; decisão, motivo, efeitos, data, autor "Astargne via painel");
- tirar `ASTARGNE` (ou a legada `DONO`) e trocar só o marcador `(DONO…)`/`(ASTARGNE…)` da
  descrição por `(decidido em DD/MM: …)` — `BLOQUEADA` por outra carta não é decisão;
- pôr ou tirar `PRODUTO`;
- mudar o estado para um dos estados do projeto (Backlog/Todo/In Progress/Done/Cancelled).
Fora: criar/apagar carta, módulo, label, membro, projeto; editar descrição.
Projetos: os do catálogo com Plane, **menos Anya** (verdade no Linear) e congelados.

## Peças (reuso)
- `decisao/protocolo-decisao.js` — texto DECISAO/v1 (escapado) e leitura dele.
- `decisao/efeitos.js` — valida a lista fechada contra a carta ATUAL (relida no
  preparar e de novo no confirmar; `updated_at` mudou entre os dois → recusa).
- `decisao/escritor-decisao-plane.js` — identidade **Painel Admin** (chave no
  `.env`, `PLANE_ADMIN_KEY` + `PLANE_ADMIN_ACTOR_ID`), autoria conferida como no
  `escritor-handoff-plane.js`, idempotência por `external_id`.
- `http/rotas-decisao.js` — `GET /api/decisao/carta` (leitura, chave Guest),
  `POST /api/decisao/preparar|confirmar` via `criarApiDuasAcoes` +
  `criarAutorizador` + `criarDesafios` (o esqueleto que Chaves e Orquestração já usam).
- `motor/ferramentas.js` — ferramenta só-leitura `carta_plane`.
- Front: `publico/mesa-decisao.js` (+ CSS) aberto pelo Hangar (`conteudo.js`) e
  pela aba Decisões (`decisoes-linha.js`); chat reaproveita `c3po/fluxo-sse.js`.

## Ordem de escrita — revista pelo validador de invariantes (28/10, NÃO RATIFICÁVEL → 23 janelas)
Fatos do Plane v1.4.2 (lidos no container): `updated_at` é atualizado em segundo
plano e muda com a própria escrita (não serve de versão); POST de comentário não
confere o projeto da carta; PATCH de labels apaga e recria sem transação e
descarta id de outro projeto com 200.

**Preparar (sem escrita):** projeto derivado no servidor (SIGLA-n + lista de
PERMISSÃO em `projetos.js`, Anya recusado por id) → leitura SEM cache pelo
caminho do projeto (carta, comentários, labels, estados; `carta.project` igual)
→ impressão digital de conteúdo (estado, labels ordenadas, nome, hash da
descrição, ids dos comentários) → efeitos como DELTA (DONO ≡ ASTARGNE, nome de
label único, recusa com lease ativo, aviso se a carta fica despachável) → HTML
escapado montado e guardado no servidor.

**Confirmar:** desafio "executando" + `comTrava` (a trava é GLOBAL, um `.trava` só para toda a orquestração, quem espera desiste em ~60 s — validador 29/10: nunca segurar com CLI nem com muitas chamadas ao Plane) → releitura sem cache, digital igual ou recusa sem escrita → ids
resolvidos de novo por nome → diário DECISAO_PENDENTE (padrão `registro-gate.js`)
→ comentário de INTENÇÃO `DECISAO/v1` (`external_source: painel-decisao-v1`,
`external_id` = chave; timeout não segue) → diário COMENTARIO_GRAVADO →
releitura (labels/estado, nunca `updated_at`) → um PATCH com labels = releitura
± delta → releitura de verificação (aplicado/não aplicado/divergente, qualquer
que seja a resposta) → RECIBO `DECISAO-APLICACAO/v1` → diário CONCLUÍDA →
`limparCachePlane()`. Teto de tempo dentro da trava.

**Arranque:** decisão PENDENTE aparece como "aplicação pendente" na gaveta e na
aba Decisões. **Retomar:** SSO + duas ações, mesma chave, recomeça do ponto do diário.

**Resíduo declarado:** a janela de milissegundos entre a última releitura e o
PATCH de labels não fecha no Plane v1 contra escritores de FORA do painel
(MCP, Codex, tela); vai para `docs/invariants.md`.

**Chave e modelo:** chave do Painel Admin lida de arquivo 600 só no escritor,
nunca em `process.env`; `motor.js` com `settingSources: []`, `strictMcpConfig`
e env por lista branca (carta própria no PAINEL); rascunho do C-3PO chega com
efeitos DESMARCADOS e nunca devolve `confirmacaoId`; teste estrutural de que
`motor/` não importa o escritor.

**Docs na mesma entrega:** `docs/invariants.md` §6 (e o §4, que diz quatro
ferramentas e são seis), `docs/arquitetura.md`, `docs/operacao.md`,
`PADROES-BACKLOG.md` (a linha do Painel Admin diz "só administração").

## Invariante que muda (docs/invariants.md §6)
Hoje: "escritor opcional usa chave própria, projeto único". Passa a: escritores
de orquestração seguem projeto único; o **escritor de decisão** usa a identidade
Painel Admin em vários projetos, mas só a lista fechada acima, só com SSO + duas
ações, e a chave nunca sai do servidor.

## Aceite
- Teste que varre as rotas do app: todo POST novo exige autorizador (regra 6; base da PAINEL-17).
- Unidade: protocolo (escape, segredo não ecoa), efeitos (lista fechada, Anya
  recusado, carta mudou entre preparar e confirmar, tag ausente), escritor com
  fetch falso (ordem, idempotência, autoria, falha do PATCH registrada).
- Nenhuma chamada real de LLM nem de Plane nos testes (mocks).
- Playwright: gaveta abre do Hangar e da aba Decisões; chat mockado; gravar
  mostra o resumo do preparar e só escreve depois de confirmar.
- Conferido de fora: uma decisão real escolhida pelo dono gravada numa carta, comentário e efeito relidos pela chave Guest.

## Fora desta entrega
Ingest em `docs/decisoes.md` (depende do estudo do LLM Wiki); voz na mesa;
cartas filhas geradas pela decisão.
