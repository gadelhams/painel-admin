// Leitura da memória L1 do C-3PO (`c3po/MEMORIES.md`) e do seu histórico de versões. Não grava: escrever é de escritor-memoria.js, fora do alcance do motor.
//
// O estado é sempre explícito: `ausente` (memória vazia), `ok`, `grande` (alguém editou à
// mão acima do teto: o motor recebe só o começo, com aviso) ou `ilegivel` (bytes que não
// são UTF-8 válido: o motor não recebe nada). O hash é o da base das duas ações.
//
// Histórico (31/10/2026, B1.2/B3): cada versão nasce `rename: 'pendente'` e um evento depois
// diz o desfecho (`aplicada`/`nunca-aplicada`); versão sem desfecho (queda entre o histórico e o
// rename) se reconcilia pelo hash do arquivo. Linha ruim no meio não derruba o que veio antes
// dela, e a versão só serve para desfazer se o texto guardado bate com o hash.
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

// O desfecho de cada versão do histórico. `reconciliar`: o evento que falta à última versão sem
// desfecho, decidido pelo hash do arquivo de agora (null quando nada falta ou não dá para saber).
export function situarVersoes(linhas, hashAtual) {
  const versoes = [];
  for (const l of linhas) {
    if (!l.evento) { versoes.push({ ...l, estado: l.rename === 'pendente' ? 'pendente' : 'aplicada' }); continue; }
    const alvo = l.versaoId ? versoes.find(v => v.id === l.versaoId)
      : versoes.filter(v => v.hashDepois === l.hashDepois).at(-1); // evento antigo, só com o hash
    if (alvo && (l.evento === 'aplicada' || l.evento === 'nunca-aplicada')) alvo.estado = l.evento;
  }
  const ultima = versoes.at(-1);
  let reconciliar = null;
  if (ultima?.estado === 'pendente') {
    reconciliar = hashAtual === ultima.hashDepois ? 'aplicada' : hashAtual === ultima.hashAntes ? 'nunca-aplicada' : null;
    if (reconciliar) ultima.estado = reconciliar;
  }
  return { versoes, reconciliar, ultima };
}

// O arquivo de agora não é o da última versão aplicada pelo painel: alguém o editou à mão.
export function foraDoPainel({ versoes }, atual) {
  const efetiva = versoes.filter(v => v.estado === 'aplicada').at(-1);
  return efetiva ? efetiva.hashDepois !== atual.hash : atual.estado !== 'ausente';
}

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

  // Até a primeira linha ruim no meio: o que vem antes dela continua valendo (e a tela diz qual).
  async function lerHistoricoComDefeito() {
    let texto;
    try { texto = await fs.readFile(arquivoHistorico, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { linhas: [], linhaRuim: null }; throw e; }
    try { return { linhas: lerJsonl(texto, 'histórico da memória').linhas, linhaRuim: null }; }
    catch (e) {
      const n = Number(/linha (\d+)/.exec(e.message)?.[1]);
      if (!n) throw e;
      return { linhas: lerJsonl(`${texto.split('\n').slice(0, n - 1).join('\n')}\n`, 'histórico da memória').linhas, linhaRuim: n };
    }
  }
  // Só as versões (os eventos de desfecho ficam em lerHistoricoComDefeito).
  const lerHistorico = async () => (await lerHistoricoComDefeito()).linhas.filter(l => !l.evento);

  // Para a tela: as últimas versões com o desfecho de cada uma, sem os textos inteiros (o diff
  // basta), e se o arquivo de agora é o da última versão aplicada.
  async function retrato(n = 10) {
    const atual = await ler();
    const { linhas, linhaRuim } = await lerHistoricoComDefeito();
    const s = situarVersoes(linhas, atual.hash);
    return { versoes: s.versoes.slice(-n).reverse().map(({ antes: _a, depois: _d, ...resto }) => resto),
      foraDoPainel: atual.hash !== null && foraDoPainel(s, atual), linhaRuim };
  }
  const ultimas = async (n = 10) => (await retrato(n)).versoes;

  // O texto de uma versão que o histórico conhece, pelo hash (antes ou depois de alguma entrada),
  // só se o texto guardado ainda bate com ele.
  async function versao(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) return null;
    const confere = t => typeof t === 'string' && hashTexto(t) === hash;
    for (const e of (await lerHistorico()).reverse()) {
      if (e.hashDepois === hash && confere(e.depois)) return e.depois;
      if (e.hashAntes === hash && confere(e.antes)) return e.antes;
    }
    return null;
  }

  return { arquivo, arquivoHistorico, diretorio, ler, lerHistorico, lerHistoricoComDefeito, retrato, ultimas, versao };
}
