// Coletores de estado do painel — módulo compartilhado entre as rotas HTTP
// (/api/projetos, /api/producao) e as ferramentas do motor do Severino.
// Desde a fusão de 14/08/2026 o motor chama estas funções DIRETO, em
// processo — sem HTTP para si mesmo. Coleta ao vivo a cada chamada — sem
// cache, o painel é pessoal e o custo é irrisório.

import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJETOS, PRODUCAO_EXTRA } from './projetos.js';

const execFileAsync = promisify(execFile);

// A raiz "Projetos Pessoais" fica um nível acima deste repo.
export const RAIZ = path.resolve(import.meta.dirname, '..');

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

// ---------- as duas visões compartilhadas ----------

export async function estadoProjetos() {
  return { raiz: RAIZ, projetos: await Promise.all(PROJETOS.map(coletarProjeto)) };
}

export async function estadoProducao() {
  const alvos = [
    ...PROJETOS.filter((p) => p.producao).map((p) => ({ rotulo: p.titulo, url: p.producao })),
    ...PRODUCAO_EXTRA,
  ];
  const sondas = await Promise.all(
    alvos.map(async (a) => ({ rotulo: a.rotulo, ...(await sondar(a.url)) })),
  );
  return { sondas };
}
