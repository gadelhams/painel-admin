# Parecer do validador de invariantes (29/10/2026)

Parte do [plano da frota do Hangar](plano-frota-do-hangar.md).

O parecer foi NÃO RATIFICÁVEL: 50 janelas, 7 que bloqueiam e 5 contradições
de documento (já corrigidas). As regras abaixo entram no desenho, e o número
é o da janela no parecer.

**Achado que vale também para o executor de hoje (J7), resolvido em 29/10.**
O `claude -p --bare` autentica só por chave de API e nunca pelo OAuth da
assinatura, então o papel Claude do executor não autenticava. O dono
autorizou uma prova mínima.
- O executor passou a usar `--restricted --strict-mcp-config` com `--tools`
  explícito. Isso foi provado numa chamada real: resposta pela assinatura,
  com ~5 mil tokens de contexto, contra ~178 mil no modo normal.
- O Codex já estava certo: sandbox só-leitura, aprovação "never", ~2 mil
  tokens.
- O papel de codificação com Bash não rodou de verdade. Isso fica para o
  PAINEL-34.

**F2, a frota:**
- **Projetos (J1):** a frota só escolhe modelos e nunca habilita um projeto.
  O interruptor por projeto continua no contrato até o play da F3.
- **Perfil antigo (J2):** o `PERFIL-IA/v1` deixa de valer, por decisão do
  dono (28/10), e o doc muda na mesma fatia. A fila mostra "perfil antigo
  ignorado".
- **Troca de frota (J3):** a tentativa congela a frota inteira na reserva, e
  o HANDOFF grava as tuplas. Trocar a frota não cancela o que já está
  rodando.
- **Confirmação (J4):** o preparar guarda a versão-base, e o confirmar
  recusa se ela mudou. A versão é um inteiro crescente mais um hash, com
  histórico só de acréscimo.
- **Arquivo ruim (J5):** frota ilegível, ausente ou inválida trava tudo, sem
  cair para nenhum padrão. A gravação usa tmp + rename.
- **Catálogo e falhas (J6):** o catálogo de modelos é fechado no código.
  `impedido` de CLI ou modelo pausa a frota sem gastar tentativa da carta. A
  pausa por limite de uso vale por provedor, para todos.
- **Blocos (J8):** são dois blocos com validadores separados, o executor
  (três papéis) e o zelador.
- **Origem (J9):** o HANDOFF passa a ter `origemModelos`, com valor
  `frota` ou `perfil-ia`.
- **Leitores (J10):** todos os leitores e escritores de perfil mudam na
  mesma entrega, inclusive o `passo-vigilia`.

**F3, o play e o zelador:**
- **Play (J11–J14):**
  - o play é relido antes de cada carta;
  - play ilegível conta como desligado e aparece assim na tela;
  - a vigília antiga é desligada na migração;
  - o job tem um lease em disco por projeto e um global.
- **Sessões (J16–J19):** o leitor de sessões é estrito. Um projeto fica
  ocupado se qualquer ação recente tocou um caminho dele ou uma carta dele.
  O zelador pula carta com lease, HANDOFF em andamento ou atividade de outro
  ator nas últimas horas.
- **Isolamento da CLI (J20, J21, J25):**
  - o retrato usa `GIT_OPTIONAL_LOCKS=0`;
  - a CLI roda num diretório vazio, recebe o retrato pela entrada padrão e
    fica em modo só-leitura;
  - a prosa passa por um filtro de segredo.
- **Vereditos (J22–J24):**
  - o painel confere a evidência e monta o HTML;
  - commit só vale se estiver no ramo principal;
  - cada veredito leva a digital da carta, e se a digital mudou o veredito
    vira MANTER.
- **Escrita no Plane (J26–J28):**
  - `external_id` = carta + tipo + hash;
  - cada GET vai pelo caminho do projeto;
  - labels são resolvidas por nome dentro do projeto; se a label não existe,
    o veredito vira MANTER;
  - toda escrita é verificada, e divergência suspende o play.
- **Elegibilidade (J29):** a escrita do zelador nunca deixa carta alguma
  mais elegível; nas outras cartas, não muda nada (a própria pode perder
  prontidão: fechar e travar só acrescentam motivo). A prontidão é calculada
  antes e depois, e ele não toca carta com gate nem carta que bloqueia uma
  carta com gate, em qualquer projeto do catálogo.
- **Carta contestada (J30):** o zelador nunca desfaz um ato humano. Se o
  estado atual contraria o último recibo dele, a carta fica "contestada" e
  ele só pergunta. Uma `DECISAO/v1` impede repor `ASTARGNE`.
- **Concorrência (J31–J34):**
  - o zelador pula carta com aplicação pendente na mesa (a gaveta aberta não fica em disco: B2);
  - CLI nunca roda sob a trava global, e o tempo sob a trava é curto;
  - o diário marca `ZELADOR_PENDENTE`, grava o comentário de intenção e,
    depois, o recibo de aplicação;
  - nada em carta com gate ou com tentativa nas últimas 24 h.
- **O que ele não toca (J35–J37):**
  - só carta folha;
  - descrição só se o trecho aparecer exatamente uma vez na releitura;
  - chave em arquivo 600, conferida a cada uso;
  - nunca Member no Anya.
- **Labels e consumo (J39, J40):**
  - o zelador põe `PRODUTO` junto com `ASTARGNE` e nunca o tira;
  - `IA_DECIDE` entra no padrão;
  - há teto diário de jobs, e o zelador cede quando o consumo fica alto.

**Fim do job (J41–J44):** "nada fazível" é calculado do Plane atual, sem
cache, por uma tabela fechada de quem destrava cada label. Três categorias
ficam separadas: "espera puxar (F4)", "tarefa do dono" e "decisão". Feita
quer dizer zero abertas e zero em andamento, não 100% arredondado.

**Diário (J45–J50):** um log só, de acréscimo, que o Hangar, a aba e o
C-3PO leem. Linha truncada no fim é tolerada; corrupção no meio do arquivo
falha fechada. Rotação diária, só campos estruturados. O droid do zelador
nasce do estado do job. O Hangar ganha rotas de escrita, cobertas pelo teste
que varre as rotas.
