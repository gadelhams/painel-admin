# painel-admin — mapa: http (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## http/

- `arquivo-publico.js` — Serve um arquivo de publico/ sem sair da pasta.
- `conversa.js` — Conversa do C-3PO em SSE. Cada evento do motor sai na hora; no fim, o par pergunta/resposta vai ao diário de conversas, se houver e se o turno trouxe a sessão SSO do dono.
- `corpo-limitado.js` — Lê o corpo do pedido até o teto. Acima disso corta a conexão.
- `portao-borda.js` — Portão de entrada da borda (PAINEL-64): pedido que não é de loopback só segue com a sessão do dono no Cadastro Único. Não autoriza ação privilegiada (isso é do autorizador de cada rota) nem verifica a sessão sozinho (pergunta ao selo).
- `redirecionamento-c3po.js` — Leva /c3po à barra final e os endereços antigos /severino e /severino/ ao novo. Não atende a API.
- `resposta-json.js` — Escreve JSON na resposta. Não lê arquivo nem o corpo do pedido.
- `resposta.js` — Porta da resposta. JSON, arquivo estático e corpo com teto moram ao lado.
- `rotas-acoes.js` — Preparar e confirmar uma ação proposta pelo C-3PO, pelas duas ações com SSO. Não há rota para propor: isso só o motor faz.
- `rotas-alinhamento.js` — Varredura de alinhamento. `?agora=1` força uma passagem.
- `rotas-backlog.js` — Backlog lido do Plane ou do markdown.
- `rotas-chaves.js` — Inventário e troca de chaves. A recusa genérica vem depois das rotas específicas.
- `rotas-contas.js` — Repassa o Cadastro Único. Escrita só com sessão SSO; o corpo só é lido depois dela, e só quando a rota está na tabela fechada.
- `rotas-decisao.js` — Rotas da mesa de decisão: a carta da gaveta e as aplicações pendentes (GET, chave Guest), gravar, retomar e abandonar (POST, SSO + duas ações). Não monta o serviço.
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
- `rotas-orq-reservas.js` — Reserva de carta por sessão (/api/orquestracao/reservas): GET resolve SIGLA-N e diz se há reserva viva; POST comenta RESERVA/v1 na carta. A recusa (sem SSO, só o agente local) mora em orquestrador/reserva-servico.js.
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
- `roteador.js` — Despacha o pedido depois da guarda e do portão da borda. Cada grupo devolve false quando a rota não é dele.
