# painel-admin — mapa: publico (1 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

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
- `decisao-proposta.js` — Cartão "Decisão proposta" do chat do C-3PO (PAINEL-65): mostra a decisão, o motivo e os efeitos que o C-3PO propôs, prepara sozinho para exibir o que muda no Plane e grava com UM toque do dono. Não propõe nem decide; sem a sessão do dono nada é gravado.
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
