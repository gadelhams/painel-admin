# Fatos trazidos do `01_ESTADO.md` (01/10/2026)

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Mecanismos que o estado datado de 13/09/2026 registrava e nenhum outro doc
vivo tinha; provas e evidências ficaram em
[`historico/01_ESTADO-ate-2026-10-01.md`](../historico/01_ESTADO-ate-2026-10-01.md).

- **Autenticação do motor**: o login do Claude Code já existente na máquina;
  funciona headless **sem `ANTHROPIC_API_KEY`** — nenhuma credencial criada.
- **Só-leitura estrutural** (`motor.js`; desde 31/10/2026 "lê e só propõe", [motor.md](motor.md)): `tools: []` + servidor MCP em
  processo com só as ferramentas do catálogo (catorze desde 06/11/2026) + `allowedTools` nelas +
  `permissionMode: 'dontAsk'` (o que não está pré-aprovado é negado sem prompt).
- **`.env`**: `npm start` usa `--env-file-if-exists` **e** `servidor.js` faz
  `process.loadEnvFile` defensivo — `node servidor.js` seco segue funcionando.
- **Estáticos**: `GET /c3po` → 301 `/c3po/` (assets relativos dependem
  da barra); `/severino` e `/severino/` → 301 `/c3po/` (nome antigo); `..` em path-as-is → 404; método errado em `/api/tts` → 405.
- **ElevenLabs** (`ProxyElevenLabs` em `orquestrador/voz-eleven.js`, rota em `http/rotas-voz.js`, montada em `montagem.js`): upstream
  `POST api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` (header
  `xi-api-key`), `output_format=mp3_44100_128`, modelo `eleven_v4` (o ajuste de clonagem do
  playground não existe no multilingual_v2); voice_id default `JBFqnCBsd6RMkjVDRZzb` ("George"),
  troca por `ELEVENLABS_VOZ_ID` no `.env`. O corpo manda o ajuste do playground
  (25/10): estabilidade 0.07, similaridade 0.09, clonagem 0, filtro `robot`,
  distância 0.5; idioma fica automático (sem `language_code`). Sem chave → `POST /api/tts` 503 com
  `motivo` nomeado (`sem-chave-elevenlabs`); `GET /api/tts` é sonda que não
  gasta caractere; upstream recusando → `elevenlabs-recusou` + status, genérico
  de propósito; a chave jamais aparece em log, erro ou resposta; cliente que
  some aborta o upstream (`AbortController`).
- **Cadeia de voz declarada** (`locutor.js` fala, `escuta.js` ouve, `sessao-voz.js` decide o turno; corte, eco, nome e retentativa em `politica-fala.js`): ElevenLabs →
  Antônio (voz pt-BR cujo nome contém `antonio` + `natural`; fallback = primeira
  pt-BR, e o status diz qual) → só texto. A linha `#status-voz` declara a camada
  ("voz: ElevenLabs" / "voz: Antônio — ElevenLabs sem chave" / "só texto —
  motivo"). Desde 20/08/2026 há **uma retentativa** antes de cair para o
  Antônio. Um 429 (a conta aceita 3 sínteses ao mesmo tempo) não troca a
  voz da sessão: no máximo 2 pedidos em voo, e a frase espera e tenta de
  novo. `calar()` pausa o áudio e aborta downloads em voo. Degradar
  declarando, nunca quebrar: erro vira mensagem na UI.
- **Reconhecimento**: push-to-talk (`continuous: false`, uma captura por
  clique, segundo clique cancela). Copiloto (21/08): escuta contínua com
  gatilho "C3PO" depois de 90s. Ligação (25/10): escuta contínua sem gatilho
  até desligar; falar por cima corta a síntese e, confirmada a frase, aborta
  a resposta em curso. `corrigirNomesProprios` (20/08/2026) compara o ouvido com o catálogo
  de `GET /api/projetos` por distância de edição (`SIMILARIDADE_MINIMA = 0.72`),
  avisa toda troca na conversa e ignora nomes de uma palavra.
- **Fluidez**: `limparParaFala` tira marcação só da fala; blocos de
  `MIN_BLOCO = 160` (o primeiro sai na primeira sentença); downloads seguintes
  baixam enquanto o bloco atual toca.
- **Aba Contas**: latência real por ação 1,7–3,3 s (um ssh completo) — por
  isso sem polling e botões travados durante a ação. Testes com mutações
  nomeadas (12 no backend, 4 no front), todas vermelhas — detalhe no
  `RELATORIO-F5-CONTAS.md`.
- **Custo observado** por pergunta com ferramentas (08/2026, Sonnet 5 a preço
  introdutório): US$ 0,19–0,37.
- **Botão de mudo da síntese**: não pedido no contrato da fase 2; se doer no
  uso, é uma linha de decisão no plano.
