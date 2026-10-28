# painel-admin — operação (texto de referência)

Texto preservado do `CLAUDE.md` até 01/10/2026 (F3 do
`../../../PLANO-CONTEXTO-POR-TAREFA.md`): as seções "Como roda" e "C-3PO
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
Do Windows chega-se por `https://painel.vpn.astargne.com` (borda do
tailnet, só o IP do Windows; 06/10/2026) ou por `localhost:7777` via
encaminhamento do Remote-SSH do VS Code (`remote.SSH.defaultForwardedPorts`
no settings do usuário). O gatilho
`folderOpen` do `.vscode/tasks.json` da raiz foi removido nos dois lados.

## Variáveis do Orquestrador no `.env` (só nomes; valores nunca em doc)

| Variável | Para quê |
|---|---|
| `PLANE_API_KEY` | leitura Guest "painel" (toda a fila) |
| `ORQ_OWNER_USER_ID` | id estável do dono no Cadastro Único; sem ele **toda** escrita falha fechada (503) |
| `PLANE_ORQ_WRITE_KEY` / `_PROJECT_ID` / `_ACTOR_ID` | identidade técnica do CKBL (chave distinta da Guest, projeto único, ator conferido na resposta) |
| `PLANE_ORQ_PLAYER_WRITE_KEY` / `_PROJECT_ID` / `_ACTOR_ID` | idem, PLAYER; projeto novo exige a entrada em `servidor.js` na mesma entrega |
| `XAI_API_KEY` | transcrição de voz (xAI); sem ela a rota responde 503 |
| `PLANE_API_BASE` | sobrescreve `http://127.0.0.1:8095` |
| `CHAVES_SERVIDOR_ESCRITA` | `true` liga a troca de chave no `.env` do servidor pela aba Chaves (ssh + `sudo python3` fixo); **ligada em 24/10/2026** depois de REPROVADO (1ª) e APROVADO (2ª) do `validador-deploy`; remover a linha desliga a troca no servidor (o inventário continua) |
| `ORQ_EXECUCAO_HABILITADA` | `true` constrói o executor real (`orquestrador/executor-cli.js`); **ausente por padrão** — ligar é o "vai" do dono para um piloto nomeado, nunca rotina. Com ela ligada, a **vigília** de um projeto (tópico da aba, SSO + confirmação) passa a despachar sozinha dentro dos freios do contrato |

Estado operacional do Orquestrador: `~/.local/state/painel-admin/orquestracao/`
(`leases/`, `touchpoints.jsonl`, `saidas/<tentativa>/`, `worktrees/`,
`vigilia/<projeto>.json|.jsonl` — toggle e diário da vigília); os
worktrees de tentativas ficam para revisão humana — `git -C <projeto> worktree
remove <caminho>` e `git branch -D orq/...` quando não interessarem mais.

## Microfone do C-3PO: dois motores (25/10/2026)

- **Navegador** (Web Speech API): Chrome e Edge mandam o áudio ao serviço
  do Google. Brave e Chromium sem chaves devolvem `network` na hora; Firefox
  não tem a API. Era a causa do "o reconhecimento de voz precisa de internet"
  repetido em laço no modo copiloto.
- **xAI** (gravação + `POST /api/orquestracao/voz/transcrever`): entra
  sozinho no primeiro erro fatal do navegador ou quando ele não tem
  reconhecimento (`GET /api/orquestracao/voz` diz se a chave existe). Exige
  a **sessão do painel** na borda (`painel.vpn.astargne.com`, logado). No
  loopback (`127.0.0.1` ou `localhost`) a mesma origem do painel transcreve
  sem essa sessão — a guarda já recusa POST de outro site. Push-to-talk grava até o
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
