// Servidor único do painel-admin desde a fusão de 14/08/2026: dashboard na
// raiz (/), Severino em /severino/, e toda a API na mesma porta 7777.
// Localhost only: escuta em 127.0.0.1 e NUNCA em 0.0.0.0 — sem autenticação
// justamente porque a porta não sai da máquina.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { estadoProjetos, estadoProducao, lerBacklog, docsProjeto, lerModeladorProjeto, gitDetalhado } from './coletores.js';
import { conversar } from './motor.js';

const execFileAsync = promisify(execFile);

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
