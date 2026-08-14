// Servidor do painel administrativo local. Zero dependências: Node embutido.
// Coleta git/portas ao vivo a cada requisição — sem cache, o painel é pessoal
// e o custo é irrisório.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJETOS, PRODUCAO_EXTRA } from './projetos.js';

const execFileAsync = promisify(execFile);

const PORTA = Number(process.env.PORTA ?? 7777);
const RAIZ = path.resolve(import.meta.dirname, '..');
const PUBLICO = path.join(import.meta.dirname, 'publico');
const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');

// ---------- coleta local ----------

async function git(dir, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args]);
  return stdout.trim();
}

async function infoGit(dir) {
  try {
    const branch = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
    const [data, assunto] = (await git(dir, 'log', '-1', '--format=%cI%x09%s')).split('\t');
    const sujos = (await git(dir, 'status', '--porcelain'))
      .split('\n')
      .filter(Boolean).length;
    return { repositorio: true, branch, ultimoCommit: { data, assunto }, arquivosSujos: sujos };
  } catch {
    return { repositorio: false };
  }
}

function portaAberta(porta) {
  return new Promise((resolve) => {
    const soquete = net.createConnection({ host: '127.0.0.1', port: porta, timeout: 600 });
    soquete.once('connect', () => { soquete.destroy(); resolve(true); });
    soquete.once('error', () => resolve(false));
    soquete.once('timeout', () => { soquete.destroy(); resolve(false); });
  });
}

async function coletarProjeto(projeto) {
  const caminho = path.join(RAIZ, projeto.pasta);
  let existe = true;
  try {
    await fs.access(caminho);
  } catch {
    existe = false;
  }

  const caminhoRepo = projeto.subRepo ? path.join(caminho, projeto.subRepo) : caminho;
  const [gitInfo, portas] = await Promise.all([
    existe ? infoGit(caminhoRepo) : { repositorio: false },
    Promise.all(
      projeto.portas.map(async (p) => ({ ...p, ativa: await portaAberta(p.porta) })),
    ),
  ]);

  return {
    pasta: projeto.pasta,
    titulo: projeto.titulo,
    descricao: projeto.descricao,
    stack: projeto.stack,
    entrada: projeto.entrada,
    producao: projeto.producao ?? null,
    existe,
    git: gitInfo,
    portas,
  };
}

// ---------- sondas de produção ----------

function sondar(url) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const req = https.get(url, { timeout: 6000 }, (res) => {
      res.resume();
      resolve({ url, ok: res.statusCode < 500, status: res.statusCode, ms: Date.now() - inicio });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', (erro) => resolve({ url, ok: false, erro: erro.message }));
  });
}

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

// ---------- HTTP ----------

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
  const nome = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const alvo = path.join(PUBLICO, nome);
  // Nunca servir fora de publico/ (path traversal).
  if (!alvo.startsWith(PUBLICO + path.sep) && alvo !== path.join(PUBLICO, 'index.html')) {
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

const servidor = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  try {
    if (pathname === '/api/projetos') {
      responderJson(res, { raiz: RAIZ, projetos: await Promise.all(PROJETOS.map(coletarProjeto)) });
    } else if (pathname === '/api/producao') {
      const alvos = [
        ...PROJETOS.filter((p) => p.producao).map((p) => ({ rotulo: p.titulo, url: p.producao })),
        ...PRODUCAO_EXTRA,
      ];
      const sondas = await Promise.all(
        alvos.map(async (a) => ({ rotulo: a.rotulo, ...(await sondar(a.url)) })),
      );
      responderJson(res, { sondas });
    } else if (pathname === '/api/producao/ssh') {
      responderJson(res, await consultarServidorSsh());
    } else {
      await responderEstatico(res, pathname);
    }
  } catch (erro) {
    responderJson(res, { erro: erro.message }, 500);
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel administrativo em http://localhost:${PORTA}`);
});
