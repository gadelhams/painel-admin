# painel-admin — mapa de módulos (gerado)

Gerado por `node scripts/mapa-modulos.mjs`; o `npm test` falha se este arquivo
estiver desatualizado. Cada linha é o cabeçalho do próprio módulo: o que faz e
o que **não** faz. Mudança simples: ache a responsabilidade aqui, abra só esse
módulo e o `test/<área>.test.js` correspondente, rode `npm test`. O porquê de
cada mecanismo está em [`arquitetura.md`](arquitetura.md); o estado, em
[`current.md`](current.md).

## raiz

- `alinhamento.js` — Porta da rotina de alinhamento.
- `chaves.js` — Porta da tela Chaves.
- `coletores.js` — Porta única dos coletores.
- `contas.js` — Porta da aba Contas.
- `decisoes-c3po.js` — Visão de decisões para o C-3PO (24/10/2026, pedido do dono): a mesma classificação da aba Decisões e do bloco "Astargne", em texto para a conversa — o que depende do dono, o que está bloqueado e por quê, o que espera terceiros.
- `guarda.js` — O painel não tem login para ler: quem alcança a porta lê tudo e gasta crédito pelo C-3PO e pela voz; mudar estado (Contas, Chaves, frota, gates…) pede a sessão SSO do dono desde 29/10/2026 para Contas, antes para o resto.
- `motor.js` — Conversa do C-3PO.
- `plane.js` — Porta do Plane.
- `producao-extra.js` — Sondas de produção que não pertencem a um projeto do catálogo.
- `projetos.js` — Catálogo dos projetos da raiz.
- `relacoes.js` — Relações estruturadas entre os projetos da raiz — espelho do que está em prosa em ../../RELACOES.md (era seção do CLAUDE.md da raiz até 30/09/2026).
- `servidor.js` — Servidor único do painel-admin desde a fusão de 14/08/2026: dashboard na raiz (/), C-3PO em /c3po/, e toda a API na mesma porta 7777.

## alinhamento/

- `cache.js` — Cache da varredura em disco.
- `fio-medida.js` — Conta comentários desde a última marca de compactação.
- `fios.js` — Mede o fio de comentários de cada carta.
- `git-medida.js` — Um comando git com teto de tempo.
- `medidas.js` — Porta das medidas.
- `portao-docs.js` — Roda o check-docs do projeto e devolve a contagem de erros.
- `regras-sinal.js` — Regras que o sinal de um projeto aplica.
- `sinais.js` — Junta os sinais de um projeto.
- `sinal-current.js` — Sinais de docs/current.md: data atrasada e carta fechada ainda citada.
- `sinal-fio.js` — Sinais do fio de comentários: longo demais, ou selado sem compactar.
- `sinal-git.js` — Sinais de git: commits sem push e atraso do remoto.
- `varredura.js` — Percorre os projetos e junta o resultado.

## chaves/

- `api.js` — Fronteira HTTP de /api/chaves/preparar e /api/chaves/confirmar.
- `catalogo.js` — O que cada projeto guarda e onde.
- `confirmacoes.js` — Duas ações da troca de chave: preparar guarda o pedido; confirmar grava o valor, que só entra nesta segunda ação.
- `eventos.js` — Diário das trocas.
- `inventario-local.js` — Inventário local: nomes, modo e rotação.
- `inventario-servidor.js` — Inventário do servidor: um ssh de nomes.
- `inventario.js` — Junta o inventário local e o do servidor no mesmo cache de nomes.
- `servico.js` — Porta do serviço de chaves.
- `troca-local.js` — Reescreve uma linha do .env local e reinicia a unit de usuário.
- `troca-servidor.js` — Reescreve uma linha do .env no servidor pelo script fixo.
- `troca.js` — Escolhe o destino da troca.

## coletores/

- `acervo.js` — Acervo compartilhado (a Oficina central do Hangar): padrões, orientações, skills e lições.
- `acoes-sessao.js` — Uma chamada de ferramenta de sessão de IA → ação segura para o Hangar.
- `backlog.js` — Monta o backlog de cada projeto: Plane quando há id, markdown no resto.
- `caminhos.js` — Raiz e portão de caminho.
- `catalogo.js` — Catálogo estático de relações.
- `decisoes.js` — Decisões derivadas do backlog.
- `docs.js` — Docs de um projeto do catálogo, já dentro da raiz.
- `estado-local.js` — Monta o resumo de cada projeto: existência, git e portas.
- `git-local.js` — Git local de um projeto do catálogo.
- `hangar.js` — Naves do Hangar: por projeto, peças (módulos) com a contagem de cartas, próximas fases e decisões.
- `idade-linha.js` — Idade de uma linha no git, pelo log -L.
- `leitura-md.js` — Lê um markdown e corta no teto.
- `modeladores.js` — Lista os markdowns de um diretório já autorizado.
- `parser-backlog.js` — Lê o markdown de backlog.
- `portas-locais.js` — Escuta TCP em 127.0.0.1.
- `sessoes.js` — Sessões de IA vivas na máquina (os droids do Hangar): /proc + cauda dos transcripts.
- `sonda-https.js` — Um GET HTTPS com teto de tempo.
- `sondas.js` — Quais endereços de produção sondar.
- `transcript-cauda.js` — Lê só o fim de um transcript .jsonl e devolve as linhas que são JSON.
- `transcript-claude.js` — Uma sessão do Claude Code a partir da cauda do transcript: última atividade, cwd, fim de turno e ações.
- `transcript-codex.js` — Uma sessão do Codex a partir da cauda do rollout: última atividade, cwd, fim de turno e ações.

## contas/

- `fronteira.js` — Cliente e rotas /api/contas/*.
- `processo-ssh.js` — Processo ssh sem shell.
- `redacao.js` — Tira bearer do texto antes do log.
- `saida-central.js` — Lê o corpo e o status que o script remoto devolve.
- `ssh.js` — Porta do ssh das contas.
- `tabela.js` — Tabela fechada do Cadastro Único.

## e2e/

- `esperar-modelos.mjs`
- `fixture-server.mjs` — Apenas estáticos do Painel.
- `playwright.config.mjs`
- `politica-post.mjs`
- `windows-sso-smoke.mjs` — Prova final de SSO em navegador Windows.

## e2e/tests/

- `hangar.spec.mjs`
- `orquestrador.spec.mjs`

## http/

- `arquivo-publico.js` — Serve um arquivo de publico/ sem sair da pasta.
- `conversa.js` — Conversa do C-3PO em SSE.
- `corpo-limitado.js` — Lê o corpo do pedido até o teto.
- `redirecionamento-c3po.js` — Leva /c3po à barra final e os endereços antigos /severino e /severino/ ao novo.
- `resposta-json.js` — Escreve JSON na resposta.
- `resposta.js` — Porta da resposta.
- `rotas-alinhamento.js` — Varredura de alinhamento.
- `rotas-backlog.js` — Backlog lido do Plane ou do markdown.
- `rotas-chaves.js` — Inventário e troca de chaves.
- `rotas-contas.js` — Repassa o Cadastro Único.
- `rotas-decisoes.js` — Decisões paradas do backlog.
- `rotas-hangar.js` — Naves e droids do Hangar.
- `rotas-orq-canal.js` — Comentários do card.
- `rotas-orq-consumo.js` — Cotas de assinatura.
- `rotas-orq-despacho.js` — Preparar e confirmar o despacho.
- `rotas-orq-diario.js` — Diário da frota: leitura só.
- `rotas-orq-fila.js` — Fila, pré-checagem e simulação.
- `rotas-orq-frota.js` — Leitura e troca da frota.
- `rotas-orq-gate.js` — Preparar e confirmar a marca de gate.
- `rotas-orq-handoff.js` — Preparar e confirmar o handoff.
- `rotas-orq-nativo.js` — Estado e alternância da liberação do jogo nativo.
- `rotas-orq-triagem.js` — Triagem das folhas sem gate.
- `rotas-orq-vigilia.js` — Estado e alternância da vigília.
- `rotas-orq-voz.js` — Presença da chave e a transcrição.
- `rotas-orquestracao.js` — Escolhe a família de /api/orquestracao.
- `rotas-painel.js` — Escolhe a família da rota.
- `rotas-producao.js` — Sondas HTTPS da produção.
- `rotas-projetos.js` — Estado local, documentos e git de um projeto.
- `rotas-relacoes.js` — Catálogo estático de relações entre projetos.
- `rotas-ssh.js` — Consulta SSH só de leitura da produção.
- `rotas-voz.js` — ElevenLabs, diagnóstico do navegador e presença da transcrição.
- `roteador.js` — Despacha o pedido depois da guarda.
- `ssh-leitura.js` — SSH somente leitura do servidor, sob demanda.

## motor/

- `doc-projeto.js` — Lê ou lista um .md dentro da pasta do projeto.
- `envelope-coletor.js` — Embrulha a falha de um coletor interno.
- `ferramentas.js` — Catálogo das seis ferramentas só de leitura.
- `persona.js` — Voz do C-3PO.

## orquestrador/

- `ambiente-cli.js` — Ambiente dos filhos da CLI: lista branca, sem chave do painel.
- `api-despacho.js` — Duas ações do despacho: preparar valida e guarda o desafio com a versão da frota; confirmar inicia a tentativa real.
- `api-duas-acoes.js` — Fronteira HTTP das duas ações: sessão antes do corpo, campos fechados, falha upstream sem eco.
- `api-frota.js` — Duas ações da frota: preparar valida contra o catálogo e guarda a versão-base; confirmar grava se a frota não mudou.
- `api-gate.js` — Duas ações do gate: preparar guarda a proposta; confirmar marca a etiqueta.
- `api-handoff.js` — Duas ações do handoff: preparar guarda a entrada; confirmar grava o comentário.
- `api-nativo.js` — Duas ações da liberação do jogo nativo: preparar valida projeto e prazo; confirmar liga (com prazo) ou desliga.
- `api-vigilia.js` — Duas ações da vigília: preparar valida a alternância de um projeto; confirmar liga ou desliga.
- `argumentos-cli.js` — Argumentos fixos de cada CLI.
- `arquivo-lease.js` — Um arquivo de lease por carta.
- `autorizador.js` — Autoriza uma ação privilegiada: origem, cookie, sessão e dono.
- `briefing-papel.js` — O texto que cada papel recebe: carta, contrato e o molde do briefing.
- `canal-carta.js` — Leitura do card: interações, handoffs e gates.
- `canal-plane.js` — Lê os comentários do card.
- `carta-da-fila.js` — Julga uma carta já carregada: lease, proveniência do gate e a pré-checagem pedida.
- `checagem-despacho.js` — Checagem do despacho real.
- `classificar-prontidao-dev.js` — Classifica impedimentos verificáveis de uma carta sem gate.
- `consulta-c3po.js` — Projeção limitada e só-leitura da fila/triagem para a conversa do C-3PO.
- `consulta-perfil.js` — O perfil antigo da carta, só para exibir "perfil antigo ignorado (era X; roda a frota vN)".
- `consumo.js` — Apenas cota incluída na ASSINATURA.
- `contrato-local.js` — Contrato local `.orquestrador.json` de um projeto do catálogo.
- `contrato-politica.js` — Gramática do contrato opt-in: o que o projeto permite executar.
- `dependencias-carta.js` — Junta a relação formal do Plane com o que a carta declara no texto.
- `dependencias-worktree.js` — Instalação do worktree quando há lock e faltam os módulos.
- `desafio-duas-acoes.js` — Esqueleto das duas ações privilegiadas: preparar guarda um desafio, confirmar o executa uma vez.
- `despacho-servico.js` — Junta a checagem e a tentativa real.
- `diario-frota.js` — Diário da frota: projeção só-leitura dos livros que já existem (touchpoints do despacho e diários da vigília).
- `diario-touchpoints.js` — Diário JSONL dos touchpoints.
- `erro-acesso.js` — Erro das ações privilegiadas.
- `escritor-gate-plane.js` — Grava a etiqueta depois do comentário.
- `escritor-handoff-plane.js` — Grava o comentário de handoff.
- `estado-carta.js` — Troca o grupo de estado de uma carta.
- `estado-plane.js` — Mudança de estado do card pela vigília: Todo → In Progress ao começar a codar e In Progress → Done quando a tentativa de teste é aprovada.
- `estado.js` — Recupera lease e diário depois de uma queda.
- `executor-cli.js` — Sequência da tentativa: isola, instala, pede os três papéis, roda o aceite e fecha o veredito.
- `fila-leitura.js` — Junta as cartas do Plane com o contrato local.
- `fila.js` — Porta da fila.
- `fonte-consumo-claude.js` — Cota da assinatura do Claude.
- `fonte-consumo-codex.js` — Cota da assinatura do Codex.
- `frota-catalogo.js` — Catálogo fechado da frota (provedor → modelo → esforços) e os validadores dos dois blocos.
- `frota-pausas.js` — Pausas da frota: por provedor (limite de uso, com prazo) e da versão inteira (CLI ou modelo impedido).
- `frota-servico.js` — Leitura e troca da frota pelo serviço.
- `frota.js` — Frota: a configuração geral de modelos por papel, num arquivo só, gravado por SSO + duas ações.
- `gate-plane.js` — Entrada do gate no card.
- `gate-servico.js` — Junta a pré-checagem e a marcação do gate.
- `gramatica-cli.js` — Gramática estática do scripts.test e dos scripts do contrato.
- `handoff-plane.js` — Entrada do handoff no card.
- `handoff-servico.js` — Handoff no card.
- `interacao-canal.js` — Forma de um comentário do card: texto visível e o cabeçalho ORQ/v1.
- `isolamento-git.js` — Worktree e commit do ramo orq/.
- `leitor-jsonl.js` — Leitura e acréscimo de um diário JSONL.
- `liberacao-nativa.js` — Liberação do jogo nativo por projeto: o dono liga na nave do Hangar quando a Steam está livre.
- `marcas-carta.js` — Marcas da carta que os dois julgamentos leem.
- `modelos.js` — Plano de execução a partir da frota congelada e as flags de modelo/esforço de cada CLI.
- `origem-privilegiada.js` — Recusa POST privilegiado que não venha da própria borda.
- `papel-cli.js` — Lança um papel de IA.
- `passo-vigilia.js` — Um projeto ligado: escolhe a carta, despacha com a frota e avança o gate.
- `politica.js` — Porta da política da orquestração.
- `preavaliacao-gate.js` — Pré-checagem só-leitura do gate.
- `processo-cli.js` — Um processo filho: sem shell, grupo morto no tempo, saída capada e log em disco.
- `prontidao-despacho.js` — Pode despachar esta carta.
- `prontidao-gate.js` — Pode marcar este gate.
- `prontidao.js` — Os dois julgamentos da carta.
- `protocolo-gate.js` — Texto GATE/v1: valida a proposta, codifica o comentário e lê a evidência.
- `protocolo-handoff.js` — Texto HANDOFF: valida a entrada, codifica o comentário (v2) e lê o card (v1 legado e v2).
- `protocolo-perfil.js` — Leitura do texto PERFIL-IA/v1 legado.
- `registro-gate.js` — Marcação do gate no card.
- `relacoes-formais.js` — Relações formais do Plane: blocked_by, start_after e finish_after.
- `resumo-carta.js` — Resumo da carta para a aba: o estado que a descrição declara (compactação do fio, PADROES-BACKLOG.md), o último handoff e gate, e o tamanho do fio.
- `resumo-fila.js` — Conta cartas por projeto e fecha o envelope da fila.
- `retrato-cli.js` — Retrato do que a CLI devolveu e a causa de uma falha (carta, cli ou limite).
- `servico-orquestracao.js` — Liga leitura, despacho, gate, handoff e frota.
- `sessao-cookie.js` — Lê o cookie astargne_session.
- `simulacao-despacho.js` — Prévia do despacho com a frota atual.
- `sso.js` — Porta das ações privilegiadas.
- `tentativa-despacho.js` — Tentativa real: lease, handoff e executor.
- `texto-dependencia.js` — Declarações de dependência no texto da carta.
- `trava.js` — Trava de diretório da orquestração.
- `triagem.js` — Uma varredura por vez.
- `uuid.js` — Forma de um UUID v4 do Plane ou do próprio painel.
- `varredura-triagem.js` — Lê as folhas sem gate e devolve a triagem.
- `verificador-cadastro.js` — Pergunta ao Cadastro Único se o token ainda vale.
- `vigilia-controle.js` — Liga e desliga a vigília de um projeto e monta o estado dela.
- `vigilia-diario.js` — Diário da vigília: config e eventos em disco.
- `vigilia-politica.js` — Freios da vigília declarados no contrato.
- `vigilia-varredura.js` — Percorre os projetos ligados.
- `vigilia.js` — Vigília: com um projeto ligado, varre a fila e despacha a carta elegível.
- `voz-eleven.js` — Proxy da ElevenLabs.
- `voz-xai.js` — Áudio temporário, sem persistência e sem token no browser.

## plane/

- `cliente.js` — Cliente e cache do Plane.
- `features.js` — Projeção pura do workspace do Plane para a forma do backlog.

## publico/

- `app.js` — Tema e o relógio discreto da sincronia.
- `backlog-nodo.js` — Árvore do backlog: placar, tag e o nó.
- `backlog.js` — Backlog — o markdown de cada projeto é a VERDADE; toda tela aqui é projeção.
- `carga.js` — Busca as quatro fontes e só então redesenha.
- `chaves-desenho.js` — Lista da aba Chaves.
- `chaves-linha.js` — Uma linha de segredo catalogado.
- `chaves-pedido.js` — Pedido da aba Chaves.
- `chaves-troca-form.js` — Prepara e confirma a troca de um nome.
- `chaves.js` — Aba Chaves: o estado da tela.
- `console-c3po.js` — Carta da orquestração: preenche a entrada e não envia.
- `console-decisao.js` — Abre uma decisão parada e manda o contexto.
- `console-digest.js` — Digest do dia.
- `console-palco.js` — Onde o console senta: no palco ou por cima da aba.
- `contas-convite.js` — Convite pendente, formulário de convite e o resultado com o link.
- `contas-desenho.js` — Compõe o desenho da aba Contas.
- `contas-pecas.js` — Peças comuns da aba Contas: data, app, papel, botão e seção.
- `contas-pedido.js` — Pedido da aba Contas.
- `contas-usuario.js` — Linha de usuário e o editor de permissões.
- `contas.js` — Estado da aba Contas.
- `decisoes-astargne.js` — Bloco Astargne da aba Decisões.
- `decisoes-grupo.js` — Agrupamento das decisões paradas.
- `decisoes-linha.js` — Uma linha da aba Decisões.
- `decisoes.js` — Aba Decisões: o que está visível, os três grupos maiores e o resto colapsado.
- `docs-desenho.js` — Desenho da aba Docs: rótulos, links e a lista de sinais.
- `docs.js` — Aba Docs: lê a última varredura.
- `dom.js` — DOM e markdown do painel.
- `estado-painel.js` — Estado compartilhado das abas.
- `grafo.js` — Aba Grafo — relações entre projetos, desenhadas via Mermaid (já vendorizado para os diagramas dos docs de projeto) em vez de SVG à mão: zero precedente de desenho manual no projeto, e o tamanho do catálogo (~10 nós) é exatamente o que o layout automático do Mermaid resolve bem.
- `idade-curta.js` — Idade curta de uma data.
- `nomes-curtos.js` — Nome curto da tira e dos bloqueios.
- `orquestrador.js` — Liga as vistas da aba.
- `palco-bloqueios.js` — Os cinco bloqueios mais antigos do palco.
- `placar-cabecalho.js` — Número de decisões no cabeçalho e no selo.
- `projeto-secoes.js` — Compõe as seções do projeto.
- `projeto.js` — Estado do painel de projeto.
- `roteador-painel.js` — Hash é a fonte da view.
- `secao-arquitetura.js` — Moldura de arquitetura e a lista de documentos modeladores.
- `secao-cabecalho.js` — Cabeçalho do projeto e os chips de etiqueta.
- `secao-decisoes.js` — Decisões paradas do projeto aberto.
- `secao-fila.js` — O lugar da fila de jobs.
- `secao-outline.js` — Outline do backlog do projeto aberto.
- `secao-producao.js` — Sondas de produção e a consulta SSH sob demanda.
- `telemetria.js` — Junta a tira de projetos e os bloqueios do palco.
- `tira-telemetria.js` — Uma célula da tira de projetos.

## publico/c3po/

- `chat.js` — Liga o palco, o fluxo e os modos de voz.
- `escuta.js` — Microfone do C-3PO.
- `fluxo-sse.js` — Fluxo da conversa: lê o SSE e manda o turno.
- `locutor.js` — Alto-falante do C-3PO: ElevenLabs, e o Antônio quando ela cai.
- `modos-voz.js` — Microfone do C-3PO: push-to-talk, copiloto e ligação.
- `palco.js` — Palco do C-3PO: o histórico e o texto do console.
- `politica-fala.js` — Política pura da voz do C-3PO.
- `sessao-voz.js` — Quem decide se a frase ouvida vira turno.
- `voz.js` — Fachada.

## publico/hangar/

- `cena.js` — Cena 3D do Hangar (Three.js r128 vendorizado + bloom): monta as estruturas, reconstrói o que os dados mudam e desenha cada quadro.
- `conteudo.js` — O que o C-3PO diz e mostra no popup de cada estrutura do Hangar.
- `conversa.js` — Conversa com o C-3PO dentro do popup do Hangar: a pergunta vai a /api/conversa com o contexto do objeto clicado e a resposta chega em SSE.
- `dados.js` — Busca naves (/api/hangar), droids (/api/hangar/sessoes), sondas (/api/producao) e a frota (/api/orquestracao/frota) e as aplica ao estado da cena sem perder a animação.
- `estado.js` — Mapa do estaleiro (posições fixas) e o estado vivo compartilhado entre os módulos do Hangar.
- `formas.js` — Formas das peças da nave (polígonos vistos de cima, nariz para +x) e a escolha da forma de cada módulo.
- `hangar.js` — Entrada do Hangar: liga dados, simulação, cena e interface, e pausa tudo quando a aba sai de vista.
- `interface.js` — Popup do C-3PO ancorado na cena, painéis laterais (droids, projetos, Oficina) e os botões do Hangar.
- `narrador.js` — Narrador do Hangar: fila de falas prontas do C-3PO, balão digitado e diário.
- `nativo.js` — Interruptor "Steam livre" no popup da nave que tem jogo nativo.
- `rotulos.js` — Rótulos HTML sobre a cena (docas, vagas, droids, bancadas, Oficina), projetados do 3D para a tela a cada quadro.
- `simulacao.js` — Movimento do Hangar: sessões reais viram droids, cada ação nova vira uma ida (bancada, nave ou Oficina), naves vão e voltam das docas.
- `util.js` — Utilidades do Hangar: curvas de movimento, sorteio com semente, escape de HTML e atalhos de DOM.

## publico/orquestracao/

- `consumo.js` — Medidores de consumo.
- `conversa-canal.js` — Resumo da carta: o estado que a descrição declara, o último handoff e gate e o tamanho do fio.
- `conversa-handoff.js` — Prepara e confirma o handoff.
- `conversa.js` — Liga a leitura do card ao handoff em duas ações.
- `demanda-carta.js` — Elegibilidade e dependências da carta selecionada.
- `demanda-historico.js` — Diário da frota: o que cada droid fez, em que carta e com que resultado.
- `demanda-portao.js` — Portão de execução da carta selecionada.
- `demanda-prontidao.js` — Pré-checagem de gate da carta selecionada.
- `despacho.js` — Preparar e confirmar o despacho.
- `fila-filtro.js` — Quais cartas passam no filtro da tela.
- `fila-lista.js` — Desenha o seletor de projetos e os botões das cartas.
- `fila-triagem.js` — Classifica as folhas sem gate.
- `fila.js` — Carrega a fila e abre a carta.
- `frota-confirmacao.js` — Preparar e confirmar a troca da frota.
- `frota.js` — Sub-aba Frota: mostra a configuração geral (estado, versão, os quatro papéis) e o editor dos dois blocos.
- `gate.js` — Preparar e confirmar a etiqueta de gate.
- `modelos-seletores.js` — Desenha os seletores provedor → modelo → esforço de cada papel.
- `nucleo.js` — Estado e HTTP da aba Orquestração.
- `vigilia-confirmacao.js` — Segunda ação da vigília.
- `vigilia-desenho.js` — Desenho de um projeto da vigília.
- `vigilia.js` — Estado da vigília por projeto.
- `voz-carta.js` — Gravação da carta: só propõe texto.

## scripts/

- `check-docs.mjs` — check-docs v1.5 (02/10/2026; v1 de 30/09) — portão de documentação do padrão de contexto por tarefa (~/Work/PADROES-CONTEXTO.md).
- `mapa-modulos.mjs` — Gera docs/mapa.md a partir do cabeçalho de cada módulo.

## test/

- `alinhamento.test.js` — Rotina de alinhamento com Plane, git e portão de docs FALSOS.
- `caminhos.test.js`
- `chaves.test.js` — Tela Chaves: só nomes saem; valor só entra pela confirmação; escrita local atômica 0600; servidor por ssh falso com valor no stdin; portão SSO.
- `consulta-c3po.test.js`
- `contas.test.js` — Testes do módulo contas.js (aba Contas).
- `correcoes-auditoria.test.js` — Correções da auditoria de 23-24/10/2026: cada teste pina um mecanismo que a auditoria mostrou furado (mutação nomeada no título do caso).
- `decisoes-c3po.test.js`
- `despacho-controlado.test.js`
- `diario-resumo.test.js`
- `executor-cli.test.js` — Executor real com CLIs falsas: flags exatas, ambiente limpo, isolamento por worktree, timeout que mata o processo, e os três desfechos.
- `fluxo-sse.test.js`
- `frota.test.js` — Frota (F2, 29/10/2026): catálogo fechado, dois blocos, estado explícito na leitura, troca por duas ações com versão-base e histórico só de acréscimo.
- `gate-plane.test.js`
- `guarda.test.js`
- `handoff-plane.test.js`
- `hangar.test.js` — Hangar: sessões vivas (/proc e transcripts falsos em pasta temporária) e naves sobre backlog falso.
- `identidades-projeto.test.js`
- `liberacao-nativa.test.js` — Liberação do jogo nativo (PAINEL-59): prazo que vence sozinho, só projetos com jogo nativo no catálogo, arquivo estranho conta como desligado e a troca só por duas ações.
- `motor-ambiente.test.js` — Prova que o processo do modelo do C-3PO não recebe segredo do .env nem config do disco (PAINEL-52).
- `orquestrador-core-v2.test.js`
- `orquestrador-sso.test.js`
- `orquestrador-ui.test.js`
- `orquestrador-v2.test.js`
- `plane.test.js`
- `politica-fala.test.js`
- `protocolo-ui.test.js`
- `redirecionamento-c3po.test.js` — Redirecionamentos do chat: /c3po ganha a barra; /severino e /severino/ (nome antigo) vão para /c3po/.
- `rotas-privilegiadas.test.js` — Varre as rotas do próprio app (regra 6 do padrão geral) pelo roteador REAL: guarda, famílias e APIs de duas ações de verdade; só os serviços no fim da linha são espiões.
- `sessao-voz.test.js`
- `sonda-sso.test.js`
- `triagem-dev.test.js`
- `vigilia.test.js` — Vigília com Plane, escritores e executor falsos: freios, avanço de gate/estado e a fronteira de ligar/desligar.
- `voz-eleven.test.js`
- `voz-xai.test.js`

## test/fixtures/canal-legado/

- `leitor-falso.mjs` — Dublê do scripts/estado_canal.py: o roteiro vem do nome do config pedido.

## test/fixtures/executor-cli/

- `claude-falso.mjs` — CLI claude falsa: grava argv, stdin, env e cwd ao lado de si mesma e responde como `claude -p --output-format json`.
- `codex-falso.mjs` — CLI codex falsa: grava o retrato ao lado de si mesma e escreve a última mensagem em -o.
- `dormente.mjs` — Dorme 5 s; se sobreviver, deixa um marcador ao lado de si mesmo (o timeout deve impedir).
- `npm-falso.mjs` — npm falso: só registra os argumentos (npm ci nunca roda de verdade em teste).

## test/fixtures/frota/

- `frota.js` — Frota de teste gravada pelo mesmo caminho da troca real (ArquivoFrota.gravar), nunca escrita à mão.
