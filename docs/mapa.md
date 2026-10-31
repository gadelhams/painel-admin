# painel-admin — mapa de módulos (gerado)

Gerado por `node scripts/mapa-modulos.mjs`; o `npm test` falha se este arquivo
estiver desatualizado. Cada linha é o cabeçalho do próprio módulo: o que faz e
o que **não** faz. Mudança simples: ache a responsabilidade aqui, abra só esse
módulo e o `test/<área>.test.js` correspondente, rode `npm test`. O porquê de
cada mecanismo está em [`arquitetura.md`](arquitetura.md); o estado, em
[`current.md`](current.md).

## raiz

- `alinhamento.js` — Porta da rotina de alinhamento. As medidas e a varredura moram em alinhamento/.
- `chaves.js` — Porta da tela Chaves. Catálogo, troca, confirmação e HTTP moram em chaves/.
- `coletores.js` — Porta única dos coletores. Rotas e ferramentas do C-3PO importam daqui.
- `contas.js` — Porta da aba Contas. A tabela, o ssh e a fronteira HTTP moram em contas/.
- `decisao.js` — Porta da mesa de decisão para quem só LÊ (o motor do C-3PO): a leitura da carta e a forma de texto dela. O escritor, a aplicação e as duas ações ficam fora daqui de propósito — só a montagem os liga.
- `decisoes-c3po.js` — Visão de decisões para o C-3PO (24/10/2026, pedido do dono): a mesma classificação da aba Decisões e do bloco "Astargne", em texto para a conversa — o que depende do dono, o que está bloqueado e por quê, o que espera terceiros.
- `encomendas.js` — Porta das encomendas de nave, só o lado de leitura. O registro e as duas ações moram em encomendas/ e só a montagem os liga.
- `guarda.js` — O painel não tem login para ler: quem alcança a porta lê tudo e gasta crédito pelo C-3PO e pela voz; mudar estado (Contas, Chaves, frota, gates…) pede a sessão SSO do dono desde 29/10/2026 para Contas, antes para o resto.
- `montagem.js` — Monta o painel inteiro (serviços, RoteadorPainel e o handler `(req, res)`) a partir do ambiente e das portas externas recebidas; não escuta porta, não lê `.env` e não liga laço nenhum até `iniciar()`.
- `motor.js` — Conversa do C-3PO. As ferramentas e a voz moram em motor/; aqui só o fluxo de eventos.
- `plane.js` — Porta do Plane. A consulta mora em plane/cliente.js; a projeção, em plane/features.js.
- `producao-extra.js` — Sondas de produção que não pertencem a um projeto do catálogo.
- `projetos.js` — Catálogo dos projetos da raiz. Metadados que não dão para derivar do disco (portas, URL de produção, onde fica o repo git) vivem aqui; o resto o servidor coleta ao vivo.
- `relacoes.js` — Relações estruturadas entre os projetos da raiz — espelho do que está em prosa em ../../RELACOES.md (era seção do CLAUDE.md da raiz até 30/09/2026).
- `servidor.js` — Servidor único do painel-admin desde a fusão de 14/08/2026: lê o ambiente, monta o painel com as dependências reais (montagem.js) e escuta em 127.0.0.1; não compõe serviço nem decide rota.

## acoes/

- `api-acoes.js` — Duas ações das propostas do C-3PO: preparar mostra projeto, pasta e comando; confirmar, com a mesma sessão SSO do dono, roda uma vez e registra no diário. Não registra proposta.
- `diario-acoes.js` — Diário de acréscimo das ações do C-3PO (proposta, preparo, confirmação, resultado). Só grava; não decide nem executa.
- `executor-acoes.js` — Roda o comando de uma ação confirmada pelo dono: uma por vez, sem shell, ambiente por lista branca, tempo e saída limitados e saída filtrada. Não confere SSO, proposta nem contrato.
- `filtro-segredo.js` — Tira segredo de texto que vai para o chat ou para o diário (saída de teste, git). Não decide o que mostrar.
- `propostas.js` — Propostas de ação do C-3PO: registra {projeto, comandoId} conferido contra o contrato e devolve um id de proposta. Nunca executa nem emite confirmação.

## alinhamento/

- `cache.js` — Cache da varredura em disco. Não decide sinal.
- `fio-medida.js` — Conta comentários desde a última marca de compactação. Não fala com o Plane.
- `fios.js` — Mede o fio de comentários de cada carta. O resultado fica no cache.
- `git-medida.js` — Um comando git com teto de tempo. Não interpreta o alinhamento.
- `medidas.js` — Porta das medidas. O fio, o git, o portão e as regras moram ao lado.
- `portao-docs.js` — Roda o check-docs do projeto e devolve a contagem de erros.
- `regras-sinal.js` — Regras que o sinal de um projeto aplica. Não varrem o disco.
- `sinais.js` — Junta os sinais de um projeto. Git, current.md e fio moram ao lado.
- `sinal-current.js` — Sinais de docs/current.md: data atrasada e carta fechada ainda citada.
- `sinal-fio.js` — Sinais do fio de comentários: longo demais, ou selado sem compactar.
- `sinal-git.js` — Sinais de git: commits sem push e atraso do remoto.
- `varredura.js` — Percorre os projetos e junta o resultado. Cache, fios e sinais moram nos módulos ao lado.

## chaves/

- `api.js` — Fronteira HTTP de /api/chaves/preparar e /api/chaves/confirmar. A sessão vem antes do corpo; o valor só viaja no confirmar.
- `catalogo.js` — O que cada projeto guarda e onde. Só nomes: o valor nunca mora aqui.
- `confirmacoes.js` — Duas ações da troca de chave: preparar guarda o pedido; confirmar grava o valor, que só entra nesta segunda ação. O esqueleto mora em orquestrador/desafio-duas-acoes.js.
- `eventos.js` — Diário das trocas. O valor de uma chave nunca entra num evento.
- `inventario-local.js` — Inventário local: nomes, modo e rotação. Não lê o servidor e não grava valor.
- `inventario-servidor.js` — Inventário do servidor: um ssh de nomes. O valor não volta.
- `inventario.js` — Junta o inventário local e o do servidor no mesmo cache de nomes.
- `servico.js` — Porta do serviço de chaves. O inventário lê; a troca grava; os dois compartilham o cache do servidor.
- `troca-local.js` — Reescreve uma linha do .env local e reinicia a unit de usuário.
- `troca-servidor.js` — Reescreve uma linha do .env no servidor pelo script fixo. O valor vai no stdin.
- `troca.js` — Escolhe o destino da troca. O valor entra uma vez e sai no arquivo; nunca no diário.

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

## contas/

- `fronteira.js` — Cliente e rotas /api/contas/*. O corpo JSON vai só pelo stdin do ssh.
- `processo-ssh.js` — Processo ssh sem shell. Não interpreta status nem redige segredo.
- `redacao.js` — Tira bearer do texto antes do log. Não fala com o servidor.
- `saida-central.js` — Lê o corpo e o status que o script remoto devolve. O stderr que pareça bearer é redigido antes do log.
- `ssh.js` — Porta do ssh das contas. O processo, a redação e a leitura da saída moram ao lado.
- `tabela.js` — Tabela fechada do Cadastro Único. Método e rota nascem aqui; o id entra só depois de validado.

## decisao/

- `api-decisao.js` — Duas ações da mesa de decisão (gravar e retomar): o esqueleto de SSO + desafio de 2 min de orquestrador/, com os campos fechados da mesa. Não lê nem grava o Plane sozinho.
- `aplicacao-decisao.js` — A ordem de escrita do confirmar e da retomada, sob a trava global da orquestração: releitura e digital, diário PENDENTE, comentário de intenção, PATCH da leitura ± delta, verificação, recibo, CONCLUÍDA. Não valida a prosa nem monta o pedido.
- `diario-decisao.js` — Diário de acréscimo da mesa de decisão (pendente, comentário gravado, concluída, abandonada) e a leitura das aplicações pendentes. Só grava e lê; não fala com o Plane.
- `efeitos.js` — Lista fechada dos efeitos da mesa contra a carta ATUAL: o pedido do dono vira um delta por nome, a impressão digital da carta, o corpo do PATCH e a verificação depois dele. Puro; não lê nem grava.
- `escritor-decisao-plane.js` — Escritor da mesa de decisão no Plane com a identidade Painel Admin: comentário da mesa e o PATCH da lista fechada. Lê a chave do arquivo a cada operação; não decide o que gravar.
- `leitor-carta.js` — Lê UMA carta do Plane sem cache, pelo caminho do projeto (carta, comentários, labels, estados e atividades), com a chave Guest. Não escreve nem decide.
- `mesa.js` — Compõe a mesa de decisão a partir do ambiente: leitor Guest, escritor Painel Admin (ou o motivo de não haver), diário, aplicação e os desafios das duas ações. Não registra rota nem autoriza.
- `permissao.js` — Quais projetos a mesa de decisão abre: os do catálogo com Plane e sigla, menos os congelados e menos o Anya (recusado pelo id do projeto, não pela sigla). Não lê o Plane.
- `protocolo-decisao.js` — Texto dos comentários da mesa no Plane — DECISAO/v1 (a decisão do dono) e DECISAO-APLICACAO/v1 (o recibo) — e a leitura deles. Não lê nem grava o Plane.
- `servico-decisao.js` — O que a mesa de decisão oferece às rotas: a carta para a gaveta, o preparar (prosa, efeitos e digital, sem escrita), as aplicações pendentes e o preparo da retomada. A escrita mora em aplicacao-decisao.js.
- `texto-html.js` — HTML do Plane ⇄ texto da mesa: escape do que vai para o comentário e texto puro do que vem da descrição e dos comentários. Puro.

## e2e/

- `esperar-modelos.mjs`
- `fixture-server.mjs` — Apenas estáticos do Painel. Não importa servidor.js, .env ou clientes reais.
- `playwright.config.mjs`
- `politica-post.mjs`
- `windows-sso-smoke.mjs` — Prova final de SSO em navegador Windows. Não salva sessão, screenshot, storageState ou trace.

## e2e/tests/

- `c3po-acoes.spec.mjs`
- `c3po-memoria.spec.mjs`
- `hangar.spec.mjs`
- `mesa-decisao.spec.mjs`
- `orquestrador.spec.mjs`

## encomendas/

- `api-encomendas.js` — Duas ações da encomenda de nave: preparar valida o pedido e devolve o resumo; confirmar, com a mesma sessão SSO do dono, grava a linha `pedida`. Não cria projeto.
- `leitura-encomendas.js` — Lê `encomendas.jsonl` e devolve as encomendas pendentes (pedida sem atendida depois), sem `usuarioId`; não grava nada.
- `pedido-encomenda.js` — Valida o pedido de nave nova (nome, sigla opcional, módulos) e devolve a forma normalizada; não lê arquivo nem grava nada.
- `registro-encomendas.js` — Registra uma encomenda de nave como linha `pedida` em `encomendas.jsonl`, serializada no processo; não cria projeto no Plane nem mexe no catálogo.

## http/

- `arquivo-publico.js` — Serve um arquivo de publico/ sem sair da pasta.
- `conversa.js` — Conversa do C-3PO em SSE. Cada evento do motor sai na hora; no fim, o par pergunta/resposta vai ao diário de conversas, se houver.
- `corpo-limitado.js` — Lê o corpo do pedido até o teto. Acima disso corta a conexão.
- `redirecionamento-c3po.js` — Leva /c3po à barra final e os endereços antigos /severino e /severino/ ao novo. Não atende a API.
- `resposta-json.js` — Escreve JSON na resposta. Não lê arquivo nem o corpo do pedido.
- `resposta.js` — Porta da resposta. JSON, arquivo estático e corpo com teto moram ao lado.
- `rotas-acoes.js` — Preparar e confirmar uma ação proposta pelo C-3PO, pelas duas ações com SSO. Não há rota para propor: isso só o motor faz.
- `rotas-alinhamento.js` — Varredura de alinhamento. `?agora=1` força uma passagem.
- `rotas-backlog.js` — Backlog lido do Plane ou do markdown.
- `rotas-chaves.js` — Inventário e troca de chaves. A recusa genérica vem depois das rotas específicas.
- `rotas-contas.js` — Repassa o Cadastro Único. Escrita só com sessão SSO; o corpo só é lido depois dela, e só quando a rota está na tabela fechada.
- `rotas-decisao.js` — Rotas da mesa de decisão: a carta da gaveta e as aplicações pendentes (GET, chave Guest), gravar e retomar (POST, SSO + duas ações). Não monta o serviço.
- `rotas-decisoes.js` — Decisões paradas do backlog.
- `rotas-encomendas.js` — Encomendas de nave do Hangar: a leitura das pendentes é aberta; registrar é preparar e confirmar, pelas duas ações com SSO. Não cria projeto.
- `rotas-hangar.js` — Naves e droids do Hangar. Só GET; o guard do roteador já rodou antes.
- `rotas-memoria.js` — Memória L1 do C-3PO: GET lê texto, versão, histórico e a pendente da reflexão; preparar e confirmar mudam pelas duas ações com SSO. Não há rota para propor: isso só o motor faz.
- `rotas-orq-canal.js` — Comentários do card. Não registra handoff.
- `rotas-orq-consumo.js` — Cotas de assinatura. Gasto de API não entra aqui.
- `rotas-orq-despacho.js` — Preparar e confirmar o despacho. Sem o portão, a API recusa antes de executar.
- `rotas-orq-diario.js` — Diário da frota: leitura só. Filtra por carta quando ela vem na URL.
- `rotas-orq-fila.js` — Fila, pré-checagem e simulação. Não marca gate nem despacha.
- `rotas-orq-frota.js` — Leitura e troca da frota. A troca passa pelas duas ações com SSO.
- `rotas-orq-gate.js` — Preparar e confirmar a marca de gate.
- `rotas-orq-handoff.js` — Preparar e confirmar o handoff. Não lista o canal.
- `rotas-orq-nativo.js` — Estado e alternância da liberação do jogo nativo. A leitura é aberta: é ela que o pré-flight nativo consulta.
- `rotas-orq-play.js` — Estado e alternância do play por nave. A leitura é aberta e não diz quem ligou.
- `rotas-orq-triagem.js` — Triagem das folhas sem gate. Não altera etiqueta.
- `rotas-orq-voz.js` — Presença da chave e a transcrição. A síntese mora em rotas-voz.js.
- `rotas-orq-zelador.js` — Estado do zelador do Hangar: job em curso, o diário estruturado e o fim do último job por projeto. Só leitura.
- `rotas-orquestracao.js` — Escolhe a família de /api/orquestracao. A recusa genérica vem depois das rotas específicas.
- `rotas-painel.js` — Escolhe a família da rota. Cada família mora no arquivo ao lado.
- `rotas-producao.js` — Sondas HTTPS da produção.
- `rotas-projetos.js` — Estado local, documentos e git de um projeto.
- `rotas-relacoes.js` — Catálogo estático de relações entre projetos.
- `rotas-sessao.js` — De quem é a sessão SSO deste navegador. Só GET; não autoriza nada.
- `rotas-ssh.js` — Consulta SSH só de leitura da produção.
- `rotas-voz.js` — ElevenLabs, diagnóstico do navegador e presença da transcrição.
- `roteador.js` — Despacha o pedido depois da guarda. Cada grupo devolve false quando a rota não é dele.

## memoria/

- `api-memoria.js` — Duas ações da memória L1: preparar mostra o diff contra a versão-base; confirmar, com a mesma sessão SSO do dono, grava uma vez. Também monta a leitura da tela. Não registra proposta.
- `arquivo-memoria.js` — Leitura da memória L1 do C-3PO (`c3po/MEMORIES.md`) e do seu histórico de versões. Não grava: escrever é de escritor-memoria.js, fora do alcance do motor.
- `conversas.js` — Diário mínimo das conversas do C-3PO (`c3po/conversas.jsonl`): pergunta e resposta truncadas e filtradas de segredo, retidas 14 dias. É o insumo da reflexão noturna; não decide nada.
- `diff.js` — Diff unificado curto, linha a linha, entre duas versões da memória L1, com a conta do que foi apagado. Não lê nem grava arquivo.
- `escritor-memoria.js` — Única escrita da memória L1: confere a base sob trava, registra a versão no histórico e troca o arquivo de uma vez. Não confere SSO nem decide se a mudança é boa.
- `pendente-memoria.js` — Proposta pendente da reflexão noturna (`c3po/memoria-pendente.json`): a versão que a reflexão não aplicou sozinha por apagar demais. Não grava a memória; o dono aceita pelo SSO.
- `propostas-memoria.js` — Propostas de memória do C-3PO: monta a L1 nova (acrescentar ao fim ou trocar um trecho exato) contra a versão atual e guarda em memória com prazo. Nunca grava a memória.
- `reflexao.js` — Reflexão noturna do C-3PO (PAINEL-9): junta as conversas do dia, pede ao Claude da assinatura a memória L1 nova e só a aplica se passar nos critérios; senão vira proposta pendente ou recusa. Uma por data, tudo no diário.

## motor/

- `acao-proposta.js` — A ferramenta propor_acao e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não executa.
- `doc-projeto.js` — Lê ou lista um .md dentro da pasta do projeto. Não registra a ferramenta.
- `envelope-coletor.js` — Embrulha a falha de um coletor interno. Não escolhe a ferramenta.
- `ferramentas.js` — Catálogo das ferramentas do C-3PO: onze de leitura, uma que só propõe ação e uma que só propõe mudança na memória. O portão é esta lista, não o texto da persona.
- `leitura-pesada.js` — Leituras que varrem o Plane inteiro (fila, triagem, decisões: 15–35 s cada) para as ferramentas do C-3PO.
- `memoria-l1.js` — Bloco da memória L1 no prompt de sistema do C-3PO: o arquivo entra como DADO delimitado, com o aviso de que é editável pelo dono. Não lê disco nem grava.
- `memoria-proposta.js` — A ferramenta propor_memoria e a leitura do seu resultado no fluxo da conversa. Só propõe: não prepara, não confirma, não grava a memória.
- `persona.js` — Voz do C-3PO. Não é portão: a permissão mora em tools: [] e na lista de ferramentas.

## orquestrador/

- `agendador-instancia.js` — Trava de instância do agendador (vigília e zelador): só o processo com ORQ_AGENDADOR=true e o pid gravado em disco agenda. Não varre nem despacha.
- `ambiente-cli.js` — Ambiente dos filhos da CLI: lista branca, sem chave do painel.
- `api-despacho.js` — Duas ações do despacho: preparar valida e guarda o desafio com a versão da frota; confirmar inicia a tentativa real. A sessão que preparou é a que confirma; sem fallback de modelo.
- `api-duas-acoes.js` — Fronteira HTTP das duas ações: sessão antes do corpo, campos fechados, falha upstream sem eco. Não guarda desafio.
- `api-frota.js` — Duas ações da frota: preparar valida contra o catálogo e guarda a versão-base; confirmar grava se a frota não mudou. A sessão que preparou é a que confirma.
- `api-gate.js` — Duas ações do gate: preparar guarda a proposta; confirmar marca a etiqueta. A sessão que preparou é a que confirma; a marca não inicia execução.
- `api-handoff.js` — Duas ações do handoff: preparar guarda a entrada; confirmar grava o comentário. A sessão que preparou é a que confirma; texto não autoriza execução.
- `api-nativo.js` — Duas ações da liberação do jogo nativo: preparar valida projeto e prazo; confirmar liga (com prazo) ou desliga. A mesma fronteira do play.
- `api-play.js` — Duas ações do play por nave: preparar valida projeto e direção; confirmar liga ou desliga, sob a trava. A mesma fronteira do "Steam livre".
- `argumentos-cli.js` — Argumentos fixos de cada CLI. O lançamento mora em papel-cli.js.
- `arquivo-lease.js` — Um arquivo de lease por carta. Não escreve o diário.
- `autorizador.js` — Autoriza uma ação privilegiada: origem, cookie, sessão e dono. Sem cache.
- `briefing-papel.js` — O texto que cada papel recebe: carta, contrato e o molde do briefing.
- `canal-carta.js` — Leitura do card: interações, handoffs e gates. Não grava perfil nem muda estado.
- `canal-plane.js` — Lê os comentários do card. A forma de cada um mora em interacao-canal.js.
- `carta-da-fila.js` — Julga uma carta já carregada: lease, proveniência do gate e a pré-checagem pedida.
- `checagem-despacho.js` — Checagem do despacho real. A prévia sem lease mora em simulacao-despacho.js; a tentativa, em tentativa-despacho.js.
- `classificar-prontidao-dev.js` — Classifica impedimentos verificáveis de uma carta sem gate.
- `consulta-c3po.js` — Projeção limitada e só-leitura da fila/triagem para a conversa do C-3PO.
- `consulta-perfil.js` — O perfil antigo da carta, só para exibir "perfil antigo ignorado (era X; roda a frota vN)". Não entra no despacho.
- `consulta-zelador.js` — Leitura do diário do zelador para o C-3PO: os três últimos dias, só campos estruturados, filtráveis por projeto. Porta só-leitura: não alcança escritor nem CLI.
- `consumo.js` — Apenas cota incluída na ASSINATURA. Nunca converter gasto/crédito de API em percentual do plano, nem aceitar uma amostra antiga como consumo atual.
- `contrato-local.js` — Contrato local `.orquestrador.json` de um projeto do catálogo.
- `contrato-politica.js` — Gramática do contrato opt-in: o que o projeto permite executar.
- `dependencias-carta.js` — Junta a relação formal do Plane com o que a carta declara no texto.
- `dependencias-worktree.js` — Instalação do worktree quando há lock e faltam os módulos. Sem scripts de pacote.
- `desafio-duas-acoes.js` — Esqueleto das duas ações privilegiadas: preparar guarda um desafio, confirmar o executa uma vez. Não sabe o que valida nem o que grava.
- `despacho-servico.js` — Junta a checagem e a tentativa real. A prévia sem lease mora em simulacao-despacho.js.
- `diario-frota.js` — Diário da frota: projeção só-leitura dos livros que já existem (touchpoints do despacho, diários da vigília e, desde a F3, os três últimos dias do diário do zelador).
- `diario-touchpoints.js` — Diário JSONL dos touchpoints. Não cria nem apaga lease.
- `erro-acesso.js` — Erro das ações privilegiadas. Não decide quem entra.
- `escritor-gate-plane.js` — Grava a etiqueta depois do comentário. O texto GATE/v1 mora em protocolo-gate.js.
- `escritor-handoff-plane.js` — Grava o comentário de handoff. O texto HANDOFF/v1 mora em protocolo-handoff.js.
- `escritor-zelador-plane.js` — Escritor estreito do zelador no Plane: comentário com prefixo fixo e a lista fechada (estado Done/Cancelled, descrição, etiquetas de trava), com a chave lida de arquivo 600 a cada operação. Não decide veredito.
- `estado-carta.js` — Troca o grupo de estado de uma carta. Não escolhe modelo nem registra perfil.
- `estado-plane.js` — Mudança de estado do card pela vigília: Todo → In Progress ao começar a codar e In Progress → Done quando a tentativa de teste é aprovada.
- `estado.js` — Recupera lease e diário depois de uma queda. Cada formato mora no módulo ao lado.
- `executor-cli.js` — Sequência da tentativa: isola, instala, pede os três papéis, roda o aceite e fecha o veredito.
- `fila-leitura.js` — Junta as cartas do Plane com o contrato local. O julgamento mora em carta-da-fila.js.
- `fila.js` — Porta da fila. A leitura, o despacho, o gate, o handoff, o perfil e o estado em disco moram nos módulos ao lado.
- `fonte-consumo-claude.js` — Cota da assinatura do Claude, de duas fontes locais: o arquivo que a statusLine grava (~/.claude/statusline-astargne.mjs, documentada) e o cache de uso que o próprio Claude Code guarda em ~/.claude.json, que a extensão do VS Code também atualiza; por janela, vale a mais nova.
- `fonte-consumo-codex.js` — Cota da assinatura do Codex. O CLI grava `rate_limits` (percentual usado, janela e quando zera) em cada evento token_count da sessão; a amostra é a da sessão mais recente.
- `frota-catalogo.js` — Catálogo fechado da frota (provedor → modelo → esforços) e os validadores dos dois blocos. Não lê nem grava arquivo.
- `frota-pausas.js` — Pausas da frota: por provedor (limite de uso, com prazo) e da versão inteira (CLI ou modelo impedido). Não despacha.
- `frota-servico.js` — Leitura e troca da frota pelo serviço. A gravação mora em frota.js; as duas ações, em api-frota.js.
- `frota.js` — Frota: a configuração geral de modelos por papel, num arquivo só, gravado por SSO + duas ações. Não despacha nem escolhe carta.
- `gate-plane.js` — Entrada do gate no card. O texto mora em protocolo-gate.js e a escrita em escritor-gate-plane.js.
- `gate-servico.js` — Junta a pré-checagem e a marcação do gate. A etiqueta não inicia execução.
- `gramatica-cli.js` — Gramática estática do scripts.test e dos scripts do contrato. Não prova que o conteúdo é seguro.
- `handoff-plane.js` — Entrada do handoff no card. O texto mora em protocolo-handoff.js e a escrita em escritor-handoff-plane.js.
- `handoff-servico.js` — Handoff no card. Texto e voz não autorizam execução.
- `interacao-canal.js` — Forma de um comentário do card: texto visível e o cabeçalho ORQ/v1.
- `isolamento-git.js` — Worktree e commit do ramo orq/. A árvore principal do projeto não é tocada.
- `leitor-jsonl.js` — Leitura e acréscimo de um diário JSONL. A última linha sem quebra pode ser escrita interrompida: fica de fora e é sinalizada.
- `liberacao-nativa.js` — Liberação do jogo nativo por projeto: o dono liga na nave do Hangar quando a Steam está livre. Não abre jogo nenhum.
- `marcas-carta.js` — Marcas da carta que os dois julgamentos leem. Não decide gate nem despacho.
- `modelos.js` — Plano de execução a partir da frota congelada e as flags de modelo/esforço de cada CLI. Sem fallback.
- `origem-privilegiada.js` — Recusa POST privilegiado que não venha da própria borda. Não olha o cookie.
- `papel-cli.js` — Lança um papel de IA. Os argumentos moram em argumentos-cli.js; o retrato, em retrato-cli.js.
- `passo-vigilia.js` — Um projeto ligado: escolhe a carta, despacha com a frota e avança o gate.
- `play.js` — Play por nave: o dono libera a frota para um projeto (zeladoria hoje, despacho pela vigília); presença em play.json = ligado. Não varre nem despacha.
- `politica.js` — Porta da política da orquestração. Contrato, vigília e prontidão moram nos módulos ao lado.
- `preavaliacao-gate.js` — Pré-checagem só-leitura do gate. A marcação mora em registro-gate.js.
- `processo-cli.js` — Um processo filho: sem shell, grupo morto no tempo, saída capada e log em disco.
- `prontidao-despacho.js` — Pode despachar esta carta. Marcar gate continua em prontidao-gate.js.
- `prontidao-gate.js` — Pode marcar este gate. Não autoriza despacho.
- `prontidao.js` — Os dois julgamentos da carta. Quem importa daqui recebe as mesmas funções.
- `protocolo-gate.js` — Texto GATE/v1: valida a proposta, codifica o comentário e lê a evidência.
- `protocolo-handoff.js` — Texto HANDOFF: valida a entrada, codifica o comentário (v2) e lê o card (v1 legado e v2).
- `protocolo-perfil.js` — Leitura do texto PERFIL-IA/v1 legado. Não grava: desde a F2 da frota (29/10/2026) o perfil por carta não vincula nada.
- `registro-gate.js` — Marcação do gate no card. A pré-checagem só-leitura mora em preavaliacao-gate.js.
- `relacoes-formais.js` — Relações formais do Plane: blocked_by, start_after e finish_after. Não lê o texto da carta.
- `resumo-carta.js` — Resumo da carta para a aba: o estado que a descrição declara (compactação do fio, PADROES-BACKLOG.md), o último handoff e gate, e o tamanho do fio.
- `resumo-fila.js` — Conta cartas por projeto e fecha o envelope da fila. Não julga a carta.
- `retrato-cli.js` — Retrato do que a CLI devolveu e a causa de uma falha (carta, cli ou limite). Os argumentos moram em argumentos-cli.js.
- `servico-orquestracao.js` — Liga leitura, despacho, gate, handoff e frota. A porta pública continua o objeto de funções.
- `sessao-cookie.js` — Lê o cookie astargne_session. Não verifica a sessão no Cadastro Único.
- `sessao-painel.js` — De quem é a sessão do Cadastro Único neste navegador, para o cabeçalho do painel. Não autoriza nada.
- `simulacao-despacho.js` — Prévia do despacho com a frota atual. Não reserva lease, não abre processo e não escreve no Plane.
- `sso.js` — Porta das ações privilegiadas. A leitura do Painel não usa esta sessão.
- `tentativa-despacho.js` — Tentativa real: lease, handoff e executor. A checagem mora em checagem-despacho.js.
- `texto-dependencia.js` — Declarações de dependência no texto da carta. Não olha a relação formal do Plane.
- `trava.js` — Trava de diretório da orquestração. Quem espera desiste em 60 s; trava de processo morto é recuperada.
- `triagem.js` — Uma varredura por vez. A classificação mora em classificar-prontidao-dev.js.
- `uuid.js` — Forma de um UUID v4 do Plane ou do próprio painel. Não valida se o id existe.
- `varredura-triagem.js` — Lê as folhas sem gate e devolve a triagem. Não grava etiqueta.
- `verificador-cadastro.js` — Pergunta ao Cadastro Único se o token ainda vale. O cookie só viaja no stdin.
- `vigilia-diario.js` — Diário da vigília: eventos em disco por projeto (`vigilia/<id>.jsonl`). Não escolhe carta nem despacha.
- `vigilia-politica.js` — Freios da vigília declarados no contrato. Não varre nem despacha.
- `vigilia-varredura.js` — Percorre os projetos com play ligado. O passo de uma carta mora em passo-vigilia.js.
- `vigilia.js` — Vigília: com o play do projeto ligado, varre a fila e despacha a carta elegível.
- `voz-eleven.js` — Proxy da ElevenLabs. A chave fica no processo; o navegador manda texto e recebe áudio.
- `voz-xai.js` — Áudio temporário, sem persistência e sem token no browser. A transcrição é texto para consulta/proposta; nunca converte fala em escrita ou despacho.
- `zelador-agendador.js` — Agendador do zelador: a cada N minutos escolhe o projeto com play que espera há mais tempo, confere frota, pausas, teto, consumo e ocupação, toma os leases e roda UM job. Não decide veredito.
- `zelador-aplicacao.js` — A sequência de escrita de UM veredito do zelador e a reconciliação do que ficou pela metade: PENDENTE → intenção → mudança sob a trava → verificação → recibo → APLICADO. Não chama a CLI.
- `zelador-cli.js` — A CLI do zelador: a tupla do bloco zelador da frota, num diretório vazio novo, sem ferramentas nem persistência de sessão, com o retrato pela stdin e a resposta em JSON. Não valida veredito.
- `zelador-diario.js` — Diário do zelador: um arquivo de acréscimo por dia (`zelador/zelador-AAAA-MM-DD.jsonl`) e o índice de pendentes fora da rotação. Só campos estruturados; não escreve no Plane.
- `zelador-fim.js` — Fim do job do zelador: o que sobrou no projeto, do Plane atual e sem cache, por uma tabela fechada de quem destrava cada etiqueta. Não escreve.
- `zelador-git.js` — Git só-leitura do zelador: o retrato do repositório e a conferência das evidências (commit no ramo principal, arquivo rastreado). Sem shell, sem trava do git.
- `zelador-job.js` — Um job do zelador num projeto: reconcilia o PENDENTE dele, monta o retrato, roda a CLI fora da trava, valida e aplica veredito por veredito, e fecha com o "nada fazível". O lease e a vez moram no agendador.
- `zelador-lease.js` — Leases do zelador em disco: um global (um job por vez no Hangar) e um por projeto, com jobId e prazo. Toda operação sob a trava global; não chama CLI nem Plane.
- `zelador-politica.js` — Regras do zelador sobre uma carta: o que ele não toca, a digital, o "não desfazer ato humano" (J57) e a prontidão que nenhuma escrita pode mudar (J58). Funções puras: não lê disco nem Plane.
- `zelador-retrato.js` — Retrato só-leitura de um projeto para o zelador: cartas, comentários, atividades e relações pela chave Guest (sem cache, pelo caminho do projeto) e o git. Não escreve nada.
- `zelador-veredito.js` — Do JSON da CLI do zelador à mudança estruturada: forma fechada, evidências conferidas pelo painel, prosa filtrada e o HTML montado aqui. Não escreve no Plane.
- `zelador.js` — Composição do zelador do Hangar: diário, leases, git, retrato, CLI, escritor e agendador ligados num objeto. Não implementa regra nenhuma.

## plane/

- `cliente.js` — Cliente e cache do Plane. A chave vai no cabeçalho e nunca volta na mensagem de erro.
- `features.js` — Projeção pura do workspace do Plane para a forma do backlog.

## publico/

- `app.js` — Tema e o relógio discreto da sincronia. O resto do painel mora nos módulos ao lado.
- `backlog-nodo.js` — Árvore do backlog: placar, tag e o nó. A aba só escolhe o projeto e o filtro.
- `backlog.js` — Backlog — o markdown de cada projeto é a VERDADE; toda tela aqui é projeção.
- `carga.js` — Busca as quatro fontes e só então redesenha. O intervalo mora em projeto.js.
- `chaves-desenho.js` — Lista da aba Chaves. A linha mora em chaves-linha.js e o formulário em chaves-troca-form.js.
- `chaves-linha.js` — Uma linha de segredo catalogado. O formulário da troca mora em chaves-troca-form.js.
- `chaves-pedido.js` — Pedido da aba Chaves. O valor só sai no confirmar e não fica neste módulo.
- `chaves-troca-form.js` — Prepara e confirma a troca de um nome. O valor fica no campo e sai ao enviar.
- `chaves.js` — Aba Chaves: o estado da tela. O pedido mora em chaves-pedido.js e o desenho em chaves-desenho.js.
- `console-c3po.js` — Carta da orquestração: preenche a entrada e não envia.
- `console-decisao.js` — Abre uma decisão parada e manda o contexto. Não conta o digest do dia.
- `console-digest.js` — Digest do dia. Sai uma vez por data local e não abre carta nem decisão.
- `console-palco.js` — Onde o console senta: no palco ou por cima da aba. Não manda mensagem.
- `contas-convite.js` — Convite pendente, formulário de convite e o resultado com o link.
- `contas-desenho.js` — Compõe o desenho da aba Contas. A aba chama estes nomes.
- `contas-pecas.js` — Peças comuns da aba Contas: data, app, papel, botão e seção.
- `contas-pedido.js` — Pedido da aba Contas. Uma chamada por ação; o valor nunca fica aqui.
- `contas-usuario.js` — Linha de usuário e o editor de permissões. Não cria convite.
- `contas.js` — Estado da aba Contas. O pedido mora em contas-pedido.js; o desenho, em contas-desenho.js.
- `decisoes-astargne.js` — Bloco Astargne da aba Decisões. Classifica o que depende do dono; não desenha o resto da aba.
- `decisoes-grupo.js` — Agrupamento das decisões paradas. A página só escolhe o que mostrar.
- `decisoes-linha.js` — Uma linha da aba Decisões. O clique abre o console; o link do card e o botão da mesa de decisão não abrem junto.
- `decisoes.js` — Aba Decisões: o que está visível, os três grupos maiores e o resto colapsado.
- `docs-desenho.js` — Desenho da aba Docs: rótulos, links e a lista de sinais.
- `docs.js` — Aba Docs: lê a última varredura. O desenho mora em docs-desenho.js.
- `dom.js` — DOM e markdown do painel. Texto de dado vira elemento; nunca innerHTML.
- `estado-painel.js` — Estado compartilhado das abas. Projetos e Backlog leem o mesmo projeto em foco.
- `grafo.js` — Aba Grafo — relações entre projetos, desenhadas via Mermaid (já vendorizado para os diagramas dos docs de projeto) em vez de SVG à mão: zero precedente de desenho manual no projeto, e o tamanho do catálogo (~10 nós) é exatamente o que o layout automático do Mermaid resolve bem.
- `idade-curta.js` — Idade curta de uma data. Não desenha seção.
- `mesa-conversa.js` — Conversa da mesa de decisão com o C-3PO: uma sessão por carta (volta onde parou), a abertura em que ele diz a pergunta e o que a carta trava, e o pedido de rascunho. Não grava nada no Plane.
- `mesa-decisao.js` — Gaveta da mesa de decisão (PAINEL-53): a carta inteira à esquerda, o C-3PO à direita e o registro de decisão, que grava no Plane só por SSO + duas ações. Abre do Hangar ([data-mesa]) e da aba Decisões.
- `nomes-curtos.js` — Nome curto da tira e dos bloqueios.
- `orquestrador.js` — Liga as vistas da aba. Cada assunto mora no próprio arquivo.
- `palco-bloqueios.js` — Os cinco bloqueios mais antigos do palco.
- `placar-cabecalho.js` — Número de decisões no cabeçalho e no selo.
- `projeto-secoes.js` — Compõe as seções do projeto. Cada bloco mora no arquivo ao lado.
- `projeto.js` — Estado do painel de projeto. As seções moram em projeto-secoes.js.
- `roteador-painel.js` — Hash é a fonte da view. Hangar (a entrada desde 28/10/2026), contas, chaves, docs e orquestração só buscam ao entrar.
- `secao-arquitetura.js` — Moldura de arquitetura e a lista de documentos modeladores.
- `secao-cabecalho.js` — Cabeçalho do projeto e os chips de etiqueta. Não desenha o outline.
- `secao-decisoes.js` — Decisões paradas do projeto aberto. Abrir uma delas continua no console.
- `secao-fila.js` — O lugar da fila de jobs. O painel ainda não tem esse sistema.
- `secao-outline.js` — Outline do backlog do projeto aberto. Não desenha o cabeçalho.
- `secao-producao.js` — Sondas de produção e a consulta SSH sob demanda. Não abre o console.
- `sessao-sso.js` — Selo do cabeçalho: de quem é a sessão do Cadastro Único neste navegador. Só lê /api/sessao.
- `telemetria.js` — Junta a tira de projetos e os bloqueios do palco.
- `tira-telemetria.js` — Uma célula da tira de projetos.

## publico/c3po/

- `acao-proposta.js` — Cartão "Ação proposta" do chat do C-3PO: Preparar mostra o comando exato, Confirmar roda com a sessão do dono e mostra o resultado. Não propõe nem decide.
- `chat.js` — Liga o palco, o fluxo e os modos de voz. O console chama mandarMensagemC3po.
- `escuta.js` — Microfone do C-3PO. Dois motores: Web Speech e gravação + transcrição xAI.
- `fluxo-sse.js` — Fluxo da conversa: lê o SSE e manda o turno. A voz e o microfone ficam fora.
- `locutor.js` — Alto-falante do C-3PO: ElevenLabs, e o Antônio quando ela cai.
- `memoria-painel.js` — Painel "Memória do C-3PO" do /c3po/: mostra a L1, edita (preparar → confirmar com SSO), lista o histórico com desfazer e a proposta pendente da reflexão. Não grava nada sem a confirmação.
- `memoria-proposta.js` — Cartão "Memória proposta" do chat do C-3PO e o passo comum preparar → confirmar da memória L1. Não propõe nem grava sozinho: confirmar pede a sessão do dono.
- `modos-voz.js` — Microfone do C-3PO: push-to-talk, copiloto e ligação. Quem manda o texto é a conversa.
- `palco.js` — Palco do C-3PO: o histórico e o texto do console. Não decide turno nem fala.
- `politica-fala.js` — Política pura da voz do C-3PO. Sem DOM, sem fetch, sem chave.
- `sessao-voz.js` — Quem decide se a frase ouvida vira turno. Sem microfone, sem alto-falante, sem rede.
- `voz.js` — Fachada. Escuta, locutor e a política moram nos arquivos vizinhos.

## publico/hangar/

- `cena.js` — Cena 3D do Hangar (Three.js r128 vendorizado + bloom): monta as estruturas, reconstrói o que os dados mudam e desenha cada quadro. Não decide nada.
- `conteudo.js` — O que o C-3PO diz e mostra no popup de cada estrutura do Hangar. Só monta HTML (com escape); não abre nem posiciona o popup.
- `conversa.js` — Conversa com o C-3PO dentro do popup do Hangar: a pergunta vai a /api/conversa com o contexto do objeto clicado e a resposta chega em SSE.
- `dados.js` — Busca naves (/api/hangar), droids (/api/hangar/sessoes e o job do zelador), sondas (/api/producao), a frota, o play e as encomendas pendentes (/api/hangar/encomendas) e os aplica ao estado da cena sem perder a animação. Só GET.
- `encomenda.js` — Berço de encomendas: monta o popup, lê as pendentes (GET aberto) e registra o pedido por SSO + duas ações (preparar mostra o resumo, confirmar grava). Não cria projeto nem fala com o Plane.
- `estado.js` — Mapa do estaleiro (posições fixas) e o estado vivo compartilhado entre os módulos do Hangar. Não busca dados nem desenha.
- `formas.js` — Formas das peças da nave (polígonos vistos de cima, nariz para +x) e a escolha da forma de cada módulo. Não desenha.
- `hangar.js` — Entrada do Hangar: liga dados, simulação, cena e interface, e pausa tudo quando a aba sai de vista. O roteador chama window.hangar.entrar/sair.
- `interface.js` — Popup do C-3PO ancorado na cena, painéis laterais (droids, projetos, Oficina) e os botões do Hangar. Não mexe em dados do servidor.
- `narrador.js` — Narrador do Hangar: fila de falas prontas do C-3PO, balão digitado e diário. Não chama LLM; conversa de verdade é em /c3po/.
- `nativo.js` — Interruptor "Steam livre" no popup da nave que tem jogo nativo. Marcar ou desmarcar só prepara; a gravação é a segunda ação, com a sessão do Cadastro Único, como o play da nave.
- `play.js` — Botão play no popup da nave: liga ou desliga a frota naquele projeto (zelador e vigília). Marcar ou desmarcar só prepara; gravar é a segunda ação, com a sessão do Cadastro Único, como o "Steam livre".
- `rotulos.js` — Rótulos HTML sobre a cena (docas, vagas, droids, bancadas, Oficina), projetados do 3D para a tela a cada quadro. Não monta o popup.
- `simulacao.js` — Movimento do Hangar: sessões reais viram droids, cada ação nova vira uma ida (bancada, nave ou Oficina), naves vão e voltam das docas. Não busca nem desenha.
- `util.js` — Utilidades do Hangar: curvas de movimento, sorteio com semente, escape de HTML e atalhos de DOM. Sem estado.

## publico/orquestracao/

- `consumo.js` — Medidores de consumo. Sem fonte verificável, mostra o motivo e nenhum percentual inventado.
- `conversa-canal.js` — Resumo da carta: o estado que a descrição declara, o último handoff e gate e o tamanho do fio.
- `conversa-handoff.js` — Prepara e confirma o handoff. Não lista os comentários.
- `conversa.js` — Liga a leitura do card ao handoff em duas ações. Não grava sozinho.
- `demanda-carta.js` — Elegibilidade e dependências da carta selecionada. Não lista a fila.
- `demanda-historico.js` — Diário da frota: o que cada droid fez, em que carta e com que resultado. Com uma carta escolhida, mostra o lease dela e filtra o diário; sem carta, mostra o diário inteiro.
- `demanda-portao.js` — Portão de execução da carta selecionada. Preparar continua em despacho.js.
- `demanda-prontidao.js` — Pré-checagem de gate da carta selecionada. Não marca o gate.
- `despacho.js` — Preparar e confirmar o despacho. A segunda ação é explícita.
- `fila-filtro.js` — Quais cartas passam no filtro da tela. Não desenha a lista.
- `fila-lista.js` — Desenha o seletor de projetos e os botões das cartas. Não busca a fila.
- `fila-triagem.js` — Classifica as folhas sem gate. Não altera etiqueta e não desenha a carta.
- `fila.js` — Carrega a fila e abre a carta. O filtro, a lista e a triagem moram ao lado.
- `frota-confirmacao.js` — Preparar e confirmar a troca da frota. A segunda ação é explícita; não desenha os seletores.
- `frota.js` — Sub-aba Frota: mostra a configuração geral (estado, versão, os quatro papéis) e o editor dos dois blocos. Nada por carta; a gravação mora em frota-confirmacao.js.
- `gate.js` — Preparar e confirmar a etiqueta de gate. Não inicia execução.
- `modelos-seletores.js` — Desenha os seletores provedor → modelo → esforço de cada papel. Não valida nem grava a frota.
- `nucleo.js` — Estado e HTTP da aba Orquestração. Não desenha tela e não decide portão.
- `voz-carta.js` — Gravação da carta: só propõe texto. Não grava no Plane e não executa.

## scripts/

- `check-docs.mjs` — check-docs v1.5 (02/10/2026; v1 de 30/09) — portão de documentação do padrão de contexto por tarefa (~/Work/PADROES-CONTEXTO.md).
- `mapa-modulos.mjs` — Gera docs/mapa.md a partir do cabeçalho de cada módulo e avisa módulo grande. Não edita módulo nenhum.
- `reflexao-noturna.mjs` — Entrada do timer `painel-reflexao.timer` (03:30): liga a reflexão noturna do C-3PO à frota real e ao diretório de estado do painel, e sai 0 em todo resultado previsto. Não decide nada.

## test/

- `acoes.test.js` — Fase 3 do C-3PO (PAINEL-2, -3, -4): leituras novas do motor e ações com portão. Nada de ssh real, LLM, Plane ou CLI paga: o ssh é um executor falso; os comandos são `node scripts/*.mjs` num projeto temporário.
- `alinhamento.test.js` — Rotina de alinhamento com Plane, git e portão de docs FALSOS. Nada toca a rede nem repositórios reais.
- `briefings.test.js` — Piloto PAINEL-34 (31/10/2026): o briefing dizia que os únicos comandos eram os do contrato e "não rode comando".
- `caminhos.test.js`
- `chaves.test.js` — Tela Chaves: só nomes saem; valor só entra pela confirmação; escrita local atômica 0600; servidor por ssh falso com valor no stdin; portão SSO.
- `consulta-c3po.test.js`
- `contas.test.js` — Testes do módulo contas.js (aba Contas). Nunca chamam ssh: o executor é injetado (I5) e captura args + stdin, devolvendo saída pré-gravada no formato que o script remoto produz (corpo JSON, "\n", status HTTP).
- `correcoes-auditoria.test.js` — Correções da auditoria de 23-24/10/2026: cada teste pina um mecanismo que a auditoria mostrou furado (mutação nomeada no título do caso).
- `css-partes.test.js` — CSS partido por aba (PAINEL-51): todo .css de publico/ é carregado, todo <link> existe, toda classe do HTML tem dono e tokens só em tokens.css. Não confere cascata nem visual.
- `decisao.test.js` — Mesa de decisão (PAINEL-53): protocolo DECISAO/v1, lista fechada de efeitos, escritor Painel Admin e a ordem de escrita do confirmar e da retomada.
- `decisoes-c3po.test.js`
- `despacho-controlado.test.js`
- `diario-resumo.test.js`
- `encomendas.test.js` — Encomenda de nave como pedido registrado (PAINEL-50): validação, colisão de sigla, SSO + duas ações pelo painel MONTADO (HTTP real, porta efêmera) e o diário só de acréscimo.
- `executor-cli.test.js` — Executor real com CLIs falsas: flags exatas, ambiente limpo, isolamento por worktree, timeout que mata o processo, e os três desfechos.
- `fluxo-sse.test.js`
- `fronteira-http.test.js` — Fronteira HTTP do painel MONTADO (PAINEL-17): o handler de produção de montagem.js atrás de um http.Server de verdade numa porta efêmera, atacado por requisição real.
- `fronteiras-modulos.test.js` — Portão das fronteiras entre áreas (padroes/modulos.md, regra 14; PAINEL-55): lê os `import` de todo módulo fora de test/ e e2e/ e recusa os que pulam a porta de outra área.
- `frota.test.js` — Frota (F2, 29/10/2026): catálogo fechado, dois blocos, estado explícito na leitura, troca por duas ações com versão-base e histórico só de acréscimo.
- `gate-plane.test.js`
- `guarda.test.js`
- `handoff-plane.test.js`
- `hangar.test.js` — Hangar: sessões vivas (/proc e transcripts falsos em pasta temporária) e naves sobre backlog falso. Nada real é lido.
- `identidades-projeto.test.js`
- `leitura-pesada.test.js` — Leituras pesadas do C-3PO: uma de cada vez, a mesma em curso é compartilhada, vale 2 min e falha não fica guardada.
- `liberacao-nativa.test.js` — Liberação do jogo nativo (PAINEL-59): prazo que vence sozinho, só projetos com jogo nativo no catálogo, arquivo estranho conta como desligado e a troca só por duas ações.
- `mapa-modulos.test.js` — Autoteste do portão do mapa (padroes/testes.md, regra 4): a ferramenta tem de morder. Cada caso monta uma árvore temporária e confere o que reprova e o que só avisa, pela função e pela CLI.
- `memoria.test.js` — Memória L1 do C-3PO (PAINEL-8): teto, histórico e desfazer, base mudou → recusa, injeção como dado, propor_memoria que não grava, rotas com SSO e o diário de conversas.
- `motor-ambiente.test.js` — Prova que o processo do modelo do C-3PO não recebe segredo do .env nem config do disco (PAINEL-52).
- `orquestrador-core-v2.test.js`
- `orquestrador-sso.test.js`
- `orquestrador-ui.test.js`
- `orquestrador-v2.test.js`
- `painel-falso.js` — Monta o painel REAL (montagem.js) com falsos em toda porta externa e um diretório de estado temporário; não sobe processo nem toca ssh, Plane, LLM, voz ou CLI de verdade.
- `plane-mesa-falso.js` — Plane falso, em memória, só com as rotas que a mesa de decisão usa (Plane v1.4.2 lido no container em 31/10/2026): carta pelo identificador e pelo projeto, comentários (409 por external_id no PROJETO), labels, estados, atividades, users/me e o PATCH que apaga e recria as labels. Nunca abre rede.
- `plane.test.js`
- `politica-fala.test.js`
- `protocolo-ui.test.js`
- `redirecionamento-c3po.test.js` — Redirecionamentos do chat: /c3po ganha a barra; /severino e /severino/ (nome antigo) vão para /c3po/.
- `reflexao.test.js` — Reflexão noturna (PAINEL-9) com CLI falsa: aplica com histórico; apagar demais vira pendente; segredo recusa; frota não ok recusa sem chamar a CLI; a segunda execução da mesma data não faz nada; sem insumo sai sem CLI.
- `rotas-privilegiadas.test.js` — Varre as rotas do próprio app (regra 6 do padrão geral) pelo painel MONTADO de produção (montagem.js, PAINEL-17): guarda, famílias, autorizador SSO e APIs de duas ações de verdade; só as portas externas (ssh, Plane, SSO, LLM, voz, CLI, coletores) são espiões.
- `sessao-painel.test.js` — Selo de sessão do cabeçalho (31/10/2026): diz de quem é a sessão SSO sem autorizar nada.
- `sessao-voz.test.js`
- `sonda-sso.test.js`
- `triagem-dev.test.js`
- `vigilia.test.js` — Vigília com Plane, escritores e executor falsos: freios, avanço de gate/estado e, desde a F3, o play por nave no lugar do toggle (J11–J14, J66).
- `voz-eleven.test.js`
- `voz-xai.test.js`
- `zelador-job.test.js` — Job do zelador por janela (F3): cada teste fecha um J do parecer de 31/10/2026 com Plane, CLI, sessões e relógio falsos e o git de um repositório temporário.
- `zelador-simulacao.test.js` — Simulação ponta a ponta do zelador (F3): um job completo num projeto falso com 5 cartas, pelas portas reais (play, leases, diário, escritor, git), com Plane, CLI, sessões e consumo falsos.
- `zelador.test.js` — Peças do zelador (F3) uma a uma: trava do agendador (J52), lease (J53), ato humano (J57), prontidão (J58), evidência (J69), escritor (J56/J68), sessões estritas (J67), diário (J45–J50), CLI (J21/J25) e fim do job (J41–J44, J70). Sem rede, sem CLI real.

## test/fixtures/canal-legado/

- `leitor-falso.mjs` — Dublê do scripts/estado_canal.py: o roteiro vem do nome do config pedido.

## test/fixtures/executor-cli/

- `claude-falso.mjs` — CLI claude falsa: grava argv, stdin, env e cwd ao lado de si mesma e responde como `claude -p --output-format json`.
- `codex-falso.mjs` — CLI codex falsa: grava o retrato ao lado de si mesma e escreve a última mensagem em -o.
- `dormente.mjs` — Dorme 5 s; se sobreviver, deixa um marcador ao lado de si mesmo (o timeout deve impedir).
- `npm-falso.mjs` — npm falso: só registra os argumentos (npm ci nunca roda de verdade em teste).

## test/fixtures/frota/

- `frota.js` — Frota de teste gravada pelo mesmo caminho da troca real (ArquivoFrota.gravar), nunca escrita à mão.

## test/fixtures/zelador/

- `cenario.js` — Cenário do zelador montado pelas portas reais: estado, frota, play, leases, diário e escritor de verdade; Plane, CLI, sessões e consumo falsos; git de verdade num repositório temporário.
- `plane-falso.js` — Plane falso para o zelador: leitura Guest (`consultar`) e o fetch do escritor (chave, /users/me, comentários com external_id e 409, PATCH com atividade). Nada de rede.
