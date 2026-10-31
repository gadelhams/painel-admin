// Monta o painel inteiro (serviços, RoteadorPainel e o handler `(req, res)`) a partir do ambiente e das portas externas recebidas; não escuta porta, não lê `.env` e não liga laço nenhum até `iniciar()`.
//
// Montar ≠ escutar (PAINEL-17): servidor.js lê o ambiente, chama montarPainel com as
// dependências reais e faz o `listen`; os testes chamam a mesma função com falsos em
// `externos` e um diretório de estado temporário, e exercitam o roteador de produção.
// Toda porta externa ausente cai no padrão do próprio módulo — é assim que a produção
// fica idêntica à de antes da separação. Quem compõe não implementa: nenhuma regra mora aqui.

import { spawn as spawnReal } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { estadoProjetos, estadoProducao, lerBacklog, docsProjeto, lerModeladorProjeto, gitDetalhado, catalogoRelacoes, decisoesDoBacklog, lerHangar, lerSessoes, LeituraSsh, ocupacaoPorSessoes } from './coletores.js';
import { conversar as conversarReal } from './motor.js';
import { criarClienteContas, criarManipuladorContas } from './contas.js';
import { criarGuarda } from './guarda.js';
import { criarServicoOrquestracao, criarEstadoOrquestracao } from './orquestrador/fila.js';
import { criarTriagemDev } from './orquestrador/triagem.js';
import { criarLeitorConsumo } from './orquestrador/consumo.js';
import { criarFonteClaude } from './orquestrador/fonte-consumo-claude.js';
import { criarLeitorDiarioFrota } from './orquestrador/diario-frota.js';
import { criarFonteCodex } from './orquestrador/fonte-consumo-codex.js';
import { criarVerificadorCadastro, criarIdentificadorCadastro, criarAutorizador } from './orquestrador/sso.js';
import { SessaoPainel } from './orquestrador/sessao-painel.js';
import { criarApiFrota, criarConfirmacoesFrota } from './orquestrador/api-frota.js';
import { criarApiNativo, criarConfirmacoesNativo } from './orquestrador/api-nativo.js';
import { LiberacaoNativa } from './orquestrador/liberacao-nativa.js';
import { criarEscritorHandoffPlane } from './orquestrador/handoff-plane.js';
import { criarApiHandoff, criarConfirmacoesHandoff } from './orquestrador/api-handoff.js';
import { criarApiVoz, criarTranscritorXai } from './orquestrador/voz-xai.js';
import { ProxyElevenLabs } from './orquestrador/voz-eleven.js';
import { criarEscritorGatePlane } from './orquestrador/gate-plane.js';
import { criarApiGate, criarConfirmacoesGate } from './orquestrador/api-gate.js';
import { criarApiDespacho, criarConfirmacoesDespacho } from './orquestrador/api-despacho.js';
import { criarExecutorCli } from './orquestrador/executor-cli.js';
import { criarEscritorEstadoPlane } from './orquestrador/estado-plane.js';
import { criarVigilia } from './orquestrador/vigilia.js';
import { PlayHangar } from './orquestrador/play.js';
import { criarApiPlay, criarConfirmacoesPlay } from './orquestrador/api-play.js';
import { InstanciaAgendador } from './orquestrador/agendador-instancia.js';
import { criarZelador } from './orquestrador/zelador.js';
import { criarEscritorZelador } from './orquestrador/escritor-zelador-plane.js';
import { criarServicoChaves, criarConfirmacoesChaves, criarApiChaves } from './chaves.js';
import { criarAlinhamento } from './alinhamento.js';
import { criarClientePlane, limparCachePlane } from './plane.js';
import { PROJETOS } from './projetos.js';
import { RespostaHttp } from './http/resposta.js';
import { ConversaHttp } from './http/conversa.js';
import { RotasPainel } from './http/rotas-painel.js';
import { RotasOrquestracao } from './http/rotas-orquestracao.js';
import { RotasVoz } from './http/rotas-voz.js';
import { RotasChaves } from './http/rotas-chaves.js';
import { RotasAlinhamento } from './http/rotas-alinhamento.js';
import { RotasAcoes } from './http/rotas-acoes.js';
import { propostas } from './acoes/propostas.js';
import { criarDiarioAcoes } from './acoes/diario-acoes.js';
import { criarExecutorAcoes } from './acoes/executor-acoes.js';
import { criarApiAcoes, criarConfirmacoesAcoes } from './acoes/api-acoes.js';
import { RotasDecisao } from './http/rotas-decisao.js';
import { criarMesaDecisao } from './decisao/mesa.js';
import { criarApiAbandono, criarApiDecisao, criarApiRetomada } from './decisao/api-decisao.js';
import { RotasMemoria } from './http/rotas-memoria.js';
import { criarLeitorMemoria } from './memoria/arquivo-memoria.js';
import { criarEscritorMemoria } from './memoria/escritor-memoria.js';
import { criarPendenteMemoria } from './memoria/pendente-memoria.js';
import { propostasMemoria } from './memoria/propostas-memoria.js';
import { criarDiarioConversas } from './memoria/conversas.js';
import { criarApiMemoria, criarConfirmacoesMemoria, estadoMemoria } from './memoria/api-memoria.js';
import { RoteadorPainel } from './http/roteador.js';
import { criarRegistroEncomendas } from './encomendas/registro-encomendas.js';
import { criarApiEncomendas, criarConfirmacoesEncomendas } from './encomendas/api-encomendas.js';

const PUBLICO = path.join(import.meta.dirname, 'publico');
const DIRETORIO_ESTADO = path.join(os.homedir(), '.local', 'state', 'painel-admin');
const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
const MAX_CORPO = 64 * 1024;
const MAX_MENSAGEM = 8_000;
// Inteiro do .env dentro da faixa, senão o padrão: um valor torto não vira intervalo de 0 ms.
const inteiroEntre = (valor, min, max, padrao) => { const n = Number(valor); return Number.isInteger(n) && n >= min && n <= max ? n : padrao; };
const COLETORES = { estadoProjetos, estadoProducao, lerBacklog, docsProjeto, lerModeladorProjeto, gitDetalhado, catalogoRelacoes, decisoesDoBacklog, lerHangar, lerSessoes };

// Cada identidade só escreve no projeto explicitamente autorizado. Guest
// continua exclusivamente de leitura; uma configuração parcial falha fechada.
function identidadesDeEscrita(ambiente, proprietarioId, fetchPlane, log) {
  const identidades = {};
  const chavesUsadas = new Set([ambiente.PLANE_API_KEY?.trim()]);
  for (const { sufixo, pasta } of [{ sufixo: '', pasta: 'CK3BannerLord' },
    { sufixo: 'PLAYER_', pasta: 'PlayerForM3UList' }]) {
    const chave = ambiente[`PLANE_ORQ_${sufixo}WRITE_KEY`]?.trim();
    const projetoId = ambiente[`PLANE_ORQ_${sufixo}WRITE_PROJECT_ID`]?.trim();
    const autorId = ambiente[`PLANE_ORQ_${sufixo}WRITE_ACTOR_ID`]?.trim();
    if (!chave && !projetoId && !autorId) continue;
    if (!chave || chavesUsadas.has(chave) || projetoId !== PROJETOS.find(p => p.pasta === pasta)?.plane ||
        !/^[0-9a-f-]{36}$/i.test(autorId ?? '') || !/^[1-9]\d{0,9}$/.test(proprietarioId ?? '')) {
      log(`[orquestracao] identidade ${pasta} inválida; escrita desativada para o projeto`);
      continue;
    }
    const opcoes = { chave, projetoPermitido: projetoId, autorEsperado: autorId, ...(fetchPlane ? { fetchImpl: fetchPlane } : {}) };
    try {
      identidades[projetoId] = {
        autorEscrita: autorId,
        escritorHandoff: criarEscritorHandoffPlane(opcoes),
        escritorGate: criarEscritorGatePlane(opcoes),
        escritorEstado: criarEscritorEstadoPlane(opcoes),
      };
      chavesUsadas.add(chave);
    } catch { log(`[orquestracao] identidade ${pasta} inválida; escrita desativada para o projeto`); }
  }
  return identidades;
}

/**
 * externos (todas opcionais; ausente = a dependência real):
 * - executarSsh(args, stdin): o ssh do CadastroUnico (Contas, SSO, Chaves);
 * - leituraSsh: `{ consultar() }` de /api/producao/ssh;
 * - sso: `{ verificar(token), identificar(token) }` — sem ele, o verificador por ssh;
 * - fetchPlane / consultarPlane: o fetch dos escritores e o cliente de leitura do Plane;
 * - conversar: o motor do C-3PO (LLM); transcrever e fetchVoz: xAI e ElevenLabs;
 * - spawnCli: o spawn das CLIs pagas do executor; coletores: as leituras do disco;
 * - agora: o relógio; diretorioCodex: as sessões do Codex lidas pelo consumo;
 * - ocupacaoSessoes, executarGit, arquivoChaveZelador, cliZelador: o leitor estrito de sessões,
 *   o git só-leitura, o arquivo 600 da chave e a CLI do zelador (F3).
 * - arquivoChaveAdmin: o arquivo 600 da chave do Painel Admin (mesa de decisão).
 */
export function montarPainel({ ambiente = process.env, porta = 7777, diretorioEstado = DIRETORIO_ESTADO,
  publico = PUBLICO, externos = {}, log = console.error } = {}) {
  const { executarSsh, leituraSsh, sso = {}, fetchPlane, consultarPlane, conversar = conversarReal,
    transcrever, fetchVoz, spawnCli, coletores = COLETORES, agora = Date.now, diretorioCodex,
    ocupacaoSessoes = ocupacaoPorSessoes, executarGit, arquivoChaveZelador, cliZelador, arquivoChaveAdmin } = externos;
  const diretorioOrquestracao = path.join(diretorioEstado, 'orquestracao');
  const proprietarioId = ambiente.ORQ_OWNER_USER_ID?.trim();
  const verificar = sso.verificar ?? criarVerificadorCadastro({ executar: executarSsh });
  const identificar = sso.identificar ?? criarIdentificadorCadastro({ executar: executarSsh });

  // Aba Contas (13/09/2026): cada rota vira UM comando ssh fixo executado no servidor; o
  // TOKEN_INTERNO é lido lá dentro e nunca chega a este processo (contas.js, I1).
  const manipularContas = criarManipuladorContas({ cliente: criarClienteContas({ executar: executarSsh, log }) });

  // Portão real: o executor só existe com ORQ_EXECUCAO_HABILITADA=true no .env — e, mesmo
  // assim, cada despacho ainda exige identidade de escrita do projeto, contrato, agente
  // disponível, frota válida, sessão do Cadastro Único e confirmação em duas ações. Sem a
  // variável, a rota existe para diagnóstico e falha fechada.
  const execucaoHabilitada = ambiente.ORQ_EXECUCAO_HABILITADA?.trim() === 'true';
  const executor = execucaoHabilitada && ambiente.PLANE_API_KEY?.trim()
    ? criarExecutorCli({ diretorioEstado: diretorioOrquestracao,
      consultar: consultarPlane ?? criarClientePlane({ chave: ambiente.PLANE_API_KEY.trim(), ...(fetchPlane ? { fetchImpl: fetchPlane } : {}) }),
      ...(spawnCli ? { spawn: spawnCli } : {}) })
    : null;
  if (execucaoHabilitada && !executor) log('[orquestracao] ORQ_EXECUCAO_HABILITADA sem PLANE_API_KEY: executor não construído');
  const estadoOrquestracao = criarEstadoOrquestracao({ diretorio: diretorioOrquestracao });
  const orquestracao = criarServicoOrquestracao({ identidadesEscrita: identidadesDeEscrita(ambiente, proprietarioId, fetchPlane, log),
    executor, execucaoHabilitada: Boolean(executor), consultar: consultarPlane, agora, estado: estadoOrquestracao });
  // Play por nave (F3): o dono libera o projeto por SSO + duas ações; a vigília despacha e o
  // zelador limpa só nos projetos com play ligado, e só na instância que agenda (J52).
  const play = new PlayHangar({ diretorio: diretorioOrquestracao, comTrava: estadoOrquestracao.comTrava, agora });
  const vigilia = criarVigilia({ servico: orquestracao, play, diretorioEstado: diretorioOrquestracao, agora, registrarLog: log });
  const lerConsumo = criarLeitorConsumo({ agora, fontes: { claude: criarFonteClaude({ arquivo: path.join(diretorioEstado, 'claude-uso.json') }),
    openai: criarFonteCodex(diretorioCodex ? { raiz: diretorioCodex } : {}) } });
  const consultarGuest = consultarPlane ?? (ambiente.PLANE_API_KEY?.trim() ? criarClientePlane({ chave: ambiente.PLANE_API_KEY.trim(), ...(fetchPlane ? { fetchImpl: fetchPlane } : {}) })
    : async () => { throw new Error('PLANE_API_KEY de leitura ausente'); });
  // A chave do zelador mora em arquivo 600, nunca no .env; igual a outra identidade (do .env ou
  // dos arquivos `orquestrador-*.token`/`painel-admin.token` vizinhos), recusa (J56, B28).
  const chavesProibidas = new Set(['PLANE_API_KEY', 'PLANE_ORQ_WRITE_KEY', 'PLANE_ORQ_PLAYER_WRITE_KEY'].map(k => ambiente[k]?.trim()).filter(Boolean));
  // A mesa entra mais abaixo; o zelador só a lê quando roda (B2: carta com aplicação pendente é intocável).
  let mesa = null;
  const zelador = criarZelador({ servico: orquestracao, estado: estadoOrquestracao, play, diretorio: diretorioOrquestracao, consultar: consultarGuest,
    escritor: criarEscritorZelador({ escopoPermitido: id => play.ligado(id), escopoRecibo: (id, chave) => zelador.escopoRecibo(id, chave),
      chavesProibidas, ...(fetchPlane ? { fetchImpl: fetchPlane } : {}), ...(arquivoChaveZelador ? { arquivoChave: arquivoChaveZelador } : {}) }),
    pendenciasMesa: () => mesa.servico.pendentes(),
    spawn: spawnCli ?? spawnReal, lerConsumo, ocupacao: ocupacaoSessoes, executarGit, cli: cliZelador ?? null, agora, registrarLog: log,
    intervaloMs: inteiroEntre(ambiente.ZELADOR_INTERVALO_MIN, 5, 1440, 30) * 60_000, tetoDia: inteiroEntre(ambiente.ZELADOR_TETO_DIA, 1, 100, 12) });
  const instancia = new InstanciaAgendador({ diretorio: diretorioOrquestracao, comTrava: estadoOrquestracao.comTrava,
    habilitado: ambiente.ORQ_AGENDADOR?.trim() === 'true', agora });
  // O que está rodando num projeto, para a tela do play dizer antes de desligar (J66); o job do
  // zelador vem também do lease em disco (B22). A vigília só corre na instância que agenda.
  const atividade = async (projetoId) => {
    const z = await zelador.atividade(projetoId);
    if (z) return z;
    const v = vigilia.situacao(projetoId);
    return v.varrendo && v.proximaCarta ? `despacho da vigília (${v.proximaCarta})` : null;
  };
  const estadoPlay = async () => {
    const e = await play.estado({ atividade });
    return { ...e, projetos: e.projetos.map(p => ({ ...p, despacho: vigilia.situacao(p.projeto).motivoOciosa ?? null })) };
  };
  const autorizarPrivilegiado = criarAutorizador({ verificar, proprietarioId });
  const sessaoPainel = new SessaoPainel({ identificar, proprietarioId, agora });
  const liberacaoNativa = new LiberacaoNativa({ diretorio: diretorioOrquestracao, agora });
  // Chaves: inventário só de nomes; troca em duas ações com SSO; escrita no servidor só com
  // CHAVES_SERVIDOR_ESCRITA=true depois do APROVADO do validador-deploy.
  const chaves = criarServicoChaves({ diretorioEstado, executar: executarSsh, agora,
    escritaServidorHabilitada: ambiente.CHAVES_SERVIDOR_ESCRITA?.trim() === 'true' });
  const alinhamento = criarAlinhamento({ diretorioEstado, agora, ...(consultarPlane ? { consultarPlane } : {}) });
  const confirmar = (criarApi, criarConfirmacoes, alvo) => criarApi({ autorizar: autorizarPrivilegiado, confirmacoes: criarConfirmacoes(alvo) });
  // Voz paga (xAI e ElevenLabs) só com a sessão do dono, também no loopback: com o executor
  // rodando nesta máquina, "quem alcança a porta é o dono" deixou de ser verdade (R3, PAINEL-34).
  const apiVoz = criarApiVoz({ transcrever: transcrever ?? criarTranscritorXai(fetchVoz ? { fetchImpl: fetchVoz } : {}),
    autorizar: criarAutorizador({ verificar, proprietarioId, tiposConteudo: /^audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav)(?:\s*;|$)/i }) });

  // Ações do C-3PO (fase 3): o motor só propõe em `propostas`; rodar a suíte de um projeto
  // é do dono, por SSO + duas ações, uma por vez, com diário em <estado>/c3po/acoes.jsonl.
  const apiAcoes = confirmar(criarApiAcoes, criarConfirmacoesAcoes, { propostas, executor: criarExecutorAcoes({ ambiente }),
    diario: criarDiarioAcoes({ diretorio: path.join(diretorioEstado, 'c3po') }) });

  // Encomenda de nave (PAINEL-50): o painel registra o pedido por SSO + duas ações em
  // <estado>/encomendas.jsonl; quem cria o projeto no Plane é o orquestrador.
  const encomendas = criarRegistroEncomendas({ diretorio: diretorioEstado, agora });
  // Mesa de decisão (PAINEL-53): grava a decisão do dono no Plane com a identidade Painel Admin,
  // só a lista fechada, só por SSO + duas ações, sob a mesma trava global da orquestração.
  mesa = criarMesaDecisao({ ambiente, fetchPlane, diretorio: path.join(diretorioEstado, 'c3po'), estado: estadoOrquestracao,
    agora, arquivoChave: arquivoChaveAdmin, limparCache: limparCachePlane, log });
  // Memória L1 do C-3PO (PAINEL-8): o motor lê e propõe em `propostasMemoria`; gravar é do
  // dono por SSO + duas ações (ou da reflexão noturna, fora deste processo), com histórico.
  const diretorioC3po = path.join(diretorioEstado, 'c3po');
  const memoria = { leitor: criarLeitorMemoria({ diretorio: diretorioC3po }), pendente: criarPendenteMemoria({ diretorio: diretorioC3po }) };
  const apiMemoria = confirmar(criarApiMemoria, criarConfirmacoesMemoria, { ...memoria, ambiente, agora,
    escritor: criarEscritorMemoria({ diretorio: diretorioC3po, agora }), propostas: propostasMemoria });

  const resposta = new RespostaHttp({ publico, maxCorpo: MAX_CORPO });
  const roteador = new RoteadorPainel({
    porta,
    recusa: criarGuarda(porta),
    resposta,
    // O diário de conversas é o insumo da reflexão: só pergunta e resposta, filtradas, 14 dias.
    // Só entra o turno com a sessão SSO do dono (o loopback e o executor não alimentam a reflexão).
    conversa: new ConversaHttp({ resposta, conversar, maxMensagem: MAX_MENSAGEM, log, sessao: sessaoPainel,
      diarioConversas: criarDiarioConversas({ diretorio: diretorioC3po, agora, ambiente }) }),
    voz: new RotasVoz({ resposta, proxyEleven: new ProxyElevenLabs(fetchVoz ? { fetchImpl: fetchVoz } : {}), autorizarTts: autorizarPrivilegiado }),
    painel: new RotasPainel({
      resposta, coletores, contas: manipularContas,
      // Escritas da aba Contas: o mesmo autorizador SSO das ações privilegiadas (N5).
      autorizarContas: autorizarPrivilegiado,
      sessao: sessaoPainel,
      encomendas,
      apiEncomendas: confirmar(criarApiEncomendas, criarConfirmacoesEncomendas, { registro: encomendas, agora }),
      ssh: leituraSsh ?? new LeituraSsh({ chave: CHAVE_SSH }),
    }),
    orquestracao: new RotasOrquestracao({
      resposta, orquestracao, liberacaoNativa, estadoPlay, estadoZelador: () => zelador.estado(),
      triagemDev: criarTriagemDev(consultarPlane ? { consultar: consultarPlane } : {}),
      lerConsumo,
      lerDiarioFrota: criarLeitorDiarioFrota({ diretorio: diretorioOrquestracao }),
      apiFrota: confirmar(criarApiFrota, criarConfirmacoesFrota, { servico: orquestracao }),
      apiHandoff: confirmar(criarApiHandoff, criarConfirmacoesHandoff, { servico: orquestracao }),
      apiGate: confirmar(criarApiGate, criarConfirmacoesGate, { servico: orquestracao }),
      apiDespacho: confirmar(criarApiDespacho, criarConfirmacoesDespacho, { servico: orquestracao }),
      // Play por nave: SSO + duas ações nas duas direções; o confirmar grava sob a trava global.
      apiPlay: confirmar(criarApiPlay, criarConfirmacoesPlay, { play, atividade }),
      // Jogo nativo: o dono libera por nave, com prazo, quando a Steam está livre; SSO + duas ações nas duas direções.
      apiNativo: confirmar(criarApiNativo, criarConfirmacoesNativo, { liberacao: liberacaoNativa }),
      apiVoz,
      xai: () => Boolean(ambiente.XAI_API_KEY),
    }),
    alinhamento: new RotasAlinhamento({ resposta, alinhamento }),
    chaves: new RotasChaves({ resposta, chaves, apiChaves: confirmar(criarApiChaves, criarConfirmacoesChaves, { servico: chaves }) }),
    acoes: new RotasAcoes({ resposta, apiAcoes }),
    decisao: new RotasDecisao({ resposta, servico: mesa.servico, log,
      apiDecisao: criarApiDecisao({ autorizar: autorizarPrivilegiado, confirmacoes: mesa.confirmacoes }),
      apiRetomada: criarApiRetomada({ autorizar: autorizarPrivilegiado, confirmacoes: mesa.retomada }),
      apiAbandono: criarApiAbandono({ autorizar: autorizarPrivilegiado, confirmacoes: mesa.abandono }) }),
    memoria: new RotasMemoria({ resposta, apiMemoria, lerEstado: () => estadoMemoria(memoria) }),
  });

  return {
    atender: (req, res) => roteador.atender(req, res),
    // Os laços e a reconciliação ficam fora da montagem: um teste monta sem ligar nada.
    iniciar() {
      // Lease deixado por queda entre RESULTADO e sua remoção é reconciliado no arranque
      // (só metadado local; lease ainda válido de outro processo nunca é tomado).
      orquestracao.recuperarInterrupcoes().catch(e => log('[orquestracao] reconciliação no arranque falhou:', e.message));
      // A migração do toggle antigo vem antes de qualquer agendamento (resposta à P2).
      // B21: quem não tomou a trava do agendador no arranque tenta de novo a cada 5 min.
      const ligarAgendador = async ({ motivo }) => {
        if (motivo) log(`[agendador] ${motivo}`);
        await zelador.recuperar().catch(e => log('[zelador] recuperação no arranque falhou:', e.message));
        const podeAgendar = () => instancia.podeAgendar();
        vigilia.iniciar(podeAgendar);
        zelador.iniciar(podeAgendar);
      };
      play.migrar().catch(e => log('[play] migração do toggle da vigília falhou:', e.message))
        .then(() => instancia.tomarEVigiar(ligarAgendador))
        .then(({ agenda, motivo }) => { if (!agenda && motivo) log(`[agendador] ${motivo}`); })
        .catch(e => log('[agendador] não iniciou:', e.message));
      alinhamento.iniciar();
    },
  };
}
