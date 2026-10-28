// Servidor único do painel-admin desde a fusão de 14/08/2026: dashboard na
// raiz (/), Severino em /severino/, e toda a API na mesma porta 7777.
// Escuta só em 127.0.0.1, NUNCA em 0.0.0.0, e não tem autenticação: fora do
// loopback, a única entrada é a borda do tailnet, restrita ao Windows do dono
// (06/10/2026); Host e origem são conferidos em guarda.js.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { estadoProjetos, estadoProducao, lerBacklog, docsProjeto, lerModeladorProjeto, gitDetalhado, catalogoRelacoes, decisoesDoBacklog } from './coletores.js';
import { conversar } from './motor.js';
import { criarClienteContas, criarManipuladorContas } from './contas.js';
import { criarGuarda } from './guarda.js';
import { criarServicoOrquestracao } from './orquestrador/fila.js';
import { criarTriagemDev } from './orquestrador/triagem.js';
import { criarLeitorConsumo } from './orquestrador/consumo.js';
import { criarEscritorPerfilPlane } from './orquestrador/perfil-plane.js';
import { criarVerificadorCadastro, criarAutorizador } from './orquestrador/sso.js';
import { criarConfirmacoes } from './orquestrador/confirmacoes.js';
import { criarApiPerfil } from './orquestrador/api-perfil.js';
import { criarEscritorHandoffPlane } from './orquestrador/handoff-plane.js';
import { criarApiHandoff, criarConfirmacoesHandoff } from './orquestrador/api-handoff.js';
import { criarApiVoz, criarAutorizadorVoz } from './orquestrador/voz-xai.js';
import { ProxyElevenLabs } from './orquestrador/voz-eleven.js';
import { criarEscritorGatePlane } from './orquestrador/gate-plane.js';
import { criarApiGate, criarConfirmacoesGate } from './orquestrador/api-gate.js';
import { criarApiDespacho, criarConfirmacoesDespacho } from './orquestrador/api-despacho.js';
import { criarExecutorCli } from './orquestrador/executor-cli.js';
import { criarLeitorCanalLegado } from './orquestrador/canal-legado.js';
import { criarEscritorEstadoPlane } from './orquestrador/estado-plane.js';
import { criarVigilia } from './orquestrador/vigilia.js';
import { criarApiVigilia, criarConfirmacoesVigilia } from './orquestrador/api-vigilia.js';
import { criarServicoChaves, criarConfirmacoesChaves, criarApiChaves } from './chaves.js';
import { criarAlinhamento } from './alinhamento.js';
import { criarClientePlane } from './plane.js';
import { PROJETOS } from './projetos.js';
import { RespostaHttp } from './http/resposta.js';
import { ConversaHttp } from './http/conversa.js';
import { LeituraSsh } from './http/ssh-leitura.js';
import { RotasPainel } from './http/rotas-painel.js';
import { RotasOrquestracao } from './http/rotas-orquestracao.js';
import { RotasVoz } from './http/rotas-voz.js';
import { RotasChaves } from './http/rotas-chaves.js';
import { RotasAlinhamento } from './http/rotas-alinhamento.js';
import { RoteadorPainel } from './http/roteador.js';

// Aba Contas (13/09/2026): /api/contas/* — administração do CadastroUnico.
// Cada rota vira UM comando ssh fixo executado no servidor; o TOKEN_INTERNO
// é lido lá dentro e nunca chega a este processo (contas.js, I1).
const manipularContas = criarManipuladorContas({ cliente: criarClienteContas() });

// Defesa em profundidade para o .env: o `npm start` já passa
// --env-file-if-exists, mas o gatilho do workspace da raiz sobe o servidor
// com `node servidor.js` seco — sem esta carga, a chave da ElevenLabs não
// existiria nesse caminho. loadEnvFile não sobrescreve variável já definida;
// caminho absoluto porque o cwd de quem nos inicia varia.
try {
  process.loadEnvFile(path.join(import.meta.dirname, '.env'));
} catch {
  // sem .env é estado normal (a camada ElevenLabs fica indisponível e avisa)
}

const PORTA = Number(process.env.PORTA ?? 7777);
const PUBLICO = path.join(import.meta.dirname, 'publico');
const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
const MAX_CORPO = 64 * 1024;
const MAX_MENSAGEM = 8_000;
const proxyEleven = new ProxyElevenLabs();
const recusaDaGuarda = criarGuarda(PORTA);
const proprietarioId = process.env.ORQ_OWNER_USER_ID?.trim();
// Cada identidade só escreve no projeto explicitamente autorizado. Guest
// continua exclusivamente de leitura; uma configuração parcial falha fechada.
const identidadesEscrita = {};
const chavesUsadas = new Set([process.env.PLANE_API_KEY?.trim()]);
for (const { sufixo, pasta } of [{ sufixo: '', pasta: 'CK3BannerLord' },
  { sufixo: 'PLAYER_', pasta: 'PlayerForM3UList' }]) {
  const chave = process.env[`PLANE_ORQ_${sufixo}WRITE_KEY`]?.trim();
  const projetoId = process.env[`PLANE_ORQ_${sufixo}WRITE_PROJECT_ID`]?.trim();
  const autorId = process.env[`PLANE_ORQ_${sufixo}WRITE_ACTOR_ID`]?.trim();
  if (!chave && !projetoId && !autorId) continue;
  if (!chave || chavesUsadas.has(chave) || projetoId !== PROJETOS.find(p => p.pasta === pasta)?.plane ||
      !/^[0-9a-f-]{36}$/i.test(autorId ?? '') || !/^[1-9]\d{0,9}$/.test(proprietarioId ?? '')) {
    console.error(`[orquestracao] identidade ${pasta} inválida; escrita desativada para o projeto`);
    continue;
  }
  try {
    identidadesEscrita[projetoId] = {
      autorEscrita: autorId,
      escritorPerfil: criarEscritorPerfilPlane({ chave, projetoPermitido: projetoId, autorEsperado: autorId }),
      escritorHandoff: criarEscritorHandoffPlane({ chave, projetoPermitido: projetoId, autorEsperado: autorId }),
      escritorGate: criarEscritorGatePlane({ chave, projetoPermitido: projetoId, autorEsperado: autorId }),
      escritorEstado: criarEscritorEstadoPlane({ chave, projetoPermitido: projetoId, autorEsperado: autorId }),
    };
    chavesUsadas.add(chave);
  } catch { console.error(`[orquestracao] identidade ${pasta} inválida; escrita desativada para o projeto`); }
}
// Portão real: o executor só existe com ORQ_EXECUCAO_HABILITADA=true no .env — e, mesmo
// assim, cada despacho ainda exige identidade de escrita do projeto, contrato, agente
// disponível, perfil no card, sessão do Cadastro Único e confirmação em duas ações. Sem a
// variável, a rota existe para diagnóstico e falha fechada.
const execucaoHabilitada = process.env.ORQ_EXECUCAO_HABILITADA?.trim() === 'true';
const executor = execucaoHabilitada && process.env.PLANE_API_KEY?.trim()
  ? criarExecutorCli({ diretorioEstado: path.join(os.homedir(), '.local', 'state', 'painel-admin', 'orquestracao'),
    consultar: criarClientePlane({ chave: process.env.PLANE_API_KEY.trim() }) })
  : null;
if (execucaoHabilitada && !executor) console.error('[orquestracao] ORQ_EXECUCAO_HABILITADA sem PLANE_API_KEY: executor não construído');
const orquestracao = criarServicoOrquestracao({ identidadesEscrita, executor, execucaoHabilitada: Boolean(executor) });
// Lease deixado por queda entre RESULTADO e sua remoção é reconciliado no arranque
// (só metadado local; lease ainda válido de outro processo nunca é tomado).
orquestracao.recuperarInterrupcoes().catch(e => console.error('[orquestracao] reconciliação no arranque falhou:', e.message));
// Vigília: só despacha com executor ligado e projeto ligado pelo dono (SSO + confirmação);
// o laço existe sempre, para a aba mostrar estado e diário.
const vigilia = criarVigilia({ servico: orquestracao, diretorioEstado: path.join(os.homedir(), '.local', 'state', 'painel-admin', 'orquestracao'),
  registrarLog: mensagem => console.error(mensagem) });
vigilia.iniciar();
const triagemDev = criarTriagemDev();
const lerConsumoIas = criarLeitorConsumo();
const lerCanalLegado = criarLeitorCanalLegado();
const autorizarPrivilegiado = criarAutorizador({ verificar: criarVerificadorCadastro(), proprietarioId });
const apiPerfil = criarApiPerfil({
  autorizar: autorizarPrivilegiado,
  confirmacoes: criarConfirmacoes({ servico: orquestracao }),
});
const apiHandoff = criarApiHandoff({ autorizar: autorizarPrivilegiado,
  confirmacoes: criarConfirmacoesHandoff({ servico: orquestracao }) });
const apiGate = criarApiGate({ autorizar: autorizarPrivilegiado,
  confirmacoes: criarConfirmacoesGate({ servico: orquestracao }) });
// Com o executor desligado a rota falha fechada; ligado, continua atrás de SSO e confirmação.
const apiVigilia = criarApiVigilia({ autorizar: autorizarPrivilegiado, confirmacoes: criarConfirmacoesVigilia({ vigilia }) });
// Chaves: inventário só de nomes; troca em duas ações com SSO; escrita no servidor só com
// CHAVES_SERVIDOR_ESCRITA=true depois do APROVADO do validador-deploy.
const chaves = criarServicoChaves();
const alinhamento = criarAlinhamento();
alinhamento.iniciar();
const apiChaves = criarApiChaves({ autorizar: autorizarPrivilegiado, confirmacoes: criarConfirmacoesChaves({ servico: chaves }) });
const apiDespacho = criarApiDespacho({ autorizar: autorizarPrivilegiado,
  confirmacoes: criarConfirmacoesDespacho({ servico: orquestracao }) });
const apiVoz = criarApiVoz({ autorizar: criarAutorizadorVoz({
  privilegiado: criarAutorizador({ verificar: criarVerificadorCadastro(), proprietarioId,
    tiposConteudo: /^audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav)(?:\s*;|$)/i }),
  porta: PORTA,
}) });


const resposta = new RespostaHttp({ publico: PUBLICO, maxCorpo: MAX_CORPO });
const roteador = new RoteadorPainel({
  porta: PORTA,
  recusa: recusaDaGuarda,
  resposta,
  conversa: new ConversaHttp({ resposta, conversar, maxMensagem: MAX_MENSAGEM }),
  voz: new RotasVoz({ resposta, proxyEleven }),
  painel: new RotasPainel({
    resposta,
    coletores: { estadoProjetos, estadoProducao, lerBacklog, docsProjeto, lerModeladorProjeto, gitDetalhado, catalogoRelacoes, decisoesDoBacklog },
    contas: manipularContas,
    ssh: new LeituraSsh({ chave: CHAVE_SSH }),
  }),
  orquestracao: new RotasOrquestracao({
    resposta, orquestracao, triagemDev, lerConsumo: lerConsumoIas, vigilia, lerCanalLegado,
    apiPerfil, apiHandoff, apiGate, apiDespacho, apiVigilia, apiVoz,
    xai: () => Boolean(process.env.XAI_API_KEY),
  }),
  alinhamento: new RotasAlinhamento({ resposta, alinhamento }),
  chaves: new RotasChaves({ resposta, chaves, apiChaves }),
});

const servidor = http.createServer((req, res) => roteador.atender(req, res));

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel administrativo (com o Severino a bordo) em http://localhost:${PORTA}`);
});
