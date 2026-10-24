// Servidor único do painel-admin desde a fusão de 14/08/2026: dashboard na
// raiz (/), Severino em /severino/, e toda a API na mesma porta 7777.
// Escuta só em 127.0.0.1, NUNCA em 0.0.0.0, e não tem autenticação: fora do
// loopback, a única entrada é a borda do tailnet, restrita ao Windows do dono
// (06/10/2026); Host e origem são conferidos em guarda.js.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { criarApiVoz } from './orquestrador/voz-xai.js';
import { criarEscritorGatePlane } from './orquestrador/gate-plane.js';
import { criarApiGate, criarConfirmacoesGate } from './orquestrador/api-gate.js';
import { criarApiDespacho, criarConfirmacoesDespacho } from './orquestrador/api-despacho.js';
import { criarExecutorCli } from './orquestrador/executor-cli.js';
import { criarLeitorCanalLegado } from './orquestrador/canal-legado.js';
import { criarClientePlane } from './plane.js';
import { PROJETOS } from './projetos.js';

const execFileAsync = promisify(execFile);

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
const MAX_TEXTO_TTS = 4_000;
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
const apiDespacho = criarApiDespacho({ autorizar: autorizarPrivilegiado,
  confirmacoes: criarConfirmacoesDespacho({ servico: orquestracao }) });
const apiVoz = criarApiVoz({ autorizar: criarAutorizador({ verificar: criarVerificadorCadastro(), proprietarioId,
  tiposConteudo: /^audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav)(?:\s*;|$)/i }) });

// Camada 3 da voz do Severino: a chave vive só no processo (.env local) e
// JAMAIS aparece em log, erro ou resposta. Voice_id default é o do quickstart
// público da ElevenLabs ("George", multilíngue, serve pt-BR) — troca por
// ELEVENLABS_VOZ_ID no .env sem tocar código.
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const VOZ_ID_PADRAO = 'JBFqnCBsd6RMkjVDRZzb';
// eleven_multilingual_v2 é o modelo de qualidade para pt-BR na doc pública
// (flash_v2_5 é mais barato/rápido, mas o timbre era a queixa do dono).
const MODELO_TTS = 'eleven_multilingual_v2';

// ---------- consulta SSH sob demanda (somente leitura) ----------

// Consulta somente-leitura ao servidor. Roda apenas sob demanda (botão no
// painel), nunca no refresh automático — SSH a cada 30 s seria abuso.
const COMANDO_SSH = [
  "echo '== uptime =='; uptime -p",
  "echo; echo '== systemd =='",
  'for s in corre-do-tarado caddy; do printf "%s: " "$s"; systemctl is-active "$s"; done',
  "echo; echo '== docker =='; docker ps --format '{{.Names}}\t{{.Status}}'",
  "echo; echo '== disco =='; df -h / | tail -1",
  "echo; echo '== memoria =='; free -h | head -2",
].join('; ');

async function consultarServidorSsh() {
  try {
    const { stdout } = await execFileAsync(
      'ssh',
      [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        '-i', CHAVE_SSH,
        'linuxuser@astargne.com',
        COMANDO_SSH,
      ],
      { timeout: 30_000 },
    );
    return { ok: true, saida: stdout };
  } catch (erro) {
    return { ok: false, erro: erro.stderr?.trim() || erro.message };
  }
}

// ---------- HTTP: utilitários ----------

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function responderJson(res, corpo, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

async function responderEstatico(res, urlPath) {
  // Caminho terminado em "/" serve o index.html da pasta — é o que faz
  // /severino/ abrir o chat com os assets relativos dele resolvendo certo.
  const nome = (urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath).slice(1);
  const alvo = path.resolve(PUBLICO, nome);
  // Nunca servir fora de publico/ (path traversal).
  if (!alvo.startsWith(PUBLICO + path.sep)) {
    responderJson(res, { erro: 'caminho inválido' }, 400);
    return;
  }
  try {
    const conteudo = await fs.readFile(alvo);
    res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream' });
    res.end(conteudo);
  } catch {
    responderJson(res, { erro: 'não encontrado' }, 404);
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;
    req.on('data', (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > MAX_CORPO) {
        reject(new Error('corpo grande demais'));
        req.destroy();
        return;
      }
      pedacos.push(pedaco);
    });
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- conversa com o Severino (SSE) ----------

// A resposta pinga token a token: cada evento do motor vira um evento SSE
// escrito na hora (chunked). Buffering aqui seria defeito, não detalhe.
async function responderConversa(req, res) {
  let corpo;
  try {
    corpo = JSON.parse(await lerCorpo(req));
  } catch {
    responderJson(res, { erro: 'corpo inválido: mande JSON {"mensagem": "...", "sessao": "..."}' }, 400);
    return;
  }
  const mensagem = typeof corpo.mensagem === 'string' ? corpo.mensagem.trim() : '';
  const sessao = typeof corpo.sessao === 'string' && corpo.sessao ? corpo.sessao : undefined;
  if (!mensagem || mensagem.length > MAX_MENSAGEM) {
    responderJson(res, { erro: `"mensagem" precisa ser texto de 1 a ${MAX_MENSAGEM} caracteres` }, 400);
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.flushHeaders?.();

  let clienteVivo = true;
  res.on('close', () => { clienteVivo = false; });

  try {
    for await (const evento of conversar(mensagem, sessao)) {
      if (!clienteVivo) break; // o `finally` do motor interrompe a consulta
      const { tipo, ...dados } = evento;
      res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
    }
  } catch (erro) {
    if (clienteVivo) {
      // Mensagem genérica de propósito: erro de auth/SDK não vaza detalhe de credencial.
      console.error('[conversa]', erro);
      res.write(`event: erro\ndata: ${JSON.stringify({ mensagem: 'falha no motor do Severino — veja o log do servidor' })}\n\n`);
    }
  }
  if (clienteVivo) res.end();
}

// ---------- voz do Severino (proxy ElevenLabs) ----------

// Proxy de streaming do TTS (camada ElevenLabs): o front nunca vê a chave e o
// áudio pinga para o cliente conforme chega. Sem chave → 503 com motivo
// NOMEADO em JSON — é o que o front usa para cair DECLARADAMENTE para o
// Antônio (nunca 500 genérico, contrato do upgrade).
async function responderTts(req, res) {
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) {
    responderJson(res, {
      motivo: 'sem-chave-elevenlabs',
      mensagem: 'ELEVENLABS_API_KEY ausente no ambiente — grave a chave em painel-admin/.env e reinicie o servidor',
    }, 503);
    return;
  }

  let corpo;
  try {
    corpo = JSON.parse(await lerCorpo(req));
  } catch {
    responderJson(res, { erro: 'corpo inválido: mande JSON {"texto": "..."}' }, 400);
    return;
  }
  const texto = typeof corpo.texto === 'string' ? corpo.texto.trim() : '';
  if (!texto || texto.length > MAX_TEXTO_TTS) {
    responderJson(res, { erro: `"texto" precisa ser texto de 1 a ${MAX_TEXTO_TTS} caracteres` }, 400);
    return;
  }

  // Cliente desistiu (calar, pergunta nova, aba fechada) → aborta o upstream:
  // não adianta baixar áudio que ninguém vai ouvir.
  const controlador = new AbortController();
  res.on('close', () => controlador.abort());

  const vozId = process.env.ELEVENLABS_VOZ_ID || VOZ_ID_PADRAO;
  let upstream;
  try {
    upstream = await fetch(
      `${ELEVENLABS_URL}/${encodeURIComponent(vozId)}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': chave, 'content-type': 'application/json' },
        body: JSON.stringify({ text: texto, model_id: MODELO_TTS }),
        signal: controlador.signal,
      },
    );
  } catch (erro) {
    if (controlador.signal.aborted) return;
    console.error('[tts] ElevenLabs inalcançável:', erro?.cause?.code ?? erro.message);
    responderJson(res, {
      motivo: 'elevenlabs-inalcancavel',
      mensagem: 'não alcancei a API da ElevenLabs — sem internet ou serviço fora',
    }, 502);
    return;
  }

  if (!upstream.ok) {
    // Genérico de propósito (regra 5 dos padrões gerais): a resposta não diz
    // SE a chave é inválida ou a conta está sem saldo — o detalhe fica no log
    // do servidor, que nunca contém a chave.
    const detalhe = await upstream.text().catch(() => '');
    console.error(`[tts] ElevenLabs respondeu ${upstream.status}:`, detalhe.slice(0, 300));
    responderJson(res, {
      motivo: 'elevenlabs-recusou',
      mensagem: `a ElevenLabs recusou a síntese (HTTP ${upstream.status}) — detalhe no log do servidor`,
    }, 502);
    return;
  }

  res.writeHead(200, { 'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg' });
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    res.destroy(); // cliente fechou no meio do áudio — normal, não é erro nosso
  }
}

// ---------- roteamento ----------

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  const { pathname } = url;
  const recusa = recusaDaGuarda({
    metodo: req.method,
    host: req.headers.host,
    origem: req.headers.origin,
    secFetchSite: req.headers['sec-fetch-site'],
  });
  if (recusa) {
    responderJson(res, { erro: recusa.erro }, recusa.status);
    return;
  }
  try {
    if (pathname === '/api/conversa' && req.method === 'POST') {
      await responderConversa(req, res);
    } else if (pathname === '/api/conversa') {
      responderJson(res, { erro: 'use POST' }, 405);
    } else if (pathname === '/api/tts' && req.method === 'POST') {
      await responderTts(req, res);
    } else if (pathname === '/api/tts' && req.method === 'GET') {
      // Sonda barata de disponibilidade (não sintetiza nada): o front usa
      // para declarar a camada de voz ativa já na carga da página. Só diz SE
      // há chave configurada — nunca a chave.
      responderJson(res, process.env.ELEVENLABS_API_KEY
        ? { disponivel: true }
        : { disponivel: false, motivo: 'sem-chave-elevenlabs' });
    } else if (pathname === '/api/tts') {
      responderJson(res, { erro: 'use POST (sintetizar) ou GET (disponibilidade)' }, 405);
    } else if (pathname === '/api/projetos') {
      responderJson(res, await estadoProjetos());
    } else if (pathname.startsWith('/api/projetos/') && pathname.endsWith('/docs')) {
      // Página de projeto (20/08/2026): docs modeladores + curados
      // (arquitetura/objetos/data-flow) de UM projeto — mesma mecânica de
      // leitura segura que a ferramenta docs_projeto do Severino usa.
      // Com ?arquivo=, devolve o conteúdo de UM modelador específico (clique
      // na lista) em vez do pacote completo.
      const pasta = decodeURIComponent(pathname.slice('/api/projetos/'.length, -'/docs'.length));
      const arquivo = url.searchParams.get('arquivo');
      responderJson(res, arquivo ? await lerModeladorProjeto(pasta, arquivo) : await docsProjeto(pasta));
    } else if (pathname.startsWith('/api/projetos/') && pathname.endsWith('/git')) {
      // Página de projeto (20/08/2026): diff --stat + commits não enviados
      // ao remoto — só sob demanda, nunca no refresh de 60s da grade.
      const pasta = decodeURIComponent(pathname.slice('/api/projetos/'.length, -'/git'.length));
      responderJson(res, await gitDetalhado(pasta));
    } else if (pathname === '/api/producao') {
      responderJson(res, await estadoProducao());
    } else if (pathname === '/api/producao/ssh') {
      responderJson(res, await consultarServidorSsh());
    } else if (pathname === '/api/backlog') {
      responderJson(res, await lerBacklog());
    } else if (pathname === '/api/decisoes') {
      // Pesada (git log -L por decisão) — sob demanda, nunca no polling de
      // 60s do front (mesma régua de gitDetalhado/SSH).
      responderJson(res, await decisoesDoBacklog());
    } else if (pathname === '/api/orquestracao' && req.method === 'GET') {
      responderJson(res, await orquestracao.fila());
    } else if (pathname === '/api/orquestracao/triagem-dev' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      responderJson(res, await triagemDev());
    } else if (pathname === '/api/orquestracao/prontidao' && req.method === 'GET') {
      try {
        responderJson(res, await orquestracao.preavaliar(url.searchParams.get('carta'), url.searchParams.get('gate')));
      } catch (erro) {
        responderJson(res, { erro: erro.message }, 422);
      }
    } else if (pathname === '/api/orquestracao/canal' && req.method === 'GET') {
      try { responderJson(res, await orquestracao.canal(url.searchParams.get('carta'), url.searchParams.get('projeto'))); }
      catch (erro) { responderJson(res, { erro: erro.message }, 422); }
    } else if (pathname === '/api/orquestracao/modelos' && req.method === 'GET') {
      try { responderJson(res, await orquestracao.modelos(url.searchParams.get('carta'))); }
      catch (erro) { responderJson(res, { erro: erro.message }, 422); }
    } else if (pathname === '/api/orquestracao/modelos/validar' && req.method === 'POST') {
      try {
        const corpo = JSON.parse(await lerCorpo(req));
        responderJson(res, await orquestracao.validarModelos(corpo.carta, corpo.selecoes));
      } catch (erro) { responderJson(res, { erro: erro.message }, 422); }
    } else if ((pathname === '/api/orquestracao/modelos/preparar' || pathname === '/api/orquestracao/modelos/confirmar') && req.method === 'POST') {
      const { status, corpo } = await apiPerfil(req, pathname, lerCorpo);
      res.setHeader('cache-control', 'no-store');
      responderJson(res, corpo, status);
    } else if ((pathname === '/api/orquestracao/handoff/preparar' || pathname === '/api/orquestracao/handoff/confirmar') && req.method === 'POST') {
      const { status, corpo } = await apiHandoff(req, pathname, lerCorpo);
      res.setHeader('cache-control', 'no-store');
      responderJson(res, corpo, status);
    } else if ((pathname === '/api/orquestracao/gates/preparar' || pathname === '/api/orquestracao/gates/confirmar') && req.method === 'POST') {
      const { status, corpo } = await apiGate(req, pathname, lerCorpo);
      res.setHeader('cache-control', 'no-store');
      responderJson(res, corpo, status);
    } else if ((pathname === '/api/orquestracao/despacho/preparar' || pathname === '/api/orquestracao/despacho/confirmar') && req.method === 'POST') {
      const { status, corpo } = await apiDespacho(req, pathname, lerCorpo);
      res.setHeader('cache-control', 'no-store');
      responderJson(res, corpo, status);
    } else if (pathname === '/api/orquestracao/consumo' && req.method === 'GET') {
      responderJson(res, await lerConsumoIas());
    } else if (pathname === '/api/orquestracao/legado' && req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      responderJson(res, await lerCanalLegado());
    } else if (pathname === '/api/orquestracao/voz/transcrever' && req.method === 'POST') {
      const { status, corpo } = await apiVoz(req);
      res.setHeader('cache-control', 'no-store');
      responderJson(res, corpo, status);
    } else if (pathname === '/api/orquestracao/simular' && req.method === 'POST') {
      try {
        const corpo = JSON.parse(await lerCorpo(req));
        if (typeof corpo.carta !== 'string' || typeof corpo.comando !== 'string') throw new Error('carta e comando obrigatórios');
        responderJson(res, await orquestracao.simular(corpo.carta, corpo.comando, corpo.selecoes ?? null));
      } catch (erro) {
        responderJson(res, { erro: erro.message }, 422);
      }
    } else if (pathname.startsWith('/api/orquestracao')) {
      responderJson(res, { erro: 'escrita e execução indisponíveis nesta etapa' }, 405);
    } else if (pathname === '/api/relacoes') {
      responderJson(res, await catalogoRelacoes());
    } else if (pathname.startsWith('/api/contas/')) {
      // GET apps|usuarios|convites · POST convites · POST convites/:id/reenviar
      // · DELETE convites/:id · PUT usuarios/:id/permissoes · POST
      // usuarios/:id/desativar|reativar|redefinir — tabela fechada em
      // contas.js; o corpo (quando há) vai ao servidor pelo stdin do ssh.
      // Sob demanda apenas (a aba recarrega ao abrir e após cada ação),
      // nunca no polling de 60s: cada chamada é um ssh de verdade.
      const corpoTexto = req.method === 'GET' ? '' : await lerCorpo(req);
      const { status, corpo } = await manipularContas(req.method, pathname, corpoTexto);
      responderJson(res, corpo, status);
    } else if (pathname === '/severino' && req.method === 'GET') {
      // Sem a barra final os assets relativos do chat resolveriam na raiz
      // (estilo do dashboard em vez do estilo do chat).
      res.writeHead(301, { location: '/severino/' });
      res.end();
    } else if (req.method === 'GET') {
      await responderEstatico(res, pathname);
    } else {
      responderJson(res, { erro: 'método não suportado' }, 405);
    }
  } catch (erro) {
    console.error('[servidor]', erro);
    if (!res.headersSent) responderJson(res, { erro: 'erro interno' }, 500);
    else res.end();
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel administrativo (com o Severino a bordo) em http://localhost:${PORTA}`);
});
