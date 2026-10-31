// Cota da assinatura do Claude, de duas fontes locais: o arquivo que a statusLine grava
// (~/.claude/statusline-astargne.mjs, documentada) e o cache de uso que o próprio Claude Code
// guarda em ~/.claude.json, que a extensão do VS Code também atualiza; por janela, vale a mais nova.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FONTE = 'barra de status do Claude Code';
const FONTE_CACHE = 'cache de uso do Claude Code (~/.claude.json)';
const JANELAS = [['cincoHoras', '5 h'], ['semana', 'semana']];
const JANELAS_CACHE = [['five_hour', '5 h'], ['seven_day', 'semana']];

export function amostrasDoArquivo(dados) {
  if (dados?.versao !== 1 || !Number.isFinite(Date.parse(dados.atualizadoEm))) return [];
  return JANELAS.filter(([chave]) => Number.isFinite(dados[chave]?.percentual))
    .map(([chave, janela]) => ({
      tipo: 'assinatura', percentualUsado: dados[chave].percentual, janela,
      atualizadoEm: dados.atualizadoEm, fonte: FONTE, reiniciaEm: dados[chave].reiniciaEm ?? null,
    }));
}

// O cache não é contrato público do Claude Code: qualquer forma diferente da lida em
// 31/10/2026 (utilization 0–100, resets_at ISO ou null, fetchedAtMs) vira "sem amostra",
// nunca um número. Só percentual e reinício saem daqui; conta e dinheiro, não.
export function amostrasDoCache(dados) {
  const cache = dados?.cachedUsageUtilization;
  if (!Number.isFinite(cache?.fetchedAtMs) || !cache.utilization || typeof cache.utilization !== 'object') return [];
  const atualizadoEm = new Date(cache.fetchedAtMs).toISOString();
  return JANELAS_CACHE.flatMap(([chave, janela]) => {
    const j = cache.utilization[chave];
    if (!Number.isFinite(j?.utilization) || j.utilization < 0 || j.utilization > 100) return [];
    if (j.resets_at !== null && !Number.isFinite(Date.parse(j.resets_at))) return [];
    return [{ tipo: 'assinatura', percentualUsado: j.utilization, janela, atualizadoEm, fonte: FONTE_CACHE,
      reiniciaEm: j.resets_at === null ? null : new Date(Date.parse(j.resets_at)).toISOString() }];
  });
}

async function lerJson(arquivo) {
  try { return JSON.parse(await fs.readFile(arquivo, 'utf8')); } catch { return null; }
}

export function criarFonteClaude({
  arquivo = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'claude-uso.json'),
  cacheClaude = path.join(os.homedir(), '.claude.json'),
} = {}) {
  return async function amostrasClaude() {
    const amostras = [...amostrasDoArquivo(await lerJson(arquivo)), ...amostrasDoCache(await lerJson(cacheClaude))];
    const maisNova = new Map();
    for (const a of amostras) {
      const atual = maisNova.get(a.janela);
      if (!atual || Date.parse(a.atualizadoEm) > Date.parse(atual.atualizadoEm)) maisNova.set(a.janela, a);
    }
    return [...maisNova.values()];
  };
}
