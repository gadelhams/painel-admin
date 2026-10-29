// Cota da assinatura do Codex. O CLI grava `rate_limits` (percentual usado, janela e
// quando zera) em cada evento token_count da sessão; a amostra é a da sessão mais recente.

import os from 'node:os';
import path from 'node:path';
import { recentes } from '../coletores/sessoes.js';
import { lerCauda } from '../coletores/transcript-cauda.js';

const SEMANA_MS = 7 * 24 * 3600_000;
const FONTE = 'sessões do Codex (~/.codex/sessions)';

export function nomeJanela(minutos) {
  if (minutos === 300) return '5 h';
  if (minutos === 10080) return 'semana';
  return minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
}

export function amostrasDoEvento(evento) {
  const limites = evento?.payload?.rate_limits;
  if (!limites || !Number.isFinite(Date.parse(evento.timestamp))) return [];
  return [limites.primary, limites.secondary].filter((j) => j && Number.isFinite(j.used_percent) && Number.isFinite(j.window_minutes))
    .map((j) => ({
      tipo: 'assinatura', percentualUsado: j.used_percent, janela: nomeJanela(j.window_minutes),
      atualizadoEm: new Date(Date.parse(evento.timestamp)).toISOString(), fonte: FONTE,
      reiniciaEm: Number.isFinite(j.resets_at) ? new Date(j.resets_at * 1000).toISOString() : null,
    }));
}

export function criarFonteCodex({ raiz = path.join(os.homedir(), '.codex', 'sessions'), agora = Date.now } = {}) {
  return async function amostrasCodex() {
    // A sessão do dia em que nasceu fica no diretório desse dia: a árvore toda, por mtime.
    const arquivos = (await recentes(raiz, agora() - SEMANA_MS, 4)).sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const { arquivo } of arquivos.slice(0, 5)) {
      const eventos = await lerCauda(arquivo).catch(() => []);
      for (let i = eventos.length - 1; i >= 0; i -= 1) {
        const amostras = amostrasDoEvento(eventos[i]);
        if (amostras.length) return amostras;
      }
    }
    return [];
  };
}
