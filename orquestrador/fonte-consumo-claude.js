// Cota da assinatura do Claude. A única fonte documentada é o JSON que o Claude Code entrega
// à statusLine; o script ~/.claude/statusline-astargne.mjs grava só os limites neste arquivo.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FONTE = 'barra de status do Claude Code';
const JANELAS = [['cincoHoras', '5 h'], ['semana', 'semana']];

export function amostrasDoArquivo(dados) {
  if (dados?.versao !== 1 || !Number.isFinite(Date.parse(dados.atualizadoEm))) return [];
  return JANELAS.filter(([chave]) => Number.isFinite(dados[chave]?.percentual))
    .map(([chave, janela]) => ({
      tipo: 'assinatura', percentualUsado: dados[chave].percentual, janela,
      atualizadoEm: dados.atualizadoEm, fonte: FONTE, reiniciaEm: dados[chave].reiniciaEm ?? null,
    }));
}

export function criarFonteClaude({ arquivo = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'claude-uso.json') } = {}) {
  return async function amostrasClaude() {
    let bruto;
    try { bruto = await fs.readFile(arquivo, 'utf8'); } catch { return []; }
    try { return amostrasDoArquivo(JSON.parse(bruto)); } catch { return []; }
  };
}
