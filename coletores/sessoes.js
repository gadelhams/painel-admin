// Sessões de IA vivas na máquina (os droids do Hangar): /proc + cauda dos transcripts. Só leitura; nunca devolve prompt, resposta nem argumento.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { RAIZ } from './caminhos.js';
import { fontesAcervo, setorDoCaminho } from './acervo.js';
import { lerCabeca, lerCauda } from './transcript-cauda.js';
import { sessaoClaude } from './transcript-claude.js';
import { sessaoCodex } from './transcript-codex.js';

export const JANELA_MS = 15 * 60_000;
const TRABALHANDO_MS = 30_000;
const PENSANDO_MS = 2 * 60_000;
const MAX_ACOES = 12;
const IAS = ['claude', 'codex', 'grok'];

// Qual CLI está viva. Um processo não é uma sessão (o app-server do Codex
// hospeda várias e o Claude do VS Code abre na pasta-mãe), então isto só serve
// de portão: sem processo vivo, nenhum droid daquela IA aparece.
export async function iasVivas(raizProc = '/proc') {
  const vivas = new Set();
  let pids = [];
  try {
    pids = (await fs.readdir(raizProc)).filter((n) => /^\d+$/.test(n));
  } catch {
    return vivas;
  }
  await Promise.all(pids.map(async (pid) => {
    const bruto = await fs.readFile(path.join(raizProc, pid, 'cmdline'), 'utf8').catch(() => '');
    for (const arg of bruto.split('\0').slice(0, 2)) {
      const nome = path.basename(arg);
      const ia = IAS.find((i) => nome === i || nome.startsWith(`${i}-`));
      if (ia) vivas.add(ia);
    }
  }));
  return vivas;
}

async function recentes(dir, desde, profundidade = 1) {
  const achados = [];
  let entradas = [];
  try {
    entradas = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return achados;
  }
  await Promise.all(entradas.map(async (e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory() && profundidade > 1) achados.push(...await recentes(abs, desde, profundidade - 1));
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
      const st = await fs.stat(abs).catch(() => null);
      if (st && st.mtimeMs >= desde) achados.push({ arquivo: abs, mtimeMs: st.mtimeMs, size: st.size });
    }
  }));
  return achados;
}

function diasCodex(raizCodex, agora) {
  return [0, 1].map((d) => {
    const dia = new Date(agora - d * 86_400_000);
    const dd = (n) => String(n).padStart(2, '0');
    return path.join(raizCodex, String(dia.getFullYear()), dd(dia.getMonth() + 1), dd(dia.getDate()));
  });
}

function criarAtribuidor({ raiz, projetos }) {
  const dirs = projetos
    .map((p) => ({ pasta: p.pasta, plane: p.plane ?? null, dir: path.join(raiz, p.area, p.pasta) }))
    .sort((a, b) => b.dir.length - a.dir.length);
  const exitlag = path.join(raiz, 'Exitlag');
  const dentro = (c, d) => c === d || c.startsWith(d + path.sep);
  return {
    projetoDe(caminho) {
      if (typeof caminho !== 'string') return null;
      return dirs.find((d) => dentro(path.normalize(caminho), d.dir)) ?? null;
    },
    projetoDoPlane(id) {
      return dirs.find((d) => d.plane && d.plane === id) ?? null;
    },
    // Exitlag não se mistura com o pessoal em sentido nenhum: nem droid, nem caminho.
    ehExitlag: (c) => typeof c === 'string' && dentro(path.normalize(c), exitlag),
    naRaiz: (c) => typeof c === 'string' && dentro(path.normalize(c), raiz),
  };
}

function estadoDoDroid(sessao, agora) {
  if (sessao.fimDeTurno) return 'aguardando';
  const idade = agora - Date.parse(sessao.ultimoEm);
  if (idade < TRABALHANDO_MS) return 'trabalhando';
  if (idade < PENSANDO_MS) return 'pensando';
  return 'ocioso';
}

function projetar(bruta, { ia, id, agora, raiz, atribuidor, acervo }) {
  if (!bruta.ultimoEm || bruta.subagente || atribuidor.ehExitlag(bruta.cwd)) return null;
  // O mtime não basta: a CLI regrava metadados (título, modo) sem timestamp em sessão parada há horas.
  if (agora - Date.parse(bruta.ultimoEm) > JANELA_MS) return null;

  // Precedência: arquivo de projeto tocado > cwd > carta do Plane. Chamada ao
  // MCP sem issue_id (label, módulo) não diz onde a sessão trabalha: criar a
  // mesma label em doze projetos não muda o droid de nave.
  const ultimo = (pegar) => {
    for (let i = bruta.acoes.length - 1; i >= 0; i -= 1) {
      const p = pegar(bruta.acoes[i]);
      if (p) return p;
    }
    return null;
  };
  const projeto = ultimo((a) => atribuidor.projetoDe(a.caminho))
    ?? atribuidor.projetoDe(bruta.cwd)
    ?? ultimo((a) => (a.itemPlane ? atribuidor.projetoDoPlane(a.projetoPlane) : null));
  const lugar = projeto?.pasta ?? (atribuidor.naRaiz(bruta.cwd) ? 'central' : null);

  const corte = agora - JANELA_MS;
  const acoes = [];
  for (const a of bruta.acoes) {
    if (Date.parse(a.em) < corte || atribuidor.ehExitlag(a.caminho)) continue;
    const saida = { em: a.em, tipo: a.tipo, ferramenta: a.ferramenta };
    const doAcervo = a.setor ? { setor: a.setor, item: a.item } : setorDoCaminho(a.caminho, acervo);
    if (doAcervo && (a.tipo === 'ler' || a.tipo === 'consultar')) {
      Object.assign(saida, { tipo: 'consultar', setor: doAcervo.setor, item: doAcervo.item });
    } else if (a.caminho) {
      const dono = atribuidor.projetoDe(a.caminho);
      if (dono) saida.arquivo = path.relative(dono.dir, a.caminho) || '.';
      if (dono && dono.pasta !== lugar) saida.projeto = dono.pasta;
      else if (!dono && atribuidor.naRaiz(a.caminho)) saida.arquivo = path.relative(raiz, a.caminho);
    }
    if (a.programa) saida.programa = a.programa;
    if (a.itemPlane) saida.itemPlane = a.itemPlane;
    acoes.push(saida);
  }
  const cartao = [...bruta.acoes].reverse().find((a) => a.itemPlane)?.itemPlane ?? null;

  return {
    id,
    ia,
    projeto: lugar,
    estado: estadoDoDroid(bruta, agora),
    desde: bruta.ultimoEm,
    cartao,
    acoes: acoes.slice(-MAX_ACOES),
  };
}

// Cache por arquivo: o poll é de 5 s e o transcript só muda quando a sessão anda.
const memo = new Map();

async function lerComMemo(chave, { mtimeMs, size }, ler) {
  const visto = memo.get(chave);
  if (visto && visto.mtimeMs === mtimeMs && visto.size === size) return visto.valor;
  // Arquivo que sumiu ou ficou ilegível no meio da leitura vira "sem sessão", não 500 da rota inteira.
  const valor = await ler().catch(() => ({ ultimoEm: null, cwd: null, fimDeTurno: false, acoes: [] }));
  memo.set(chave, { mtimeMs, size, valor });
  return valor;
}

export async function lerSessoes({
  raizProc = '/proc',
  raizClaude = path.join(os.homedir(), '.claude', 'projects'),
  raizCodex = path.join(os.homedir(), '.codex', 'sessions'),
  raiz = RAIZ,
  projetos = PROJETOS,
  acervo = fontesAcervo({ raiz }),
  agora = Date.now(),
} = {}) {
  const vivas = await iasVivas(raizProc);
  const desde = agora - JANELA_MS;
  const atribuidor = criarAtribuidor({ raiz, projetos });
  const contexto = { agora, raiz, atribuidor, acervo };
  const sessoes = [];

  if (vivas.has('claude')) {
    for (const f of await recentes(raizClaude, desde, 2)) {
      const bruta = await lerComMemo(f.arquivo, f, async () => sessaoClaude(await lerCauda(f.arquivo)));
      const s = projetar(bruta, { ...contexto, ia: 'claude', id: path.basename(f.arquivo, '.jsonl') });
      if (s) sessoes.push(s);
    }
  }
  if (vivas.has('codex')) {
    const arquivos = (await Promise.all(diasCodex(raizCodex, agora).map((d) => recentes(d, desde)))).flat();
    for (const f of arquivos) {
      const bruta = await lerComMemo(f.arquivo, f, async () => {
        // Primeira linha = session_meta; diz se é sub-sessão (o "guardian" que revisa comandos).
        const meta = await lerCabeca(f.arquivo).catch(() => null);
        return sessaoCodex([meta, ...await lerCauda(f.arquivo)].filter(Boolean), { raiz });
      });
      const id = path.basename(f.arquivo, '.jsonl').match(/[0-9a-f-]{36}$/)?.[0] ?? path.basename(f.arquivo, '.jsonl');
      const s = projetar(bruta, { ...contexto, ia: 'codex', id });
      if (s) sessoes.push(s);
    }
  }

  sessoes.sort((a, b) => a.ia.localeCompare(b.ia) || a.id.localeCompare(b.id));
  return {
    em: new Date(agora).toISOString(),
    ias: IAS.map((ia) => ({ id: ia, viva: vivas.has(ia), sessoes: sessoes.filter((s) => s.ia === ia).length })),
    sessoes,
  };
}
