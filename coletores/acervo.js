// Acervo compartilhado (a Oficina central do Hangar): padrões, orientações, skills e lições. Só lista nomes; não lê conteúdo.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RAIZ } from './caminhos.js';

// Setores na ordem em que a Oficina os desenha. Os caminhos são fixos de
// propósito: o droid só "vai à Oficina" quando a sessão toca um destes, e uma
// lista explícita é mais fácil de auditar do que uma heurística por nome.
export const SETORES = [
  { id: 'padroes', titulo: 'Padrões' },
  { id: 'orientacoes', titulo: 'Orientações' },
  { id: 'skills', titulo: 'Skills' },
  { id: 'licoes', titulo: 'Lições vivas' },
];

const ORIENTACOES_RAIZ = ['CLAUDE.md', 'AGENTS.md', 'SERVIDOR-astargne.md', 'PORTAS.md', 'RELACOES.md'];
const ORIENTACOES_AREA = ['ProjetosPessoais/CLAUDE.md', 'ProjetosCompartilhados/CLAUDE.md'];

export function fontesAcervo({ raiz = RAIZ, casa = os.homedir() } = {}) {
  return {
    raiz,
    licoes: path.join(raiz, 'ProjetosPessoais', 'licoes-vivas'),
    skills: [path.join(raiz, '.claude', 'skills'), path.join(casa, '.claude', 'skills')],
    globais: [path.join(casa, '.claude', 'CLAUDE.md'), path.join(casa, '.claude', 'PADROES-GERAIS.md')],
  };
}

// Caminho absoluto → { setor, item } quando é do acervo; null no resto.
export function setorDoCaminho(caminho, fontes = fontesAcervo()) {
  if (typeof caminho !== 'string' || !path.isAbsolute(caminho)) return null;
  const alvo = path.normalize(caminho);
  const nome = path.basename(alvo);
  if (path.dirname(alvo) === fontes.raiz) {
    if (/^PADROES-.+\.md$/.test(nome)) return { setor: 'padroes', item: nome };
    if (ORIENTACOES_RAIZ.includes(nome)) return { setor: 'orientacoes', item: nome };
  }
  if (ORIENTACOES_AREA.some((rel) => alvo === path.join(fontes.raiz, rel))) {
    return { setor: 'orientacoes', item: path.relative(fontes.raiz, alvo) };
  }
  if (fontes.globais.includes(alvo)) return { setor: nome.startsWith('PADROES') ? 'padroes' : 'orientacoes', item: `~/.claude/${nome}` };
  if (path.dirname(alvo) === fontes.licoes && nome.endsWith('.md')) return { setor: 'licoes', item: nome };
  for (const dir of fontes.skills) {
    if (alvo.startsWith(dir + path.sep)) {
      const skill = path.relative(dir, alvo).split(path.sep)[0];
      if (skill && skill !== 'synced') return { setor: 'skills', item: skill };
    }
  }
  return null;
}

async function nomes(dir, filtro) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter(filtro).map((e) => e.name);
  } catch {
    return [];
  }
}

// Inventário para as prateleiras: nomes por setor, em ordem alfabética.
export async function inventarioAcervo(fontes = fontesAcervo()) {
  const naRaiz = await nomes(fontes.raiz, (e) => e.isFile());
  const existentes = await Promise.all(ORIENTACOES_AREA.map(async (rel) => (
    (await fs.stat(path.join(fontes.raiz, rel)).catch(() => null)) ? rel : null)));
  const skills = (await Promise.all(fontes.skills.map((d) => nomes(d, (e) => e.isDirectory() && e.name !== 'synced')))).flat();
  const globais = (await Promise.all(fontes.globais.map(async (g) => ((await fs.stat(g).catch(() => null)) ? g : null))))
    .filter(Boolean).map((g) => setorDoCaminho(g, fontes));
  const doSetor = (id) => globais.filter((g) => g.setor === id).map((g) => g.item);
  const itens = {
    padroes: [...naRaiz.filter((n) => /^PADROES-.+\.md$/.test(n)), ...doSetor('padroes')],
    orientacoes: [...naRaiz.filter((n) => ORIENTACOES_RAIZ.includes(n)), ...existentes.filter(Boolean), ...doSetor('orientacoes')],
    skills: [...new Set(skills)],
    licoes: await nomes(fontes.licoes, (e) => e.isFile() && e.name.endsWith('.md')),
  };
  return SETORES.map((s) => ({ ...s, itens: itens[s.id].sort((a, b) => a.localeCompare(b)) }));
}
