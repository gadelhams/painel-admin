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

// Linha de `git diff --stat`: " caminho/arquivo.md | 12 +++++-----" — o
// resumo (contagem + barras) fica como está, só separa do caminho. A última
// linha ("N files changed, ...") não tem "|", já sai filtrada.
function parsearDiffStat(texto) {
  return texto
    .split('\n')
    .map((l) => l.match(/^\s*(.+?)\s*\|\s*(.+)$/))
    .filter(Boolean)
    .map(([, caminho, resumo]) => ({ caminho, resumo }));
}

// Arquivos com mudança (staged + não staged, contra HEAD) e novos (não
// rastreados, que `git diff` não mostra) — "o que está feito" no sentido de
// já escrito, ainda não commitado (página de projeto, 20/08/2026).
async function diffTrabalho(dir) {
  const [porcelain, stat] = await Promise.all([
    git(dir, 'status', '--porcelain'),
    git(dir, 'diff', '--stat', 'HEAD').catch(() => ''),
  ]);
  const novos = porcelain
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3).trim());
  return { modificados: parsearDiffStat(stat), novos };
}

// Commits já feitos localmente mas nunca enviados ao remoto — fato
// DIFERENTE de "não commitado" (SistemaLoreEngine tinha 21 disso sem o dono
// saber). Sem branch upstream configurado, `rastreado: false` — não é erro,
// é um projeto que nunca teve remote-tracking (ou está solto de propósito).
async function commitsNaoEnviados(dir) {
  const upstream = await git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').catch(() => null);
  if (!upstream) return { rastreado: false, commits: [] };
  const bruto = await git(dir, 'log', `${upstream}..HEAD`, '--format=%s').catch(() => '');
  return { rastreado: true, upstream, commits: bruto.split('\n').filter(Boolean) };
}

// Só chamada sob demanda (ao abrir a página de projeto), nunca no refresh de
// 60s da grade — mais pesada que o resumo de `infoGit` que os cards usam.
export async function gitDetalhado(pasta) {
  const projeto = PROJETOS.find((p) => p.pasta === pasta);
  if (!projeto) return { erro: 'projeto não encontrado' };

  const caminhoRepo = projeto.subRepo ? path.join(RAIZ, pasta, projeto.subRepo) : path.join(RAIZ, pasta);
  const existe = await fs.access(caminhoRepo).then(() => true, () => false);
  if (!existe) return { erro: 'pasta não sincronizada nesta máquina' };

  try {
    const [diff, naoEnviados] = await Promise.all([diffTrabalho(caminhoRepo), commitsNaoEnviados(caminhoRepo)]);
    return { ...diff, naoEnviados };
  } catch {
    return { erro: 'não é um repositório git' };
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

// ---------- documentos modeladores (leitura segura de .md por projeto) ----------
// Movido de motor.js pra cá em 20/08/2026: a ferramenta docs_projeto do
// motor e a rota HTTP /api/projetos/:pasta/docs (página de projeto) usam
// exatamente as mesmas funções — regra do CLAUDE.md do painel-admin, coletor
// compartilhado nunca duplicado entre rota e ferramenta.

const MODELADORES_DE_PASTA = ['CLAUDE.md', 'claude.md', 'AGENTS.md', 'README.md', 'readme.md'];
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'rathena']);
export const MAX_CHARS_ARQUIVO = 60_000;

function temEscapeDeCaminho(trecho) {
  return trecho.split(/[\\/]/).some((parte) => parte === '..');
}

// Só .md, resolvido dentro da raiz, sem ".." — portão contra escapar de
// "Projetos Pessoais" por caminho relativo malicioso ou mal formado.
export function resolverDentroDaRaiz(...trechos) {
  if (trechos.some(temEscapeDeCaminho)) return null;
  const alvo = path.resolve(RAIZ, ...trechos);
  if (!alvo.startsWith(RAIZ + path.sep)) return null;
  return alvo;
}

export async function listarModeladores(dirProjeto) {
  const achados = [];
  const entradas = await fs.readdir(dirProjeto, { withFileTypes: true });
  for (const entrada of entradas) {
    if (entrada.isFile() && entrada.name.toLowerCase().endsWith('.md')) {
      achados.push(entrada.name);
    } else if (entrada.isDirectory() && !PASTAS_IGNORADAS.has(entrada.name)) {
      if (entrada.name === 'docs') {
        const docs = await fs.readdir(path.join(dirProjeto, 'docs')).catch(() => []);
        for (const doc of docs) {
          if (doc.toLowerCase().endsWith('.md')) achados.push(`docs/${doc}`);
        }
      } else {
        // Sub-repo (ex.: ProjetoConversaComDeus/filosofia): só os modeladores clássicos.
        for (const nome of MODELADORES_DE_PASTA) {
          const existeSub = await fs.access(path.join(dirProjeto, entrada.name, nome)).then(() => true, () => false);
          if (existeSub) achados.push(`${entrada.name}/${nome}`);
        }
      }
    }
  }
  return achados;
}

// Leitura com teto de caracteres — usada tanto pela ferramenta do motor (um
// arquivo por pedido explícito) quanto pela rota de docs curados (vários de
// uma vez). Espera receber um caminho já resolvido por resolverDentroDaRaiz.
export async function lerArquivoMd(caminhoAbsoluto) {
  let texto = await fs.readFile(caminhoAbsoluto, 'utf8');
  if (texto.length > MAX_CHARS_ARQUIVO) {
    texto = `${texto.slice(0, MAX_CHARS_ARQUIVO)}\n\n[... truncado em ${MAX_CHARS_ARQUIVO} caracteres — o arquivo continua no disco]`;
  }
  return texto;
}

// Docs curados (campo opcional `docs` em projetos.js: arquitetura/objetos/
// dataFlow) vêm do próprio catálogo — trecho confiável, não entrada externa
// — por isso lidos direto por path.join, sem passar de novo por
// resolverDentroDaRaiz (que é o portão pra caminho digitado por fora).
async function lerDocsCurados(dirProjeto, docsDeclarados) {
  const grupos = {};
  for (const grupo of ['arquitetura', 'objetos', 'dataFlow']) {
    grupos[grupo] = await Promise.all(
      (docsDeclarados[grupo] ?? []).map(async (caminho) => {
        try {
          const conteudo = await lerArquivoMd(path.join(dirProjeto, caminho));
          return { caminho, conteudo };
        } catch (erro) {
          return { caminho, erro: erro?.code ?? String(erro?.message ?? erro) };
        }
      }),
    );
  }
  return grupos;
}

// Alimenta a página de projeto: lista os modeladores (links) e o conteúdo
// dos docs curados (renderizados inline, com diagrama). Projeto sem `docs`
// no catálogo volta com os três grupos vazios — nunca um erro, a página
// declara "sem diagrama catalogado ainda" em vez de fingir que existe.
function trechosProjeto(projeto, ...resto) {
  return projeto.subRepo ? [projeto.pasta, projeto.subRepo, ...resto] : [projeto.pasta, ...resto];
}

export async function docsProjeto(pasta) {
  const projeto = PROJETOS.find((p) => p.pasta === pasta);
  if (!projeto) return { erro: 'projeto não encontrado' };

  const caminho = path.join(RAIZ, pasta);
  const existe = await fs.access(caminho).then(() => true, () => false);
  if (!existe) return { erro: 'pasta não sincronizada nesta máquina' };

  const dirProjeto = resolverDentroDaRaiz(...trechosProjeto(projeto));
  if (!dirProjeto) return { erro: 'projeto não encontrado' };

  const [modeladores, curados] = await Promise.all([
    listarModeladores(dirProjeto).catch(() => []),
    lerDocsCurados(dirProjeto, projeto.docs ?? {}),
  ]);
  return { modeladores, curados };
}

// Leitura sob demanda de UM modelador da lista (clique na página de projeto)
// — mesmo portão de segurança (resolverDentroDaRaiz + só .md) que a
// ferramenta docs_projeto do motor usa pro mesmo tipo de arquivo.
export async function lerModeladorProjeto(pasta, arquivo) {
  const projeto = PROJETOS.find((p) => p.pasta === pasta);
  if (!projeto) return { erro: 'projeto não encontrado' };
  if (!arquivo || !arquivo.toLowerCase().endsWith('.md')) return { erro: 'arquivo precisa ser um .md' };

  const alvo = resolverDentroDaRaiz(...trechosProjeto(projeto, arquivo));
  if (!alvo) return { erro: 'caminho de arquivo inválido' };
  try {
    return { caminho: arquivo, conteudo: await lerArquivoMd(alvo) };
  } catch (erro) {
    return { erro: erro?.code === 'ENOENT' ? 'arquivo não encontrado' : String(erro?.message ?? erro) };
  }
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
