// Leitura da memória L1 do C-3PO (`c3po/MEMORIES.md`) e do seu histórico de versões. Não grava: escrever é de escritor-memoria.js, fora do alcance do motor.
//
// O estado é sempre explícito: `ausente` (memória vazia), `ok`, `grande` (alguém editou à
// mão acima do teto: o motor recebe só o começo, com aviso) ou `ilegivel` (bytes que não
// são UTF-8 válido: o motor não recebe nada). O hash é o da base das duas ações.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';

export const TETO_BYTES = 8 * 1024;
export const DIRETORIO_C3PO = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'c3po');
export const ARQUIVO_MEMORIA = 'MEMORIES.md';
export const ARQUIVO_HISTORICO = 'memoria-historico.jsonl';

export const hashTexto = texto => createHash('sha256').update(String(texto), 'utf8').digest('hex');
export const bytesDe = texto => Buffer.byteLength(String(texto), 'utf8');

export function criarLeitorMemoria({ diretorio = DIRETORIO_C3PO } = {}) {
  const arquivo = path.join(diretorio, ARQUIVO_MEMORIA);
  const arquivoHistorico = path.join(diretorio, ARQUIVO_HISTORICO);

  async function ler() {
    let bruto;
    try { bruto = await fs.readFile(arquivo); }
    catch (e) {
      if (e.code === 'ENOENT') return { estado: 'ausente', texto: '', hash: hashTexto(''), bytes: 0, teto: TETO_BYTES };
      return { estado: 'ilegivel', texto: '', hash: null, bytes: 0, teto: TETO_BYTES, motivo: `MEMORIES.md não pôde ser lido (${e.code ?? 'erro'})` };
    }
    const texto = bruto.toString('utf8');
    if (!Buffer.from(texto, 'utf8').equals(bruto)) {
      return { estado: 'ilegivel', texto: '', hash: null, bytes: bruto.length, teto: TETO_BYTES, motivo: 'MEMORIES.md não é UTF-8 válido' };
    }
    return { estado: bruto.length > TETO_BYTES ? 'grande' : 'ok', texto, hash: hashTexto(texto), bytes: bruto.length, teto: TETO_BYTES };
  }

  async function lerHistorico() {
    let texto;
    try { texto = await fs.readFile(arquivoHistorico, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return lerJsonl(texto, 'histórico da memória').linhas;
  }

  // Para a tela: as últimas versões, sem os textos inteiros (o diff basta para conferir).
  async function ultimas(n = 10) {
    return (await lerHistorico()).slice(-n).reverse()
      .map(({ antes: _a, depois: _d, ...resto }) => resto);
  }

  // O texto de uma versão que o histórico conhece, pelo hash (antes ou depois de alguma entrada).
  async function versao(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) return null;
    for (const e of (await lerHistorico()).reverse()) {
      if (e.hashDepois === hash && typeof e.depois === 'string') return e.depois;
      if (e.hashAntes === hash && typeof e.antes === 'string') return e.antes;
    }
    return null;
  }

  return { arquivo, arquivoHistorico, diretorio, ler, lerHistorico, ultimas, versao };
}
