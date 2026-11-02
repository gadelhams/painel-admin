# orquestrador/ — play e zelador

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

**Play e zelador** (F3 da frota, 31/10/2026; plano em [plano-frota-do-hangar.md](../plano-frota-do-hangar.md) § F3 feita).
- **Play por nave** (`play.js`, `api-play.js`, `http/rotas-orq-play.js`): `play.json` no estado da
  orquestração, `{ [projetoPlaneId]: { desde, usuarioId, suspenso? } }`; presença = ligado. Gravado
  por tmp + rename sob a trava global (o desligar não cruza uma reserva); ilegível ou de forma
  estranha = todos desligados, e a tela diz "play ilegível"; "suspenso por divergência" fica gravado,
  é distinto de desligado e só sai religando. Elegível: catálogo com Plane, não congelado, nem ANYA
  nem CKBL. `GET /api/orquestracao/play` é aberto e não devolve `usuarioId` (fica no
  `play-historico.jsonl`, só acréscimo); `POST …/play/{preparar,confirmar}` por SSO + duas ações, e o
  preparar do desligar diz o que está em curso. A vigília lê o play no lugar do toggle antigo,
  relido a cada projeto e de novo dentro de `conferirSobTrava` na reserva (J66). A migração do toggle
  (`play.migrar`, arquivo-marca `play-migracao.json`, sob a trava, antes de qualquer agendamento)
  renomeia cada `vigilia/<id>.json` para `.migrado-<data>`, anota e não liga nada; o
  `vigilia/<id>.jsonl` fica, porque é a fonte do teto diário.
- **Agendador** (`agendador-instancia.js`): vigília e zelador só agendam com `ORQ_AGENDADOR=true` (só
  na unit, `operacao.md`) e com o pid deste processo em `agendador.json`, conferido a cada volta;
  pid vivo de outro recusa, pid morto ou arquivo ilegível é tomado sob a trava (J52). Quem não tomou
  no arranque tenta de novo a cada 5 min (`tomarEVigiar`) e liga quando o dono antigo morre.
- **Job do zelador** (`zelador.js` compõe; `zelador-agendador.js`, `zelador-job.js`,
  `zelador-aplicacao.js`; o gate em `zelador-gate.js`, F4b): a cada `ZELADOR_INTERVALO_MIN`, com a primeira volta 2 min depois do arranque (PAINEL-61; o teto diário e a trava contêm reinício em laço), o projeto com play que teve a vez há mais
  tempo (pelo diário) — antes dele, o projeto elegível com PENDENTE e play desligado ou suspenso, num
  job que só fecha recibos, sem CLI nem consumo —, se a frota do zelador está ok e o provedor do bloco
  é `claude` (o Codex sob sandbox só-leitura lê o disco, e o bwrap da F4b embrulha só o executor), sem
  pausa de versão do bloco zelador nem do provedor, abaixo do teto diário (`ZELADOR_TETO_DIA`, contado
  do diário; job parado por CLI ou limite não conta), com consumo do provedor abaixo de 85% e leitura
  com menos de 6 h (`consumo.js`; sem leitura, não roda), sem sessão viva tocando o projeto nas
  últimas 2 h (`coletores/sessoes-estritas.js`, subagentes em `<sessão>/subagents/` incluídos; erro ou
  transcript sem instante legível = ocupado) e com os leases tomados (`zelador-lease.js`: global e por
  projeto, `jobId`, TTL 20 min renovado a cada 5, fencing sob a trava antes de cada escrita, ilegível
  = ocupado). No arranque, job sem fim vira `JOB_INTERROMPIDO` e o lease dele é solto. O aviso do play
  ("em curso") lê o job desta instância e o lease do zelador em disco.
- **Dentro do job**: play desligado no começo sai `PLAY_DESLIGADO` (sem PENDENTE) ou só fecha
  recibos; confere a chave e o ator antes de gastar CLI; reconcilia o PENDENTE do projeto; se a
  reconciliação deixou o play suspenso, para antes do retrato e da CLI. Monta o retrato
  (`zelador-retrato.js`: cartas, comentários, atividades e relações pela Guest, sem cache, pelo
  caminho do projeto, com o universo das relações igual ao do juiz real — as cartas de todos os
  projetos do catálogo; `zelador-git.js` com `GIT_OPTIONAL_LOCKS=0`); roda a CLI do bloco zelador da
  frota (`zelador-cli.js`: diretório vazio novo, `--tools ""` sob `--restricted` — documentado no
  `claude --help` da 2.1.284 como "desliga todas as ferramentas", não provado em execução real —, sem
  MCP nem sessão, retrato pela stdin, JSON estrito) fora da trava; valida cada veredito
  (`zelador-veredito.js`: forma fechada, evidência conferida — commit ancestral do ramo principal,
  `caminho:linha` com realpath dentro do repo e rastreado, carta existente —, prosa sem segredo, sem
  HTML e sem `GATE/`, `HANDOFF/`, `ZELADOR/`, `DECISAO/`, `[ORQ/`, trecho e texto novo sem marcador
  humano — a lista do juiz, `(DONO`/`(ASTARGNE`/`(BLOQUEADA`, mais ASTARGNE/DONO/BLOQUEADA sem
  parêntese — nem linha de dependência, e a descrição nova com as linhas marcadas intactas). Antes de
  cada carta, relê o play e a ocupação por sessão. O que ele não toca (`zelador-politica.js`): carta
  fechada, não-folha, com gate, com aplicação pendente na mesa (`/api/decisao/pendentes`; diário da
  mesa ilegível = todas), que bloqueia carta com gate ou se relaciona com carta fora da leitura do
  catálogo, com lease, reservada por sessão viva (F4b; também conferido sob a trava, antes do PATCH), com tentativa ou comentário `[ORQ/v1` nas últimas 24 h, com atividade ou
  comentário de outro ator nas últimas 2 h, ou com leitura ilegível. Antes de escrever, tudo de novo
  ao vivo: a digital (estado, etiquetas, nome, descrição, comentários que não são do zelador), o "não
  desfazer ato humano" (nunca devolve um campo ao valor de onde um não-zelador o tirou — tirada de
  qualquer estado terminal impede todos —, nunca tira etiqueta que não foi ele que pôs, nunca repõe
  `ASTARGNE` em carta com `DECISAO/v1`; atividade sem ator legível = humano) e a prontidão READY TO
  DEV das cartas abertas do projeto e das que esperam por esta em qualquer projeto: a escrita nunca
  deixa carta alguma mais elegível, e nas outras não muda nada; relação ilegível no universo aborta.
- **Escrita** (`escritor-zelador-plane.js`, a identidade "Zelador (Hangar)"): chave lida de
  `~/.config/plane/zelador.token` (600, dono) uma vez por operação, nunca do `.env`; ator conferido em
  `/users/me` contra o UUID fixo; chave igual à Guest, a outra identidade do `.env` ou a um
  `orquestrador-*.token`/`painel-admin.token` da mesma pasta (por hash) recusa, e desde a F4b também a
  chave ou o ator de qualquer orquestrador do catálogo (`chavesEAtores`, de arquivo ou do `.env`); escopo (play ∩
  catálogo) conferido em cada escrita; a mudança é revalidada contra a lista fechada. Ordem: diário
  PENDENTE no índice fora da rotação → comentário `[ZELADOR/v1 veredito=… chave=…]` com
  `external_source: zelador-hangar-v1` e `external_id` = hash da mudança estruturada + digital de
  antes + uma tentativa nova por PENDENTE (409 só vale com o comentário existente do zelador, desta
  origem e com o mesmo `external_id`: o Plane sanitiza o HTML com o `nh3`) → a mudança da lista
  fechada (Done/Cancelled; trecho único ou parágrafo anexado; etiquetas de trava por nome único no
  projeto, `PRODUTO` só com `ASTARGNE`, nunca tirada); sob a trava só o fencing, a ausência de lease
  e de tentativa de despacho, a releitura da carta e dos comentários (digital) e o PATCH, 6 s por
  chamada e 20 s no total — `/users/me`, catálogo e verificação ficam fora → verificação só dos
  campos escritos (descrição como texto) → recibo `[ZELADOR/v1 recibo=APLICADO|ABORTADO|DIVERGENTE|
  DESFEITO]` → RESOLVIDO. Verificação que não confere marca `DIVERGENTE` no índice e suspende o play
  antes do recibo. O recibo de fechamento sai mesmo com o play desligado ou suspenso, só de
  PENDENTE aberto no índice. Abortar porque a carta ficou intocável (lease, tentativa, ato alheio)
  não escreve nela: fica só no diário. Na reconciliação: recibo pela chave exata (dois resultados =
  erro), carta apagada ou arquivada resolve só no diário, mudança feita pelo zelador e desfeita por
  outro ator ganha recibo `DESFEITO` e não é refeita, PENDENTE fora da lista fechada não escreve.
- **Diário** (`zelador-diario.js`): `zelador/zelador-AAAA-MM-DD.jsonl` por dia (UTC), `anexarJsonl`,
  só campos estruturados; `zelador/pendentes.jsonl` não roda e só ganha o RESOLVIDO depois da linha
  do diário. O fim do job (`zelador-fim.js`) mede do
  Plane atual: feita (zero abertas), espera puxar (F4), tarefa do dono, decisão, espera outra carta e
  espera integração (ramos `orq/*` fora do principal); "só o dono" acende o destaque no Hangar.
  `GET /api/orquestracao/zelador` (job em curso, diário dos três últimos dias, fim por projeto); o
  diário da frota (`diario-frota.js`) e a ferramenta `diario_zelador` do C-3PO (`consulta-zelador.js`)
  leem o mesmo arquivo.
