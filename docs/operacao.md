# painel-admin — operação (texto de referência)

Texto preservado do `CLAUDE.md` até 01/10/2026 (F3 do
`../../../historico/PLANO-CONTEXTO-POR-TAREFA.md`): as seções "Como roda" e "C-3PO
por voz, fora de casa". Estado atual em [`current.md`](current.md); original
íntegro em [`historico/CLAUDE-ate-2026-10-01.md`](historico/CLAUDE-ate-2026-10-01.md).

**O que neste texto já não vale (adjudicação de 01/10/2026):**

- Os caminhos em crase deste texto são **relativos à raiz do projeto**
  (`painel-admin/`), não a `docs/`: `docs/00_PLANO.md`, `../../X.md` etc.
  foram escritos quando o texto morava em `CLAUDE.md`.
- Uma frase foi ajustada: `"localhost only" abaixo` virou referência ao
  `invariants.md`, porque a seção deixou de estar neste arquivo.

- `npm test` agora é `node --test "test/**/*.test.js" && node scripts/check-docs.mjs`
  — a suíte **mais** o portão de documentação (`../../../PADROES-CONTEXTO.md`).
  O comentário do bloco abaixo descreve só a suíte.
- O número de testes atual está em `current.md`, medido nesta máquina —
  nunca copie de doc.
- O bloco está marcado `powershell` por herança do Windows; os comandos
  rodam iguais no shell do Omarchy.

## Como roda

```powershell
npm start   # node --env-file-if-exists=.env servidor.js
# http://localhost:7777           → dashboard
# http://localhost:7777/c3po/ → chat do C-3PO (texto e voz)
npm test    # node --test — contas.js (ssh sempre falso, I5), sonda do SSO, plane.js (Plane falso) e caminhos das áreas
```

Node ≥ 22.9 (pelo `--env-file-if-exists`). **Uma dependência**:
`@anthropic-ai/claude-agent-sdk`, versão fixada sem `^` — o zero-deps
histórico do painel acabou com a fusão, e o motor do C-3PO é o único
motivo; upgrade da versão é decisão consciente, nunca automática. O `zod`
aparece em `node_modules` como peer do SDK — não é dependência nossa.

Roda como **serviço de usuário do systemd na Omarchy** desde 27/09/2026
(`~/.config/systemd/user/painel-admin.service`, `WorkingDirectory` =
`~/Work/ProjetosPessoais/painel-admin` desde a reorganização de 30/09/2026;
`enable --now`, linger ligado:
sobe no boot sem login e reinicia se cair). Operação: `systemctl --user
{status,restart} painel-admin`; log em `journalctl --user -u painel-admin`.
De qualquer aparelho do tailnet, menos o racknerd, chega-se por
`https://painel.vpn.astargne.com` (borda do tailnet; 06/11/2026); do Windows,
também por `localhost:7777` via
encaminhamento do Remote-SSH do VS Code (`remote.SSH.defaultForwardedPorts`
no settings do usuário). O gatilho
`folderOpen` do `.vscode/tasks.json` da raiz foi removido nos dois lados.

**Reserva de carta** (F4a, 31/10/2026): antes de trabalhar numa carta, todo agente roda
`node ~/Work/ProjetosPessoais/painel-admin/scripts/reservar.mjs SIGLA-N` (e `--soltar` ao terminar).
Saída 0 = reservada (ou solta), 1 = recusada (outra sessão viva ou tentativa da frota na carta),
2 = erro (painel fora do ar: a reserva NÃO foi gravada). O lease fica em
`~/.local/state/painel-admin/reservas/` (diário `reservas.jsonl`); vence em 4 h sem nova reserva.

## Variáveis do Orquestrador no `.env` (só nomes; valores nunca em doc)

| Variável | Para quê |
|---|---|
| `PLANE_API_KEY` | leitura Guest "painel" (toda a fila) |
| `ORQ_OWNER_USER_ID` | id estável do dono no Cadastro Único; sem ele **toda** escrita falha fechada (503) |
| `PLANE_ORQ_WRITE_KEY` / `_PROJECT_ID` / `_ACTOR_ID` | legado do CKBL: chave e ator enquanto `~/.config/plane/orquestrador-ckbl.token` não existe (com o arquivo, o ator continua daqui) |
| `PLANE_ORQ_PLAYER_WRITE_KEY` / `_PROJECT_ID` / `_ACTOR_ID` | idem, PLAYER (`orquestrador-player.token`). Projeto novo: `identidadeEscrita: { arquivo: 'orquestrador-<sigla>', ator }` em `projetos.js` e a chave 600 em `~/.config/plane/`, nunca no `.env`; conferida no arranque (`/users/me`, Member) |
| `XAI_API_KEY` | transcrição de voz (xAI); sem ela a rota responde 503 |
| `PLANE_API_BASE` | sobrescreve `http://127.0.0.1:8095` |
| `PLANE_ADMIN_ACTOR_ID` | UUID do usuário **Painel Admin (C-3PO)** no Plane; liga a escrita da **mesa de decisão** (sem ela, ou inválida, a gaveta abre só para leitura e diz por quê). A chave dele **não** vai no `.env`: fica em `~/.config/plane/painel-admin.token` (modo 600, dono = o usuário do serviço), lida uma vez por operação (aberta sem seguir elo); antes de escrever, `/users/me` tem de devolver este UUID. É também o único autor cuja decisão da mesa destrava o gate do zelador (J58, PAINEL-62); sem ela, nada destrava |
| `CHAVES_SERVIDOR_ESCRITA` | `true` liga a troca de chave no `.env` do servidor pela aba Chaves (ssh + `sudo python3` fixo); **ligada em 24/10/2026** depois de REPROVADO (1ª) e APROVADO (2ª) do `validador-deploy`; remover a linha desliga a troca no servidor (o inventário continua) |
| `ORQ_EXECUCAO_HABILITADA` | `true` constrói o executor real (`orquestrador/executor-cli.js`); **ausente por padrão** — ligar é o "vai" do dono para um piloto nomeado, nunca rotina. Com ela ligada (e `ORQ_AGENDADOR` na unit), a **vigília do Hangar** despacha uma carta por vez de qualquer projeto com o **play da nave** ligado (Hangar, SSO + confirmação), sozinha, dentro dos freios do contrato e do teto global |
| `ORQ_AGENDADOR` | `true` deixa ESTA instância agendar a vigília e o zelador (trava em `agendador.json`, pid conferido a cada volta). **Só na unit systemd, nunca no `.env`**: o smoke na 7787 lê o mesmo `.env` e o mesmo estado, e dois agendadores despachariam duas vezes. Linha a acrescentar em `~/.config/systemd/user/painel-admin.service`, seção `[Service]`: `Environment=ORQ_AGENDADOR=true` (depois `systemctl --user daemon-reload` e `restart`). Quem não tomou a trava no arranque tenta de novo a cada 5 min e liga sozinho quando o dono antigo morre |
| `ZELADOR_INTERVALO_MIN` / `ZELADOR_TETO_DIA` | intervalo entre jobs do zelador (5–1440, padrão 30) e teto de jobs em 24 h (1–100, padrão 12); valor fora da faixa cai no padrão |
| `ORQ_TETO_DIA` | teto de tentativas da vigília em 24 h no **Hangar inteiro** (1–100, padrão 12; F4b), somado dos `vigilia/<projeto>.jsonl` sem as paradas da frota; o teto por projeto do contrato continua |

**Sandbox do executor (F4b, 31/10/2026).** As CLIs dos papéis e o comando de aceite rodam sob
`/usr/bin/bwrap` (pacote `bubblewrap`, 0.12.0 nesta máquina), com as chaves do Plane, o estado do
painel, `~/.ssh`, `~/.config/linear`, `~/.config/gh` e os `.env` do catálogo mascarados; o aceite
roda sem rede, salvo `"redeNoAceite": true` no `.orquestrador.json`. Sem bwrap (pacote removido,
user namespace desligado), o executor roda como antes, a tentativa de gate do zelador é impedida e
o popup do play diz "Gate do zelador inelegível: sandbox bwrap indisponível (…)". Prova real de
31/10: `claude` e `codex` (com o sandbox próprio aninhado) rodaram sob o bwrap e a chave do
zelador ficou invisível.

Estado operacional do Orquestrador: `~/.local/state/painel-admin/orquestracao/`
(`leases/`, `touchpoints.jsonl`, `saidas/<tentativa>/`, `worktrees/`,
`vigilia/<projeto>.jsonl` — diário da vigília, fonte do teto diário; o toggle antigo
`vigilia/<projeto>.json` foi renomeado para `.migrado-<data>` na F3 —, `play.json` (play por
nave), `play-historico.jsonl` (quem ligou, só acréscimo), `play-migracao.json` (marca da
migração), `agendador.json` (pid da instância que agenda) e `zelador/` — `zelador-AAAA-MM-DD.jsonl`
(diário por dia), `pendentes.jsonl` (índice fora da rotação, com a marca `DIVERGENTE` antes do
recibo), `lease-global.json` e `lease-<projeto>.json`). Lease do zelador ilegível trava o zelador
até ser apagado à mão. A chave do zelador existe desde 31/10 em `~/.config/plane/zelador.token`
(600; nunca no `.env`; ator `830e2631-de81-4871-95b7-ed9cc1774b32`); igual a um
`orquestrador-*.token` ou ao `painel-admin.token` da mesma pasta, ou sem ela, o job para antes da
CLI com `SEM_IDENTIDADE` no diário (desde a F4b, também igual à chave ou ao ator de qualquer
orquestrador do catálogo). O bloco zelador da frota só roda com provedor `claude` (Codex é recusado
pelo nome: a CLI do zelador não vai ao bwrap). O READY TO DEV do zelador grava `GATE_PENDENTE` e
`GATE_APLICADO` (origem `zelador`) no histórico da carta em `touchpoints.jsonl`. PENDENTE de projeto com o play desligado ou suspenso
é fechado num job sem CLI, só com o recibo. Os
worktrees de tentativas ficam para revisão humana — `git -C <projeto> worktree
remove <caminho>` e `git branch -D orq/...` quando não interessarem mais.

## Voltar a uma versão estável (rollback, provado em 01/11/2026)

Tags `painel-estavel-AAAAMMDD` marcam um `main` com o portão inteiro verde (a primeira,
`painel-estavel-20261101`, é o selo do PAINEL-42). Para voltar: `git switch --detach <tag>`,
`npm ci` e `systemctl --user restart painel-admin`; para retomar, `git switch main`, `npm ci` e
`restart`. O estado em `~/.local/state/painel-admin/` não migra nos dois sentidos: o commit
`d3cc972` (anterior à frota) subiu sobre o estado de hoje e o `main` subiu sobre o dele. O que a
versão velha não conhece (play, zelador, reservas, mesa) fica parado em disco até a volta.
**Não volte com PENDENTE de preparo aberto** (PAINEL-62): uma versão anterior ao preparo lê o
PENDENTE `mudanca.tipo: preparo` de `zelador/pendentes.jsonl` como `FORA_DA_LISTA` "nada escrito",
e o rótulo mente — a intenção e talvez o PATCH já estão na carta. Antes do rollback, confira que
nenhum PENDENTE de preparo está sem RESOLVIDO no índice (ou deixe um job da versão atual fechá-lo).
Ensaio sem tocar no serviço: `git worktree add /tmp/<nome> <tag>`, `npm ci` lá e subir com
`HOME` falso e `PORTA` livre (ex.: 17901). Sem a chave do Plane, `/api/orquestracao` dá 500 nas
duas versões, e isso não indica falha do rollback.

Mesa de decisão (PAINEL-53, 31/10/2026): diário de acréscimo em
`~/.local/state/painel-admin/c3po/decisoes.jsonl` — `DECISAO_PENDENTE`,
`COMENTARIO_GRAVADO`, `DECISAO_CONCLUIDA` ou `DECISAO_ABANDONADA` por chave. Uma
decisão sem fim aparece como "aplicação pendente" na aba Decisões e na gaveta, com
**Retomar** e **Abandonar** (as duas por SSO + duas ações), nunca editando o arquivo.
Retomar relê a carta e mostra as mudanças recalculadas; se a carta mudou desde a
decisão, tem lease ou a pendência passou de 24 h, ela recusa e o caminho é
**Abandonar**: grava `DECISAO_ABANDONADA` (com quem) e, se a carta estiver
acessível, um recibo `DECISAO-APLICACAO/v1` "abandonada" nela — carta apagada,
projeto congelado ou Plane fora não impedem fechar a pendência. Diário ilegível é
falha local (a mensagem diz `c3po/decisoes.jsonl`): conserte o arquivo antes.

Ações do C-3PO (fase 3, 31/10/2026): diário de acréscimo em
`~/.local/state/painel-admin/c3po/acoes.jsonl` — uma linha por etapa (proposta,
preparo, confirmação, resultado), com quem, comando, código de saída, duração e
resumo filtrado. Só cresce; apagar é decisão do dono.

## Encomendas de nave: como o orquestrador atende (PAINEL-50, 31/10/2026)

O berço do Hangar **registra** o pedido (SSO do dono + duas ações) e não cria nada: o
painel é Guest no Plane. Quem atende é o orquestrador (sessão Claude Code).

- **Onde:** `~/.local/state/painel-admin/encomendas.jsonl`, só de acréscimo. Linha do
  painel: `{"id","quando","usuarioId","nome","sigla","modulos","estado":"pedida"}`
  (`sigla` pode ser `null`: o orquestrador escolhe).
- **Ler:** `curl -s 127.0.0.1:7777/api/hangar/encomendas` (as pendentes, sem `usuarioId`;
  `legivel: false` = linha ruim no meio, que o orquestrador conserta antes de tudo) ou a
  ferramenta `encomendas` do C-3PO.
- **Criar no Plane** pelo MCP `plane`: projeto com a sigla (sem colidir com a tabela de
  `../../PADROES-BACKLOG.md`) e um módulo por linha, na ordem; agentes como Member, o
  painel como Guest.
- **Catálogo:** a entrada em `projetos.js` junto com `../CLAUDE.md`, `../../PORTAS.md` e
  a tabela de siglas (invariante 12), na mesma entrega.
- **Marcar `atendida`** com uma linha nova, nunca editando a antiga (o painel não
  reescreve linhas; `anexarJsonl` separa uma cauda interrompida). Da raiz do painel:

```sh
node --input-type=module -e "import { anexarJsonl } from './orquestrador/leitor-jsonl.js'; const [, arquivo, id, projeto] = process.argv; await anexarJsonl(arquivo, { id, quando: new Date().toISOString(), estado: 'atendida', projeto });" ~/.local/state/painel-admin/encomendas.jsonl <id da encomenda> <uuid do projeto no Plane>
```

Estado que não seja `pedida` ou `atendida` não fecha nada e aparece contado em
`ignoradas`. Não há cancelamento pela tela (lacuna); até haver, a desistência se fecha
como `atendida` com o motivo num campo `nota`.

## Memória do C-3PO e reflexão noturna (31/10/2026)

Arquivos em `~/.local/state/painel-admin/c3po/`: `MEMORIES.md` (a memória L1, até
8 KB), `memoria-historico.jsonl` (toda versão, com diff e os dois textos),
`memoria-pendente.json` (proposta da reflexão que apagaria demais),
`conversas.jsonl` (pergunta e resposta filtradas, 14 dias) e `reflexao.jsonl`
(a noite marcada `iniciada` antes da CLI e a linha do resultado depois). Editar pela
tela: `/c3po/#memoria` (preparar → confirmar, com a sessão do Cadastro Único);
desfazer é o botão de cada versão aplicada do histórico (versão que nunca virou a
atual não tem o botão; linha ruim no meio do histórico: a tela diz qual, e as
versões antes dela continuam servindo). Editar o arquivo à mão também vale: o painel
avisa "editada fora do painel" e a próxima versão gravada sai com `foraDoPainel: true`.

**Diário de conversas só com a sessão do dono** (31/10/2026): `/api/conversa` segue
aberta, mas só o turno cuja requisição traz a sessão SSO do dono entra em
`conversas.jsonl` — o loopback, um processo local ou o executor não alimentam a
reflexão. O filtro de segredo do diário é de melhor esforço (formatos conhecidos e
os valores do `.env`).

A reflexão roda por **timer de usuário**, entregue em `deploy/` e não instalado
pelo painel. Instalar (uma vez, na Omarchy):

```sh
mkdir -p ~/.config/systemd/user
cp deploy/painel-reflexao.service deploy/painel-reflexao.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now painel-reflexao.timer
systemctl --user list-timers painel-reflexao.timer   # próxima: 03:30
```

Rodar já, para conferir: `systemctl --user start painel-reflexao.service` e
`journalctl --user -u painel-reflexao` (uma linha `[reflexao] <data> <resultado>`);
a segunda vez no mesmo dia (ou antes de 20 h da última) responde `ja-rodou`. A
reflexão só aplica sozinha se não apagar mais de 30% — contra o texto de antes e
contra a última versão gravada pelo dono; passou, vira proposta pendente no painel.
Pré-requisitos: frota gravada com o
bloco zelador num modelo `claude` (aba Orquestração → Frota) e o `claude` logado na
assinatura. Desligar: `systemctl --user disable --now painel-reflexao.timer`.

## Microfone do C-3PO: dois motores (25/10/2026)

- **Navegador** (Web Speech API): Chrome e Edge mandam o áudio ao serviço
  do Google. Brave e Chromium sem chaves devolvem `network` na hora; Firefox
  não tem a API. Era a causa do "o reconhecimento de voz precisa de internet"
  repetido em laço no modo copiloto.
- **xAI** (gravação + `POST /api/orquestracao/voz/transcrever`): entra
  sozinho no primeiro erro fatal do navegador ou quando ele não tem
  reconhecimento (`GET /api/orquestracao/voz` diz se a chave existe). Exige
  a **sessão do painel** na borda (`painel.vpn.astargne.com`, logado), também
  a partir do loopback desde 29/10/2026 (R3 do PAINEL-34: o executor roda nesta
  máquina). O mesmo vale para a síntese da ElevenLabs (`POST /api/tts`); sem
  sessão, o C-3PO fala com a voz do navegador. Push-to-talk grava até o
  silêncio; o copiloto fatia por detecção de voz (energia). **Custo:** em
  copiloto por xAI tudo que se fala perto do microfone é transcrito, pago,
  inclusive em espera (o gatilho "C3PO" só se detecta no texto) — o status
  avisa.
- **Ligação** (botão "ligar", 25/10/2026): conversa aberta até "desligar",
  sem gatilho e sem o hiato de 90s. Falar por cima corta a voz na hora; a
  frase confirmada (e que não é eco da própria fala) substitui a resposta
  em curso. Pela xAI cada frase da ligação é transcrição paga — o status
  avisa. Fechar o console do dashboard desliga a chamada.
- **Diagnóstico:** o navegador manda eventos da voz (motores, erro do
  microfone, nível captado a cada 5 s, trechos enviados, áudio recusado) para
  `POST /api/diagnostico/voz`, que os grava no journal:
  `journalctl --user -u painel-admin | grep voz-diag`. Sem áudio nem texto da
  conversa. No copiloto por xAI a tela mostra um medidor "mic: ▮▮▮".

## C-3PO por voz, fora de casa (Claude app + Remote Control)

**CORREÇÃO registrada em 15/08/2026, mesmo dia**: a primeira versão desta
seção presumia Voice Mode (resposta falada) funcionando dentro de sessão do
Claude Code via Remote Control. **Errado** — a FAQ oficial
(`support.claude.com/en/articles/11101966-use-voice-mode`) é explícita:
*"While dictation is available in Claude Cowork and Code, voice mode is
not."* Dentro do Code (Remote Control incluso) só existe **dictation**
(fala→texto, resposta em texto) — nunca resposta falada. Voice Mode completo
só roda no app do Claude "puro", fora do Code, sem as ferramentas/acesso a
arquivo/rede local.

**O que fica de pé, por dictation** (fala→texto→[persona]→texto, sem áudio
de saída nativo): no app, aba **Code**, sessão conectada por
`claude remote-control --name "C-3PO"` (doc:
`code.claude.com/docs/en/remote-control.md`) — dono dita, sessão responde em
texto. **Gatilho explícito, nunca automático**: só assuma a persona abaixo
quando o dono pedir de viva voz ("fala comigo como o C-3PO"); fora disso,
sessão normal, sem persona.

Isto **não é** o app web em `/c3po/` (que tem voz de verdade via
ElevenLabs, mas só em casa): é você, Claude Code, com acesso **completo** às
suas ferramentas de sempre (decisão do dono, 15/08/2026, após avisado do
risco — comando ditado mal-transcrito pode virar ação real). Sem sandbox
técnico aqui; o freio é o próprio personagem.

- **Persona** (detalhada em `docs/00_PLANO.md`, seção "Persona"; renomeada
  de "Severino" pra **C-3PO** em 21/08/2026): droid de protocolo — formal,
  precavido, trata o dono por "Mestre". **Planejador**: confere o que tem e
  o que falta antes de agir; nunca pula direto para editar/rodar sem dizer
  em voz alta o que vai fazer primeiro (voz tem pouca banda para revisar
  diff depois — a confirmação falada faz esse papel). **Fluência não é
  onisciência**: sem checar o estado real, diz que não sabe — nunca inventa.
- **Grounding**: antes de responder sobre estado de projetos, confira de
  verdade — leia `projetos.js`/`coletores.js`, rode `curl 127.0.0.1:7777/api/...`
  se o painel estiver de pé, ou os docs modeladores dos projetos. Nunca
  responda "como estão os projetos" de memória de treino.
- **Não fura o canon**: mudança em `astargne.com` continua exigindo
  `validador-deploy` mesmo em modo C-3PO-de-voz — a persona muda o tom,
  nunca o portão.
- Isto **não** contradiz a porta fechada (invariante 1 em
  [`invariants.md`](invariants.md)): Remote Control não expõe a
  porta 7777 a nada — é a infraestrutura da própria Anthropic reconectando a
  esta sessão local; o app web continua isolado como sempre.
