# servidor.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

**Montar ≠ escutar** (PAINEL-17, 31/10/2026). `servidor.js` só carrega o `.env`, lê `PORTA`
(padrão 7777), chama `montarPainel` com as dependências reais, liga os laços (`iniciar()`:
reconciliação de leases, migração do play, trava do agendador, vigília e zelador, alinhamento) e escuta em `127.0.0.1`. `montagem.js` é a raiz de
composição: constrói serviços, autorizadores, `RoteadorPainel` e devolve o handler `(req, res)`;
toda porta externa entra por `externos` (`executarSsh`, `leituraSsh`, `sso`, `fetchPlane`,
`consultarPlane`, `conversar`, `transcrever`, `fetchVoz`, `spawnCli`, `coletores`, `agora`,
`diretorioCodex`) e o estado por `diretorioEstado`; ausente, cai no padrão do módulo, que é a
produção. Os testes montam o mesmo painel com falsos (`test/painel-falso.js`):
`test/fronteira-http.test.js` sobe um `http.Server` de porta efêmera e faz requisição real
(guarda de Host e origem, sessão, estático), e a fronteira de `/api/contas/*` em
`test/contas.test.js` passa pelo mesmo handler. O despacho mora em `http/`: `roteador.js` depois da guarda, `rotas-painel.js` (projetos, produção, ssh, backlog, decisões, hangar, relações, contas e o redirecionamento do C-3PO, cada um no próprio arquivo), `rotas-orquestracao.js` (fila, triagem, canal, frota, handoff, gate, despacho, consumo, diário, play, zelador, jogo nativo e voz, cada um no próprio arquivo; a recusa genérica depois das rotas específicas), `rotas-voz.js`, `rotas-chaves.js`, `rotas-alinhamento.js`, `rotas-decisao.js`, `conversa.js` (SSE) e `resposta.js` (compõe `resposta-json.js`, `arquivo-publico.js` e `corpo-limitado.js`). HTTP único em `127.0.0.1:7777`: `/api/projetos`,
`GET /api/projetos/:pasta/docs` (docs modeladores + curados de UM projeto;
`?arquivo=` lê um modelador específico — página de projeto, 20/08/2026),
`GET /api/projetos/:pasta/git` (diff --stat do working tree + commits não
enviados ao remoto de UM projeto — só sob demanda, mais pesado que o
resumo que os cards já usam; 20/08/2026), `/api/producao`,
`/api/producao/ssh`, `/api/backlog`, `/api/hangar`, `/api/hangar/sessoes` e `/api/hangar/encomendas` (GET aberto; POST `{preparar,confirmar}` por SSO) (Hangar, [hangar.md](hangar.md)), `/api/decisoes` (decisões derivadas
do backlog; idade = criação do work item no Plane, ou `git log -L` no
markdown do repo congelado, pesada — sob demanda, nunca no polling de 60s;
aba Decisões, 21/08/2026), `/api/relacoes` (catálogo de
`relacoes.js` — hoje fora da nav, ver [publico.md](publico.md)), `POST /api/conversa` (SSE,
motor do C-3PO), `GET/POST /api/tts` (proxy ElevenLabs), `/api/contas/*`
(aba Contas — [contas.md](contas.md)), `/api/orquestracao*` (GET fila, `triagem-dev`,
`prontidao`, `canal?carta&projeto`, `frota`, `consumo`, `diario`, `play`, `zelador`, `nativo`; POST
`simular`, `{frota,handoff,gates,despacho,play,nativo}/{preparar,confirmar}`,
`voz/transcrever` — mecanismo em [orquestracao-v2-integracao.md](../orquestracao-v2-integracao.md); `POST /api/acoes/{preparar,confirmar}` (ação proposta pelo C-3PO, [motor.md](motor.md); `rotas-acoes.js`); `GET /api/decisao/{carta,pendentes}` e `POST /api/decisao/{,retomada/}{preparar,confirmar}` (mesa de decisão, [decisao.md](decisao.md)); `GET /api/orquestracao/voz` → `{xai}` (só a presença da chave; o C-3PO cai para este motor quando o reconhecimento do navegador não existe ou falha — `operacao.md` § Microfone);
as rotas de escrita exigem SSO do Cadastro Único e confirmação em duas ações; `test/rotas-privilegiadas.test.js`
varre toda rota (literais de `http/` e de `montagem.js`) pelo painel montado com POST, PUT, PATCH e DELETE pela borda, com um cookie que passa no portão de login e não vale na ação — 401 do autorizador da rota ou 405 no próprio handler,
sem ler corpo, tocar outra porta externa nem gravar no estado (e, sem cookie, todo caminho em todo método para no portão: invariante 1); as exceções ficam listadas rota a rota com o motivo: `/api/conversa` roda pelo login da CLI (assinatura) com
ferramentas de leitura (e, desde 31/10/2026, `propor_acao`, que só registra proposta), sem SSO por decisão do dono (29/10/2026); `/api/tts` e a transcrição pedem SSO desde a mesma data; as
escritas da aba Contas exigem SSO desde 29/10/2026; handler só-leitura responde HEAD e o 405 leva `Allow`)
e estáticos de `publico/` (dashboard na raiz, chat em `/c3po/`).
