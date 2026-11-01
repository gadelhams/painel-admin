# painel-admin — mapa: orquestrador (2 de 2) (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## orquestrador/

- `recibo-gate.js` — Amarra o recibo GATE/v1 à instância ATUAL da etiqueta pelas atividades da carta (J55). Só leitura; não decide elegibilidade além do recibo.
- `registro-gate.js` — Marcação do gate no card. A pré-checagem só-leitura mora em preavaliacao-gate.js.
- `relacoes-formais.js` — Relações formais do Plane: blocked_by, start_after e finish_after. Não lê o texto da carta.
- `reserva-servico.js` — O lado do painel da reserva de carta: resolve SIGLA-N, confere quem pede pelo /proc e comenta RESERVA/v1 na carta pela identidade técnica do projeto. O lease local é do script (reservas.js).
- `reservas.js` — Reserva de carta por sessão (PAINEL-54, item 9: "como evitar double work?"): um lease local por carta, a consulta "reservada por outra sessão viva?" e o mapa pid → CLI. Porta: o script, a vigília, o despacho, a mesa, o zelador e o Hangar leem daqui. Não escreve no Plane.
- `resumo-carta.js` — Resumo da carta para a aba: o estado que a descrição declara (compactação do fio, PADROES-BACKLOG.md), o último handoff e gate, e o tamanho do fio.
- `resumo-fila.js` — Conta cartas por projeto e fecha o envelope da fila. Não julga a carta.
- `retrato-cli.js` — Retrato do que a CLI devolveu e a causa de uma falha (carta, cli ou limite). Os argumentos moram em argumentos-cli.js.
- `sandbox-cli.js` — Sandbox `bwrap` dos filhos do executor (J60): as CLIs dos três papéis e o comando de aceite rodam com as chaves do painel mascaradas. Não decide quem roda; só embrulha e sonda.
- `servico-orquestracao.js` — Liga leitura, despacho, gate, handoff e frota. A porta pública continua o objeto de funções.
- `sessao-cookie.js` — Lê o cookie astargne_session. Não verifica a sessão no Cadastro Único.
- `sessao-painel.js` — De quem é a sessão do Cadastro Único neste navegador, para o cabeçalho do painel. Não autoriza nada.
- `simulacao-despacho.js` — Prévia do despacho com a frota atual. Não reserva lease, não abre processo e não escreve no Plane.
- `sso.js` — Porta das ações privilegiadas. A leitura do Painel não usa esta sessão.
- `tentativa-despacho.js` — Tentativa real: lease, handoff e executor. A checagem mora em checagem-despacho.js.
- `texto-dependencia.js` — Declarações de dependência no texto da carta. Não olha a relação formal do Plane.
- `trava.js` — Trava de diretório da orquestração. Quem espera desiste em 60 s; trava de processo morto é recuperada.
- `triagem.js` — Uma varredura por vez. A classificação mora em classificar-prontidao-dev.js.
- `uuid.js` — Forma de um UUID do Plane ou do próprio painel, e o UUIDv5 determinístico (RFC 4122 §4.3). Não valida se o id existe.
- `varredura-triagem.js` — Lê as folhas sem gate e devolve a triagem. Não grava etiqueta.
- `verificador-cadastro.js` — Pergunta ao Cadastro Único se o token ainda vale. O cookie só viaja no stdin.
- `vigilia-diario.js` — Diário da vigília: eventos em disco por projeto (`vigilia/<id>.jsonl`). Não escolhe carta nem despacha.
- `vigilia-politica.js` — Freios da vigília declarados no contrato. Não varre nem despacha.
- `vigilia-varredura.js` — A passada da vigília no Hangar inteiro: uma tentativa por vez, em round-robin justo entre os projetos com play, sob o teto diário global. O passo de uma carta mora em passo-vigilia.js.
- `vigilia.js` — Vigília: com o play ligado, varre a fila do Hangar inteiro e despacha UMA carta elegível por vez (round-robin, teto global).
- `voz-eleven.js` — Proxy da ElevenLabs. A chave fica no processo; o navegador manda texto e recebe áudio.
- `voz-xai.js` — Áudio temporário, sem persistência e sem token no browser. A transcrição é texto para consulta/proposta; nunca converte fala em escrita ou despacho.
- `zelador-agendador.js` — Agendador do zelador: a cada N minutos escolhe o projeto com play que espera há mais tempo, confere frota, pausas, teto, consumo e ocupação, toma os leases e roda UM job. Não decide veredito.
- `zelador-aplicacao.js` — A sequência de escrita de UM veredito do zelador e a reconciliação do que ficou pela metade: PENDENTE → intenção → mudança sob a trava → verificação → recibo → APLICADO. Não chama a CLI.
- `zelador-cli.js` — A CLI do zelador: a tupla do bloco zelador da frota, num diretório vazio novo, sem ferramentas nem persistência de sessão, com o retrato pela stdin e a resposta em JSON. Não valida veredito.
- `zelador-diario.js` — Diário do zelador: um arquivo de acréscimo por dia (`zelador/zelador-AAAA-MM-DD.jsonl`) e o índice de pendentes fora da rotação. Só campos estruturados; não escreve no Plane.
- `zelador-fim.js` — Fim do job do zelador: o que sobrou no projeto, do Plane atual e sem cache, por uma tabela fechada de quem destrava cada etiqueta. Não escreve.
- `zelador-gate.js` — O portão do gate do zelador: a proposta PRONTA da CLI só vira READY TO DEV depois de tudo conferido ao vivo pelo painel. Não escreve no Plane (o escritor é escritor-gate-zelador.js).
- `zelador-git.js` — Git só-leitura do zelador: o retrato do repositório e a conferência das evidências (commit no ramo principal, arquivo rastreado). Sem shell, sem trava do git.
- `zelador-job.js` — Um job do zelador num projeto: reconcilia o PENDENTE dele, monta o retrato, roda a CLI fora da trava, valida e aplica veredito por veredito, e fecha com o "nada fazível". O lease e a vez moram no agendador.
- `zelador-lease.js` — Leases do zelador em disco: um global (um job por vez no Hangar) e um por projeto, com jobId e prazo. Toda operação sob a trava global; não chama CLI nem Plane.
- `zelador-politica.js` — Regras do zelador sobre uma carta: o que ele não toca, a digital, o "não desfazer ato humano" (J57) e a prontidão que nenhuma escrita pode melhorar em carta alguma nem mudar nas outras (J58), salvo o preparo do PRONTA (PAINEL-62). Funções puras: não lê disco nem Plane.
- `zelador-preparo.js` — O preparo do PRONTA (PAINEL-62): as regras puras que decidem se o painel pode tirar a carta do Backlog e/ou declarar "Dependências: nenhuma" antes do gate. Não lê Plane nem escreve.
- `zelador-retrato.js` — Retrato só-leitura de um projeto para o zelador: cartas, comentários, atividades e relações pela chave Guest (sem cache, pelo caminho do projeto) e o git. Não escreve nada.
- `zelador-veredito.js` — Do JSON da CLI do zelador à mudança estruturada: forma fechada, evidências conferidas pelo painel, prosa filtrada e o HTML montado aqui. Não escreve no Plane.
- `zelador.js` — Composição do zelador do Hangar: diário, leases, git, retrato, CLI, escritor e agendador ligados num objeto. Não implementa regra nenhuma.
