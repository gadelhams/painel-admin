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

// ---------- backlog (aba Backlog: fase 1, só-leitura) ----------

// O markdown de backlog é a VERDADE; isto aqui é só projeção (decisão de
// desenho em docs/02_ABA_BACKLOG.md). Por isso: sem cache — cada chamada
// relê o working tree, mais fresco que qualquer push — e nada é escrito.
// A gramática é a da seção "Como este arquivo funciona" do
// SistemaLoreEngine/docs/39_BACKLOG.md — mudou lá, muda aqui NA MESMA ENTREGA.

// Os tokens de estado vêm entre CRASES no arquivo real (`[ ]`/`[x]`); as
// crases são opcionais aqui para um deslize de formatação não sumir com item.
const RE_FEATURE = /^##\s+(.*)$/;
const RE_TOKEN = /`?\[([ x])\]`?/;
const RE_ITEM = /^(\s*)-\s+`?\[([ x])\]`?\s*(.*)$/;
const RE_LISTA = /^\s*-\s+/;
const RE_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
// (?![\p{L}]) impede "(DONOSA...)" de contar como DONO; o resto do parêntese
// é aceito porque as variantes reais trazem texto extra ("(DONO, com dado)",
// "(CONGELADA — doc 23 §5)").
const RE_TAG = /\((DONO|EMPÍRICA|SEM ESCOPO|CONGELADA|BLOQUEADA|PÓS-PLAYTEST)(?![\p{L}])([^)]*)\)/gu;

function extrairTags(texto) {
  const tags = [];
  for (const m of texto.matchAll(RE_TAG)) {
    if (tags.some((t) => t.tag === m[1])) continue;
    // A classe cobre TODOS os separadores vistos no doc 39 (": ", " — ", ", ")
    // — sem a vírgula, "(DONO, com dado)" gerava detalhe ", com dado".
    const detalhe = m[2].replace(/^[\s:;,—–-]+/, '').trim();
    tags.push(detalhe ? { tag: m[1], detalhe } : { tag: m[1] });
  }
  return tags;
}

export function parsearBacklog(texto) {
  const features = [];
  let feature = null; // null = fora de feature (título, "Como este arquivo funciona")
  let pilha = []; // itens abertos, para pendurar filho pelo nível de indentação
  let ultimo = null; // receptor de linha de continuação (item ou entrada crua)

  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) {
      ultimo = null;
      continue;
    }

    const cabecalho = linha.match(RE_FEATURE);
    if (cabecalho) {
      // Heading sem token não é feature (é prosa do próprio arquivo, como o
      // manual da gramática); o que vem debaixo dele fica fora do quadro.
      const token = cabecalho[1].match(RE_TOKEN);
      feature = token
        ? {
            titulo: cabecalho[1].replace(RE_TOKEN, '').trim(),
            estado: token[1] === 'x' ? 'pronto' : 'aberto',
            itens: [],
          }
        : null;
      if (feature) features.push(feature);
      pilha = [];
      ultimo = null;
      continue;
    }
    if (!feature) continue;

    const item = linha.match(RE_ITEM);
    // 0/2/4 espaços = épico/story/task; os rótulos "Épico:/Story:/Task:"
    // no texto são informativos — o nível estrutural vem SÓ da indentação.
    // A indentação só é estrutura quando é EXATAMENTE a da gramática:
    // fora de 0/2/4 (ímpar, 6+, tab) a linha cai no caminho CRU abaixo —
    // reinterpretar em silêncio disfarçaria hierarquia que não entendemos.
    if (item && ['', '  ', '    '].includes(item[1])) {
      const nivel = item[1].length / 2;
      const nodo = {
        tipo: 'item',
        texto: item[3].trim(),
        estado: item[2] === 'x' ? 'pronto' : 'aberto',
        nivel,
        filhos: [],
      };
      while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
      (pilha.length ? pilha[pilha.length - 1].filhos : feature.itens).push(nodo);
      pilha.push(nodo);
      ultimo = nodo;
      continue;
    }

    // Linha de continuação (indentada, sem "- ") junta ao item anterior.
    if (/^\s/.test(linha) && ultimo && !RE_LISTA.test(linha)) {
      ultimo.texto += ` ${linha.trim()}`;
      continue;
    }

    // O que não casa com a gramática vai CRU para o card da feature — o
    // quadro não pode esconder o que não entendeu (item de lista sem token,
    // indentação fora da gramática, parágrafo de contexto). Linhas contíguas
    // de prosa viram um parágrafo.
    if (ultimo?.tipo === 'cru' && !RE_LISTA.test(linha)) {
      ultimo.texto += ` ${linha.trim()}`;
    } else {
      // O cru respeita a hierarquia do arquivo: linha indentada dentro de um
      // épico aparece DENTRO dele, pela mesma régua de indentação dos itens.
      // O marcador "- " de lista sai do texto — sintaxe markdown não vaza
      // para a projeção (o token de item tokenizado também é removido).
      const [, recuo, resto] = linha.match(/^(\s*)(?:-\s+)?(.*)$/);
      const nivel = Math.min(Math.floor(recuo.length / 2), 2);
      const nodo = { tipo: 'cru', texto: resto.trim(), nivel, filhos: [] };
      while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
      (pilha.length ? pilha[pilha.length - 1].filhos : feature.itens).push(nodo);
      pilha.push(nodo);
      ultimo = nodo;
    }
  }

  // Links viram texto simples (fase 1 não navega) e as tags saem do texto
  // FINAL — uma tag pode quebrar entre a linha e a continuação dela.
  const finalizar = (nodo) => {
    nodo.texto = nodo.texto.replace(RE_LINK, '$1');
    nodo.tags = extrairTags(nodo.texto);
    nodo.filhos?.forEach(finalizar);
  };
  for (const f of features) f.itens.forEach(finalizar);
  return features;
}

// Só projetos com o campo opcional `backlog` entram — projeto sem o campo não
// aparece, sem erro e sem inferência. Falha de leitura vira estado NOMEADO
// ("sem_arquivo" para ausente, "erro_leitura" para o resto): lista vazia
// silenciosa esconderia o defeito da tela.
// O parâmetro existe para teste com catálogo falso; a rota usa o real.
export async function lerBacklog(projetos = PROJETOS) {
  return {
    projetos: await Promise.all(
      projetos
        .filter((p) => p.backlog)
        .map(async (p) => {
          const base = { pasta: p.pasta, titulo: p.titulo, backlog: p.backlog };
          try {
            const bruto = await fs.readFile(path.join(RAIZ, p.pasta, p.backlog), 'utf8');
            return { ...base, estado: 'ok', features: parsearBacklog(bruto) };
          } catch (erro) {
            // Só ENOENT significa "não existe". Qualquer outra falha (EACCES,
            // EISDIR…) ganha o nome VERDADEIRO — chamar de sem_arquivo um
            // arquivo ilegível mentiria a causa na tela.
            if (erro?.code === 'ENOENT') return { ...base, estado: 'sem_arquivo' };
            return { ...base, estado: 'erro_leitura', erro: erro?.code ?? String(erro?.message ?? erro) };
          }
        }),
    ),
  };
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
