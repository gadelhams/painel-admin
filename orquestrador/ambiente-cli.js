// Ambiente dos filhos da CLI: lista branca, sem chave do painel.

import { constants as FS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const AMBIENTE_PERMITIDO = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME',
  'CODEX_HOME', 'CLAUDE_CONFIG_DIR']);

export const LIMITES_PADRAO = Object.freeze({
  minutosIa: 45, minutosComando: 20, minutosInstalacao: 10,
  maxSaidaBytes: 4 * 1024 * 1024, maxTurnos: 60, tetoUsdPorPapel: 15,
});

export function ambienteLimpo(base = {}) {
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'string' && (AMBIENTE_PERMITIDO.has(k) || k.startsWith('MISE_'))) env[k] = v;
  }
  return { ...env, CI: '1', NO_COLOR: '1' };
}

export async function resolverBinario(nome, env) {
  if (!nome || typeof nome !== 'string') return null;
  const candidatos = nome.includes('/') ? [nome] : (env.PATH ?? '').split(path.delimiter).filter(Boolean).map(d => path.join(d, nome));
  for (const c of candidatos) {
    try { await fs.access(c, FS.X_OK); return c; } catch { /* próximo segmento */ }
  }
  return null;
}
