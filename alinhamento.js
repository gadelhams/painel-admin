// Rotina de alinhamento código ⇄ Plane ⇄ painel (decisão do dono, 25/10/2026).
// Mede a dívida entre as três frentes em vez de deixá-la crescer em silêncio:
// fio de card longo sem compactação (PADROES-BACKLOG § Compactação), card
// selado sem compactar, `docs/current.md` mais velho que o último commit,
// doc citando card já fechado, commits sem push, portão de docs vermelho e
// pasta do catálogo que não existe. Só leitura: nunca escreve no Plane nem no
// disco além do próprio cache. Quem corrige é o orquestrador no fecho.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJETOS } from './projetos.js';
import { RAIZ, dirDoProjeto } from './coletores.js';
import { criarClientePlane, lerWorkspacePlane } from './plane.js';

const execFileAsync = promisify(execFile);
export const LIMIAR_FIO = 8;                       // comentários desde a última compactação
export const MARCA_COMPACTADO = 'COMPACTADO/v1';
export const REGRA_DESDE = '2026-10-25T00:00:00Z';  // selo antes disto não deve compactação
const ATRASO_DOC_DIAS = 7;
const RE_CARTA = /\b([A-Z]{2,8})-(\d{1,5})\b/g;
const RE_DATA_BR = /(\d{2})\/(\d{2})\/(\d{4})/;

// Documentação funcional / arquitetural / técnica: o primeiro candidato que
// existir em cada grupo (caminhos relativos ao repositório do projeto).
const CANDIDATOS_DOCS = {
  funcional: ['docs/00_PLANO.md', 'README.md', 'readme.md'],
  arquitetural: ['docs/arquitetura.md', 'docs/development/ARCHITECTURE.md', 'docs/ARCHITECTURE.md', 'docs/adr/README.md'],
  tecnica: ['docs/codigo.md', 'docs/current.md', 'docs/development/API.md'],
  contrato: ['AGENTS.md', 'CLAUDE.md'],
};

function dataDoCabecalho(texto) {
  const m = RE_DATA_BR.exec(texto.split('\n', 3).join('\n'));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function existe(p) { try { await fs.access(p); return true; } catch { return false; } }

export async function gitPadrao(dir, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], { timeout: 15_000 });
  return stdout.trim();
}

// Roda o portão de docs do projeto (scripts/check-docs.mjs ou check_docs.py)
// e devolve a contagem de erros, ou null se o projeto não tem portão.
export async function portaoDocsPadrao(dirRepo) {
  const mjs = path.join(dirRepo, 'scripts', 'check-docs.mjs');
  const py = path.join(dirRepo, 'scripts', 'check_docs.py');
  let cmd = null;
  if (await existe(mjs)) cmd = [process.execPath, [mjs]];
  else if (await existe(py)) cmd = ['python3', [py]];
  if (!cmd) return null;
  try {
    const { stdout } = await execFileAsync(cmd[0], cmd[1], { cwd: dirRepo, timeout: 20_000, env: { ...process.env, CI: '' } });
    const m = /(\d+) erro/.exec(stdout);
    return m ? Number(m[1]) : 0;
  } catch (erro) {
    const saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
    const m = /(\d+) erro/.exec(saida);
    return m ? Number(m[1]) : 1;
  }
}

// Fio de um card: total de comentários e quantos vieram depois do último
// `COMPACTADO/v1` (o marcador fica no texto do comentário).
export function medirFio(comentarios) {
  const ordenados = [...comentarios].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let desdeCompactado = 0;
  let compactadoEm = null;
  for (const c of ordenados) {
    if (String(c.comment_html ?? '').includes(MARCA_COMPACTADO)) { desdeCompactado = 0; compactadoEm = c.created_at; } else desdeCompactado += 1;
  }
  return { total: ordenados.length, desdeCompactado, compactadoEm, ultimoEm: ordenados.at(-1)?.created_at ?? null };
}

export function criarAlinhamento({
  projetos = PROJETOS, raiz = RAIZ,
  diretorioEstado = path.join(os.homedir(), '.local', 'state', 'painel-admin'),
  lerPlane = lerWorkspacePlane,
  consultarPlane = null,            // (caminho) => JSON; null = cliente real com PLANE_API_KEY
  dirDe = dirDoProjeto,             // (projeto) => pasta no disco; teste aponta para um tmp
  git = gitPadrao, portaoDocs = portaoDocsPadrao,
  agora = Date.now, intervaloMs = 30 * 60_000, concorrencia = 4, log = console.error,
} = {}) {
  const arquivoCache = path.join(diretorioEstado, 'alinhamento.json');
  let cache = null;      // { varridoEm, fios: { [issueId]: { updatedAt, ...medida } } }
  let ultimo = null;     // último resultado completo
  let emCurso = null;
  let temporizador = null;

  async function lerCache() {
    if (cache) return cache;
    try { cache = JSON.parse(await fs.readFile(arquivoCache, 'utf8')); } catch { cache = { varridoEm: null, fios: {} }; }
    if (!cache.fios) cache.fios = {};
    return cache;
  }
  async function gravarCache() {
    await fs.mkdir(diretorioEstado, { recursive: true });
    const tmp = `${arquivoCache}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache), 'utf8');
    await fs.rename(tmp, arquivoCache);
  }

  function consultar() {
    if (consultarPlane) return consultarPlane;
    const chave = process.env.PLANE_API_KEY?.trim();
    if (!chave) throw new Error('sem PLANE_API_KEY no .env do painel');
    consultarPlane = criarClientePlane({ chave });
    return consultarPlane;
  }

  async function comentariosDe(projetoId, issueId) {
    const q = consultar();
    const itens = [];
    let cursor = null;
    do {
      const pagina = await q(`/projects/${projetoId}/issues/${issueId}/comments/?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      itens.push(...(pagina.results ?? []));
      cursor = pagina.next_page_results ? pagina.next_cursor : null;
    } while (cursor);
    return itens;
  }

  // Fios: só busca comentários de cards que mudaram desde a última medida.
  async function medirFios(issues) {
    const c = await lerCache();
    const pendentes = issues.filter((i) => !c.fios[i.id] || c.fios[i.id].updatedAt !== i.updatedAt);
    let idx = 0;
    const trabalhador = async () => {
      while (idx < pendentes.length) {
        const i = pendentes[idx++];
        try {
          c.fios[i.id] = { updatedAt: i.updatedAt, ...medirFio(await comentariosDe(i.project.id, i.id)) };
        } catch (erro) { log(`[alinhamento] comentários de ${i.identifier}: ${erro.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concorrencia, pendentes.length || 1) }, trabalhador));
    return { medidos: pendentes.length, fios: c.fios };
  }

  async function docsDe(dirRepo) {
    const docs = {};
    for (const [tipo, candidatos] of Object.entries(CANDIDATOS_DOCS)) {
      docs[tipo] = null;
      for (const cand of candidatos) if (await existe(path.join(dirRepo, cand))) { docs[tipo] = cand; break; }
    }
    return docs;
  }

  async function varrerProjeto(p, plane, fios) {
    const dir = dirDe(p);
    const dirRepo = p.subRepo ? path.join(dir, p.subRepo) : dir;
    const sinais = [];
    const sinal = (tipo, gravidade, texto, extra = {}) => sinais.push({ tipo, gravidade, texto, ...extra });
    if (!(await existe(dir))) { sinal('catalogo', 'alta', 'pasta do catálogo não existe no disco'); return { pasta: p.pasta, titulo: p.titulo, sinais, docs: {} }; }
    const docs = await docsDe(dirRepo);

    // git: commits sem push / atrás do remoto / data do último commit
    let dataCommit = null;
    let temGit = false;
    try {
      const data = await git(dirRepo, 'log', '-1', '--format=%cs');
      temGit = Boolean(data); dataCommit = data || null;
      try {
        const [a, b] = (await git(dirRepo, 'rev-list', '--left-right', '--count', 'HEAD...@{u}')).split(/\s+/).map(Number);
        if (a > 0) sinal('sem_push', 'media', `${a} commit(s) sem push`);
        if (b > 0) sinal('atras_remoto', 'media', `${b} commit(s) atrás do remoto`);
      } catch { /* sem upstream: nada a dizer */ }
    } catch { /* sem git */ }

    // docs/current.md: data do cabeçalho × último commit; cards citados × estado no Plane
    const current = path.join(dirRepo, 'docs', 'current.md');
    if (await existe(current)) {
      const texto = await fs.readFile(current, 'utf8');
      const dataDoc = dataDoCabecalho(texto);
      if (dataDoc && dataCommit) {
        const dias = Math.round((Date.parse(dataCommit) - Date.parse(dataDoc)) / 86_400_000);
        if (dias > ATRASO_DOC_DIAS) sinal('current_atras', 'media', `docs/current.md datado de ${dataDoc} e último commit em ${dataCommit} (${dias} dias)`, { arquivo: 'docs/current.md' });
      }
      if (plane && p.plane) {
        const porId = new Map(plane.issues.filter((i) => i.project.id === p.plane).map((i) => [i.identifier, i]));
        // Card fechado citado como PENDÊNCIA (a linha não diz que foi selado,
        // feito ou cancelado): citar "ALEXA-1 selada" é histórico, não dívida.
        const RE_HISTORICO = /selad|done|fechad|cancelad|feit[oa]|conclu|publicad|resolvid|superad/i;
        const pendentes = new Map();
        for (const linha of texto.split('\n')) {
          if (RE_HISTORICO.test(linha)) continue;
          for (const m of linha.matchAll(RE_CARTA)) pendentes.set(`${m[1]}-${m[2]}`, linha.trim().slice(0, 90));
        }
        for (const [id, linha] of pendentes) {
          const i = porId.get(id);
          if (i && (i.state.type === 'completed' || i.state.type === 'canceled')) sinal('cita_fechado', 'baixa', `docs/current.md trata ${id} como pendente, mas está ${i.state.name}: "${linha}"`, { carta: id, url: i.url });
        }
      }
    } else if (temGit) sinal('sem_current', 'baixa', 'sem docs/current.md');

    // portão de docs
    const erros = await portaoDocs(dirRepo);
    if (erros) sinal('check_docs', 'alta', `portão de docs com ${erros} erro(s)`);

    // fios no Plane
    if (plane && p.plane) {
      for (const i of plane.issues.filter((x) => x.project.id === p.plane)) {
        const f = fios[i.id];
        if (!f) continue;
        const selado = i.state.type === 'completed' || i.state.type === 'canceled';
        if (f.desdeCompactado >= LIMIAR_FIO) sinal('fio_longo', 'media', `${i.identifier}: ${f.desdeCompactado} comentários desde a última compactação`, { carta: i.identifier, url: i.url });
        else if (selado && f.total > 0 && !f.compactadoEm && String(i.updatedAt) >= REGRA_DESDE) sinal('selado_sem_compactar', 'baixa', `${i.identifier}: selado com ${f.total} comentário(s) e sem ${MARCA_COMPACTADO}`, { carta: i.identifier, url: i.url });
      }
    }
    return { pasta: p.pasta, titulo: p.titulo, congelado: p.congelado === true, docs, sinais };
  }

  async function varrer() {
    if (emCurso) return emCurso;
    emCurso = (async () => {
      const inicio = agora();
      let plane = null; let erroPlane = null; let medidos = 0; let fios = {};
      try {
        plane = await lerPlane();
        ({ medidos, fios } = await medirFios(plane.issues));
      } catch (erro) { erroPlane = erro.message; log(`[alinhamento] Plane: ${erro.message}`); }
      const resultado = [];
      for (const p of projetos) {
        if (p.congelado) continue;
        try { resultado.push(await varrerProjeto(p, plane, fios)); }
        catch (erro) { resultado.push({ pasta: p.pasta, titulo: p.titulo, docs: {}, sinais: [{ tipo: 'erro', gravidade: 'alta', texto: `varredura falhou: ${erro.message}` }] }); }
      }
      const totais = {};
      for (const r of resultado) for (const s of r.sinais) totais[s.tipo] = (totais[s.tipo] ?? 0) + 1;
      ultimo = { varridoEm: new Date(agora()).toISOString(), duracaoMs: agora() - inicio, erroPlane, cartasMedidas: medidos,
        limiarFio: LIMIAR_FIO, totais, total: Object.values(totais).reduce((a, b) => a + b, 0), projetos: resultado };
      const c = await lerCache(); c.varridoEm = ultimo.varridoEm; c.resultado = ultimo;
      await gravarCache().catch((e) => log(`[alinhamento] cache: ${e.message}`));
      return ultimo;
    })().finally(() => { emCurso = null; });
    return emCurso;
  }

  async function ler({ forcar = false } = {}) {
    if (ultimo && !forcar) return ultimo;
    const c = await lerCache();
    if (c.resultado && !forcar) { ultimo = c.resultado; return ultimo; }
    return varrer();
  }

  function iniciar() {
    if (temporizador) return;
    varrer().catch((e) => log(`[alinhamento] ${e.message}`));
    temporizador = setInterval(() => { varrer().catch((e) => log(`[alinhamento] ${e.message}`)); }, intervaloMs);
    temporizador.unref?.();
  }
  function parar() { clearInterval(temporizador); temporizador = null; }

  return { varrer, ler, iniciar, parar };
}
