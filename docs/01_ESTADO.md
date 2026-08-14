# Severino — estado real

**Atualizado em 14/08/2026, madrugada seguinte (FUSÃO no painel-admin).**
Este arquivo registra o que está **provado funcionando**, com as evidências
colhidas de fora (curl contra o processo em execução, nunca só leitura do
código — regra 4 dos padrões gerais).

## Fusão no painel-admin: EXECUTADA E PROVADA (14/08/2026, noite)

Decisão expressa do dono revogando a separação em projetos irmãos (nota
datada no topo do [`00_PLANO.md`](00_PLANO.md)). Resultado: **um app, um
processo, porta 7777** — dashboard em `/`, chat em `/severino/`; a 7778
deixou de existir. O repo `github.com/gadelhams/severino` foi arquivado como
lápide; código e história seguem em `github.com/gadelhams/painel-admin`
(privado).

| Mudança estrutural | Onde |
|---|---|
| Coletores extraídos e compartilhados: rotas HTTP e ferramentas do motor chamam as MESMAS funções — zero HTTP para o próprio processo | `coletores.js` (novo) |
| Servidor único: rotas do painel + `POST /api/conversa` (SSE) + `GET/POST /api/tts` + estáticos com `/severino/` (redirect de `/severino`) | `servidor.js` |
| Motor com persona atualizada (o painel é o corpo, não um irmão que pode cair); portão só-leitura intacto (`tools: []` + allowlist) | `motor.js` |
| Dependência única `@anthropic-ai/claude-agent-sdk` **0.3.232** (a mesma fixada pelo severino); engines `>=22.9` | `package.json` |
| `.env` migrado por move (nunca lido/impresso); `git check-ignore` confirma cobertura antes de qualquer commit | `painel-admin/.env` |
| Severino removido do catálogo de projetos (deixou de ser irmão) | `projetos.js` |

### Provas de aceite (14/08/2026, ~23:37–23:41, processo fundido PID 52612)

Sintaxe: `node --check` OK em `servidor.js`, `coletores.js`, `motor.js`,
`projetos.js`, `publico/app.js`, `publico/severino/chat.js`,
`publico/severino/voz.js`.

APIs do painel vivas no processo fundido:

```
GET /api/projetos  -> 200 · 8 projetos (severino AUSENTE do catálogo)
                      LoreEngine: main, commit 2026-08-14T13:53 "Lint do
                      verificar-datas (formatação Biome)…" · portas ativas
                      ao vivo: LoreEngine:5432, Mapa Khorvaire:54329
GET /api/producao  -> 200 · Corre do Tarado -> HTTP 200 500ms ·
                      Caddy do host (astargne.com) -> HTTP 301 485ms
```

Estáticos — dashboard e chat na mesma porta:

```
GET /           -> 200 text/html (dashboard, com o link 🎤 Severino)
GET /severino/  -> 200 text/html (chat)
GET /severino   -> 301 Location: /severino/   (assets relativos dependem da barra)
GET /severino/chat.js · /severino/voz.js -> 200 text/javascript
GET /../motor.js (path-as-is)            -> 404
GET /severino/../../CLAUDE.md (path-as-is, sem conversão) -> 404
```

SSE — o motor fala com os coletores INTERNOS (a 7778 já estava morta; não
existe outro processo que pudesse fornecer o dado):

```
23:39:44.234 event: inicio
23:39:44.252 data: {"sessao":"3fc5e8f9-…","modelo":"claude-sonnet-5"}
23:39:46.260 event: ferramenta
23:39:46.278 data: {"nome":"estado_projetos"}
23:39:46.738 event: ferramenta
23:39:46.756 data: {"nome":"estado_producao"}
23:39:50.218 event: token   "Oxente, vou te dar o retrato de agora m"
23:39:50.759 event: token   "…tirado pelo próprio painel:\n\n**Git — tudo limpo…"
23:39:51.850 event: token   "…SistemaLoreEngine | main | hoje 13:53 — lint do
                             verificar-datas (Biome)…Mapa Khorvaire…hoje 13:20…"
...tokens pingando a cada ~0,5 s...
23:39:57.823 event: fim     custoUsd 0.3747
```

O commit "hoje 13:53" citado bate byte a byte com o `/api/projetos` colhido
minutos antes — dado que não existe em conhecimento de treino.

Voz — a chave migrou viva (primeira prova do caminho feliz da ElevenLabs,
que no repo antigo ficara pendente por falta de chave):

```
GET  /api/tts -> 200 {"disponivel":true}
POST /api/tts {"texto":"Oxente, agora moro no painel, visse?"}
     -> 200 content-type=audio/mpeg · 41 422 bytes · começa em "ID3" (MP3 real)
```

Rede — localhost only, 7778 morta:

```
netstat: TCP 127.0.0.1:7777 LISTENING 52612   (único listener; nada na 7778)
curl 127.0.0.1:7778/        -> conexão RECUSADA (exit 7)
curl http://100.87.142.59:7777/ (IP de rede da máquina) -> conexão RECUSADA
```

### Pendências para o integrador da raiz (fora da fronteira desta execução)

- Apagar a pasta local `severino/` após reverificação (o repo remoto está
  arquivado; o código vive aqui).
- Raiz: `CLAUDE.md` (tabela de projetos, relações, tabela de portas — a 7778
  sai) e qualquer outro doc que cite o severino como projeto.
- `.vscode/tasks.json` + `iniciar-assistentes.cmd` da raiz: parar de subir o
  severino na 7778 (senão ele ressuscita ao abrir o workspace); o painel
  fundido exige Node ≥ 22.9 (o load do `.env` continua defensivo no próprio
  `servidor.js`, então `node servidor.js` seco segue funcionando).
- Atalho "Severino" da área de trabalho → `http://127.0.0.1:7777/severino/`.

## Fase 1 — chat de texto grounded: ENTREGUE

| Peça | Arquivo | Estado |
|---|---|---|
| Servidor HTTP `127.0.0.1:7778` (estáticos + SSE) | `servidor.js` | Provado |
| Motor: Agent SDK + persona + 3 ferramentas só-leitura | `motor.js` | Provado |
| UI de chat vanilla (texto + pensando; o microfone chegou depois, na fase 2) | `publico/` | Provado |
| Dependência única fixada | `package.json` (`@anthropic-ai/claude-agent-sdk` **0.3.232**, sem `^`) | Provado |

- **Modelo**: `claude-sonnet-5` em toda resposta (evento `inicio` do SSE expõe
  o modelo — prova (b) abaixo).
- **Autenticação**: login do Claude Code já existente na máquina. **Funcionou
  em modo headless sem `ANTHROPIC_API_KEY`** — nenhuma credencial criada.
- **Só-leitura estrutural**: `tools: []` (zero ferramentas embutidas do
  harness) + servidor MCP em processo com só as três ferramentas +
  `allowedTools` nelas + `permissionMode: 'dontAsk'` (o que não está
  pré-aprovado é negado sem prompt).
- **Nota de dependência**: `zod` chega em `node_modules` como *peer
  dependency* declarada do próprio SDK (a assinatura de `tool()` exige schema
  zod). Não é dependência nossa no `package.json`.

## Provas de aceite (14/08/2026, ~01:48–01:50)

Pré-condição conferida: painel-admin vivo em `127.0.0.1:7777` (respondeu
`/api/projetos` e `/api/producao` ao curl).

### (a) "como estão os projetos?" → dados VIVOS do painel

```
curl -sN -X POST http://127.0.0.1:7778/api/conversa \
  -H "content-type: application/json" \
  -d '{"mensagem":"Severino, como estão os projetos?"}'
```

Trecho da saída, com hora de chegada de cada evento (SSE **incremental** —
tokens pingando ao longo de ~29 s, não um blob no fim):

```
01:48:10.056 event: inicio
01:48:10.076 data: {"sessao":"8ab8383c-..."}
01:48:13.127 event: ferramenta
01:48:13.148 data: {"nome":"estado_projetos"}
01:48:13.188 event: ferramenta
01:48:13.207 data: {"nome":"estado_producao"}
01:48:16.221 event: token
01:48:16.240 data: {"texto":"Oxente, vamo lá — panorama fresqu"}
01:48:17.667 event: token
01:48:17.685 data: {"texto":"inho do painel:\n\n**Ativos e com trabalho recente:**\n- **SistemaLoreEngine** — branch `"}
01:48:19.115 event: token
01:48:19.131 data: {"texto":"main`, último commit hoje (01:32): \"Barra de ações (docs 28/35, ADR-0028)..."}
...
01:48:35.399 event: token
01:48:35.416 data: {"texto":"` → 200 OK, 463ms\n- `astargne.com` (Caddy do host) → 301, 445ms\n\n..."}
01:48:39.313 event: fim
01:48:39.330 data: {"sessao":"8ab8383c-...","custoUsd":0.356218}
```

A resposta citou branch/commit reais da madrugada (LoreEngine 01:32, Mapa
Khorvaire 01:22), arquivos sujos ao vivo (inclusive os do próprio severino,
ainda não commitados na hora da pergunta) e latências reais das sondas —
nada disso existe em conhecimento de treino.

### (b) "o que falta no DiscordTranscriber?" → plano REAL via docs_projeto

```
curl -sN -X POST http://127.0.0.1:7778/api/conversa \
  -H "content-type: application/json" \
  -d '{"mensagem":"Severino, o que falta no DiscordTranscriber?"}'
```

```
01:49:34.065 event: inicio
01:49:34.083 data: {"sessao":"42d0d824-...","modelo":"claude-sonnet-5"}
01:49:37.137 event: ferramenta
01:49:37.153 data: {"nome":"docs_projeto"}      (3 chamadas: lista + leituras)
01:49:41.749 event: ferramenta
01:49:41.771 data: {"nome":"estado_projetos"}
01:49:58.147 event: token
01:49:58.168 data: {"texto":"...**O que falta, por onda (do `02_PLANO_EXECUCAO_ONDAS.md`):**\n\n- **Onda 2 — domínio,"}
01:49:58.685 event: token
01:49:58.702 data: {"texto":" o coração do projeto:** parser do formato discmeet, limpeza (filtro de alucinação do Whisper), ..."}
01:50:04.206 event: fim
01:50:04.225 data: {"sessao":"42d0d824-...","custoUsd":0.1934...}
```

Citou as ondas reais do plano de execução, o fato de só `packages/contracts`
existir, as decisões em aberto (pasta fora do OneDrive, modelo local do
classificador) e as dependências do Lore Engine — conteúdo do
`docs/02_PLANO_EXECUCAO_ONDAS.md` real do projeto. O evento `inicio` expõe
`"modelo":"claude-sonnet-5"`.

### Estáticos e segurança de borda

```
GET /            -> 200 (text/html; charset=utf-8)
GET /chat.js     -> 200 (text/javascript; charset=utf-8)
GET /estilo.css  -> 200 (text/css; charset=utf-8)

curl --path-as-is http://127.0.0.1:7778/../motor.js        -> 404
curl --path-as-is http://127.0.0.1:7778/..%2f..%2fCLAUDE.md -> 404
POST /api/conversa com {} ou corpo não-JSON                 -> 400
```

### Loopback only

```
netstat -ano | grep 7778
  TCP    127.0.0.1:7778    0.0.0.0:0    LISTENING    48424

curl http://192.168.1.98:7778/   (IP da máquina na rede local)
  -> conexão RECUSADA — a porta não existe fora do loopback
```

## Fase 2 — voz nos dois sentidos: ENTREGUE (prova humana pendente)

Toda no frontend (`publico/`), zero dependências novas, `servidor.js` e
`motor.js` **intocados**. Executada em 14/08/2026, tarde.

| Peça | Arquivo | Estado |
|---|---|---|
| Módulo de voz: seleção do Antônio por nome + fallback, locutor incremental, reconhecedor push-to-talk | `publico/voz.js` (novo) | Servido e sintaxe provada; áudio pende do dono |
| Mic no fluxo do chat + tokens alimentando o locutor | `publico/chat.js` | Idem |
| Botão de mic, linha `#status-voz`, carga do `voz.js` | `publico/index.html` | Servido (200, novo conteúdo confirmado por curl) |
| Estilos do mic (`.ouvindo` pulsando), status e `.aviso-voz` | `publico/estilo.css` | Servido (200) |

Decisões do plano herdadas e implementadas:

- **Voz oficial por nome**: pt-BR cujo nome normalizado (sem acento/caixa)
  contém `antonio` + `natural` — o nome real no Edge é
  "Microsoft Antonio Online (Natural) - Portuguese (Brazil)", e a comparação
  tolerante não depende da grafia exata. Velocidade e tom 1.0 explícitos.
- **Fala incremental**: locutor por resposta acumula tokens e fala por
  sentença (`.!?…` + espaço — não corta "3.5" nem "01:32") ou quebra de linha
  (`acharCorte` em `voz.js`); markdown é limpo só para a fala
  (`limparParaFala`) — o texto na tela fica como veio. Sem esperar a resposta
  inteira, sem falar token a token; utterances curtas também evitam o corte
  de fala longa dos navegadores.
- **Push-to-talk estrito**: `continuous: false`, uma captura por clique,
  encerra sozinha no silêncio; segundo clique cancela (`abort`). Sem hotword,
  nada sempre-ouvindo.

### Provas por sonda (14/08/2026, ~14:33–14:34)

Sintaxe: `node --check publico/voz.js` e `node --check publico/chat.js` — OK.

Estáticos servidos **ao vivo** pelo processo já em execução (nenhum restart):

```
GET /            -> 200 (text/html; charset=utf-8, 1023 bytes)
GET /voz.js      -> 200 (text/javascript; charset=utf-8, 8120 bytes)
GET /chat.js     -> 200 (text/javascript; charset=utf-8, 5906 bytes)
GET /estilo.css  -> 200 (text/css; charset=utf-8, 2807 bytes)

curl -s http://127.0.0.1:7778/ | grep microfone
  -> <button id="microfone" type="button" aria-label="Falar com o Severino" ...>
curl -s http://127.0.0.1:7778/voz.js | grep antonio
  -> nome.includes('antonio') && nome.includes('natural')
```

Regressão da fase 1 — a voz não quebrou o texto (SSE segue incremental):

```
curl -sN -X POST http://127.0.0.1:7778/api/conversa \
  -H "content-type: application/json" \
  -d '{"mensagem":"Severino, tá me ouvindo?"}'

14:34:16.741 event: inicio
14:34:16.759 data: {"sessao":"f9a02707-...","modelo":"claude-sonnet-5"}
14:34:18.725 event: token
14:34:18.743 data: {"texto":"Ó"}
14:34:19.032 event: token
14:34:19.051 data: {"texto":", tô sim! Alto e bom som, visse?"}
...tokens pingando ao longo de ~5 s...
14:34:22.115 event: fim
14:34:22.133 data: {"sessao":"f9a02707-...","custoUsd":0.286002}
```

### Caminhos de degradação (revisados um a um no código)

> **Nota do upgrade (14/08/2026, noite)**: com a camada 3, a cadeia completa
> começa na ElevenLabs — ver a seção do upgrade abaixo. Os caminhos desta
> lista continuam valendo como os degraus 2 e 3 da cadeia; o que era
> `falarSegmento` virou `falarBlocoAntonio` em `voz.js`, e a fala agora sai
> em blocos maiores (fluidez), não por sentença.

Regra do contrato: degradar **declarando**, nunca quebrar; erro vira mensagem
na UI, não console silencioso.

1. **Sem `SpeechRecognition` no navegador** → botão de mic desabilitado com
   motivo no `title` e na linha `#status-voz` — `chat.js` (bloco
   `if (!Voz.temReconhecimento)`) + `voz.js` (`atualizarStatus`).
2. **Sem `speechSynthesis`** → status "síntese de voz indisponível … só em
   texto"; `falarSegmento` retorna cedo — `voz.js`.
3. **Sem nenhuma voz pt-BR** → status declara; nada é falado — `voz.js`
   (`escolherVoz` + `atualizarStatus`).
4. **Antônio ausente (outro navegador/máquina)** → fallback declarado do
   plano: primeira voz pt-BR, e o status diz **qual** voz está em uso —
   `voz.js` (`escolherVoz`).
5. **Síntese falha em runtime (sem internet — o Antônio é online)** →
   `fala.onerror` mata o locutor, esvazia a fila e emite **um** aviso
   discreto (`.aviso-voz`); a resposta segue em texto — `voz.js`
   (`falarSegmento`); `canceled`/`interrupted` não contam como falha.
6. **Erros de reconhecimento** (permissão negada, rede, sem fala, sem mic,
   idioma não suportado) → mapa `ERROS_RECONHECIMENTO` vira nota clara na
   conversa; `aborted` (cancelamento do próprio usuário) é silencioso —
   `voz.js` (`ouvir`) + `chat.js` (`aoErro`).
7. **Mic clicado enquanto o Severino fala** → `Voz.calar()` antes de ouvir,
   para o reconhecimento não capturar a própria síntese — `chat.js`.
8. **Captura final com envio em andamento** → o texto espera no campo em vez
   de atropelar a conversa (guarda `enviar.disabled` no `aoFinal`) —
   `chat.js`.

### Prova pendente do dono (aceite pleno da fase 2)

O aceite — "uma ida e volta inteira sem tocar no teclado, no Edge" — exige
microfone e ouvidos humanos. Roteiro exato:

1. Abrir o atalho **"Severino"** da área de trabalho (app do Edge).
2. Conferir a linha sob o campo de texto. Desde o upgrade da camada 3, ela
   declara a camada ativa: **"voz: ElevenLabs"** (com chave no `.env`) ou
   **"voz: Antônio — ElevenLabs sem chave"** (sem chave). Qualquer outra
   coisa é queda declarada — anotar o motivo que apareceu.
3. Clicar no botão de microfone. **Na primeira vez o Edge pede permissão de
   microfone — Permitir.** O botão pulsa vermelho e o campo mostra
   "pode falar, tô ouvindo…".
4. Falar "como estão os projetos?" — o parcial aparece no campo; no silêncio
   a captura fecha e a pergunta entra sozinha no chat.
5. Ouvir o Antônio falar a resposta por sentenças **enquanto** o texto pinga
   na tela.
6. Contraprovas rápidas: clicar no mic durante a fala (corta o Antônio e abre
   escuta); negar a permissão do mic (aviso claro na conversa, nada quebra).

Se o Edge se comportar diferente do mapeado (ex.: erro `network` do
reconhecimento mesmo com internet — o serviço dele é online/Azure), registrar
aqui o comportamento real encontrado: é parte do contrato da fase 2.

## Upgrade de voz — camada 3 (ElevenLabs) + fluidez: ENTREGUE (prova com chave pendente do dono)

Contrato: bloco **"UPGRADE DECIDIDO"** do `00_PLANO.md`. Executado em
14/08/2026, noite. Zero dependência npm nova; `motor.js` intocado.

| Peça | Arquivo | Estado |
|---|---|---|
| `POST /api/tts` — proxy de streaming p/ ElevenLabs; sem chave → **503 com motivo nomeado** | `servidor.js` (`responderTts`) | Provado por curl |
| `GET /api/tts` — sonda de disponibilidade (não sintetiza, não gasta caractere) | `servidor.js` (rota) | Provado por curl |
| Carga do `.env`: `npm start` com `--env-file-if-exists` **e** `process.loadEnvFile` defensivo no próprio servidor | `package.json` + `servidor.js` (topo) | Provado (servidor religado com a flag) |
| Cadeia de degradação declarada: ElevenLabs → Antônio → só texto | `publico/voz.js` | Servido ao vivo; áudio pende da chave |
| Fluidez: limpeza de marcação p/ fala + blocos maiores (vale p/ as DUAS camadas) | `publico/voz.js` (`limparParaFala`, `acharCorte`/`MIN_BLOCO`) | Servido; sintaxe provada |

Decisões de implementação (da doc pública da ElevenLabs, consultada na hora):

- Endpoint upstream: `POST api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
  (header `xi-api-key`), `output_format=mp3_44100_128`.
- Modelo: **`eleven_multilingual_v2`** — o de qualidade para pt-BR (o
  flash_v2_5 é mais barato/rápido, mas timbre era justamente a queixa).
- Voice_id default: `JBFqnCBsd6RMkjVDRZzb` ("George", multilíngue — o default
  do quickstart público deles); troca por `ELEVENLABS_VOZ_ID` no `.env`.
- A chave **jamais** aparece em log, erro ou resposta; upstream recusando
  (401/quota), a resposta ao front é genérica de propósito
  (`elevenlabs-recusou` + status), detalhe no log do servidor sem a chave.
- `.env` não existia na máquina na hora da execução (conferido sem abrir) —
  por isso o caminho feliz (áudio real) fica no roteiro do dono abaixo.

### A cadeia de degradação, ponto a ponto (onde no código)

1. **ElevenLabs disponível** → cada bloco de fala vira `POST /api/tts`; os
   downloads correm em paralelo, o áudio toca **em fila sequencial** —
   `voz.js` (`falarBlocoEleven`, cadeia de promises `filaAudio` + `tocar`).
   Status: **"voz: ElevenLabs"**.
2. **Sem chave / API fora / recusa** → 503/502 com `motivo` nomeado do
   servidor; o front cai para o Antônio **declarando** — `voz.js`
   (`sintetizarEleven` lança com o motivo traduzido por `MOTIVOS_TTS`;
   `cairParaAntonio` desliga a camada pela sessão e atualiza o status;
   primeiro tombo também vira aviso na conversa, `avisarUmaVez`). Status:
   **"voz: Antônio — ElevenLabs sem chave"** (ou o motivo real).
3. **Na carga da página** a sonda `GET /api/tts` antecipa o status sem gastar
   caractere — `voz.js` (fetch no topo do módulo).
4. **Antônio ausente** (outro navegador) → primeira voz pt-BR, status diz
   qual — `voz.js` (`escolherVoz` + `atualizarStatus`).
5. **Sem síntese nenhuma / sem voz pt-BR** → **"só texto — <motivo>"** no
   status; a resposta segue na tela — `voz.js` (`atualizarStatus`,
   `falarBlocoAntonio` retorna cedo).
6. **Antônio falha em runtime** (é voz online) → aviso único, fila esvaziada,
   segue texto — `voz.js` (`falarBlocoAntonio.onerror`), como na fase 2.
7. **`calar()`** (nova pergunta / clique no mic) agora também pausa o áudio
   ElevenLabs em curso e **aborta downloads em voo** — `voz.js` (`matar`:
   `abortador.abort()` + `pause()`); no servidor, cliente que some aborta o
   upstream (`res.on('close')` → `AbortController`).

### Fluidez (a queixa "leitura esquisita, não fluida")

- `limparParaFala` (`voz.js`): fala é texto corrido — remove asterisco,
  cerquilha, crase, til de riscado, marcador de lista; link markdown vira só
  o texto visível; tabela vira enumeração; emoji e setas não se leem. A tela
  continua mostrando a marcação normal.
- Blocos maiores (`acharCorte` + `MIN_BLOCO = 160`): parágrafo corta sempre
  (respiração natural); sentença/linha só corta após acumular o mínimo. O
  **primeiro** bloco sai na primeira sentença para a fala começar logo.
  Os downloads seguintes baixam **enquanto o bloco atual toca** — a pausa
  entre blocos é respiração, não travada.

### Provas por sonda (14/08/2026, ~22:04–22:08)

Sintaxe: `node --check` em `servidor.js`, `publico/voz.js`, `publico/chat.js`
(e `motor.js`, por via das dúvidas) — OK.

Servidor religado no padrão (taskkill no PID antigo → 
`start /min node --env-file-if-exists=.env servidor.js`), segue só loopback
(`127.0.0.1:7778`, novo PID via `Get-NetTCPConnection`).

```
POST /api/tts (sem chave no ambiente):
{"motivo":"sem-chave-elevenlabs","mensagem":"ELEVENLABS_API_KEY ausente no
 ambiente — grave a chave em severino/.env e reinicie o servidor"}
HTTP 503                       ← motivo NOMEADO, nunca 500 genérico

GET /api/tts:
{"disponivel":false,"motivo":"sem-chave-elevenlabs"}   HTTP 200

PUT /api/tts → 405 · GET /../motor.js (path-as-is) → 404

GET /  /voz.js  /chat.js  /estilo.css → 200 (voz.js novo, 14338B, ao vivo)
```

Regressão do chat — SSE **antes** (21:59, PID antigo) e **depois** (22:07,
PID novo) do religamento, ambos pingando incremental com ferramentas:

```
21:59:11.630 event: inicio        22:07:58.851 event: inicio
21:59:14.990 event: ferramenta    22:08:01.628 event: ferramenta
21:59:20.573 event: token         22:08:05.554 event: token
...tokens a cada ~0,5 s...        ...tokens a cada ~0,5 s...
```

(Na sonda do "depois", o Severino citou ao vivo os 3 arquivos sujos desta
própria entrega — dado que não existe em treino.)

### Prova pendente do dono — ligar a chave da ElevenLabs

O caminho feliz (áudio real) não tem como ser provado sem chave. Roteiro:

1. Criar conta em `elevenlabs.io` e gerar uma API key (perfil → API Keys).
2. Gravar em `severino/.env` (arquivo novo, já ignorado pelo git):
   `ELEVENLABS_API_KEY=...` — opcionalmente `ELEVENLABS_VOZ_ID=...` para
   trocar a voz (biblioteca em elevenlabs.io/app/voice-library).
3. Reiniciar o servidor (fechar o `node` da 7778 e rodar `npm start` no
   `severino/`, ou reabrir o workspace).
4. Abrir o atalho **"Severino"**: a linha de status deve dizer
   **"voz: ElevenLabs"**; perguntar qualquer coisa e ouvir.
5. Prova de fora (opcional): 
   `curl -s -X POST 127.0.0.1:7778/api/tts -H "content-type: application/json"
   -d '{"texto":"Oxente, agora sim."}' -o teste.mp3` → content-type
   `audio/mpeg` e bytes de áudio.

## O que NÃO existe ainda (por desenho, não por esquecimento)

- **Fase 3 (ações)**: nenhuma ferramenta de escrita ou execução — o motor
  nem as possui (`tools: []`).
- **Hotword / escuta contínua**: proibidas pelo plano; o push-to-talk é
  estrutural (`continuous: false`, gesto explícito).
- **Botão de mudo da síntese**: não pedido no contrato da fase 2; se doer no
  uso real, é uma linha de decisão no plano.
- **Teste automatizado**: o aceite segue por sondas manuais externas
  (permitidas pelos contratos das fases 1 e 2). Se/quando entrar, o LLM é
  mock — nunca a API real.

## Observações

- As pendências abertas estão TODAS na seção da fusão, acima ("Pendências
  para o integrador da raiz") — as observações antigas desta seção foram
  resolvidas ou superadas pela fusão.
- Custo observado por pergunta com ferramentas: US$ 0,19–0,37 (Sonnet 5,
  preço introdutório; a prova da fusão custou 0,3747) — dentro do risco
  assumido no plano.
