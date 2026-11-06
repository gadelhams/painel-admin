# painel-admin — mapa: raiz (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## raiz

- `alinhamento.js` — Porta da rotina de alinhamento. As medidas e a varredura moram em alinhamento/.
- `chaves.js` — Porta da tela Chaves. Catálogo, troca, confirmação e HTTP moram em chaves/.
- `coletores.js` — Porta única dos coletores. Rotas e ferramentas do C-3PO importam daqui.
- `contas.js` — Porta da aba Contas. A tabela, o ssh e a fronteira HTTP moram em contas/.
- `decisao.js` — Porta da mesa de decisão para quem só LÊ ou PROPÕE (o motor do C-3PO e o zelador): a leitura da carta, a forma de texto dela, a marca do DECISAO/v1 e o registro de propostas de decisão, que não toca o Plane. O escritor, a aplicação e as duas ações ficam fora daqui de propósito — só a montagem os liga.
- `decisoes-c3po.js` — Visão de decisões para o C-3PO (24/10/2026, pedido do dono): a mesma classificação da aba Decisões e do bloco "Astargne", em texto para a conversa — o que depende do dono, o que está bloqueado e por quê, o que espera terceiros.
- `encomendas.js` — Porta das encomendas de nave, só o lado de leitura. O registro e as duas ações moram em encomendas/ e só a montagem os liga.
- `guarda.js` — Confere Host e origem de todo pedido, antes do portão de login e das rotas; não sabe de sessão.
- `montagem.js` — Monta o painel inteiro (serviços, RoteadorPainel e o handler `(req, res)`) a partir do ambiente e das portas externas recebidas; não escuta porta, não lê `.env` e não liga laço nenhum até `iniciar()`.
- `motor.js` — Conversa do C-3PO. As ferramentas e a voz moram em motor/; aqui só o fluxo de eventos.
- `plane.js` — Porta do Plane. A consulta mora em plane/cliente.js; a projeção, em plane/features.js.
- `producao-extra.js` — Sondas de produção que não pertencem a um projeto do catálogo.
- `projetos.js` — Catálogo dos projetos da raiz. Metadados que não dão para derivar do disco (portas, URL de produção, onde fica o repo git) vivem aqui; o resto o servidor coleta ao vivo.
- `relacoes.js` — Relações estruturadas entre os projetos da raiz — espelho do que está em prosa em ../../RELACOES.md (era seção do CLAUDE.md da raiz até 30/09/2026).
- `servidor.js` — Servidor único do painel-admin desde a fusão de 14/08/2026: lê o ambiente, monta o painel com as dependências reais (montagem.js) e escuta em 127.0.0.1; não compõe serviço nem decide rota.
