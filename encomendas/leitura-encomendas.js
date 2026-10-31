// Lê `encomendas.jsonl` e devolve as encomendas pendentes (pedida sem atendida depois), sem `usuarioId`; não grava nada.
//
// O arquivo é só de acréscimo e tem dois escritores: o painel grava `pedida`; o
// orquestrador (sessão Claude Code) acrescenta `atendida` com o mesmo `id` quando cria o
// projeto no Plane (docs/operacao.md § Encomendas de nave). Ninguém reescreve linha: o
// estado de uma encomenda é a dobra das linhas dela, em ordem. Linha de estado que não
// conhecemos não fecha nada e é contada, para o erro de digitação do atendente aparecer.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { UUID } from '../orquestrador/uuid.js';

export const NOME_ARQUIVO = 'encomendas.jsonl';
export const ARQUIVO_ENCOMENDAS = path.join(os.homedir(), '.local', 'state', 'painel-admin', NOME_ARQUIVO);

const pedidaValida = l => typeof l.nome === 'string' && Array.isArray(l.modulos) && l.modulos.every(m => typeof m === 'string')
  && (l.sigla === null || typeof l.sigla === 'string') && Number.isFinite(Date.parse(l.quando));

export function dobrarEncomendas(linhas) {
  const pedidas = new Map();
  const atendidas = new Set();
  let ignoradas = 0;
  for (const l of linhas) {
    if (!l || typeof l !== 'object' || !UUID.test(l.id ?? '')) { ignoradas += 1; continue; }
    if (l.estado === 'pedida' && pedidaValida(l)) {
      if (!pedidas.has(l.id)) pedidas.set(l.id, { id: l.id, quando: l.quando, nome: l.nome, sigla: l.sigla, modulos: [...l.modulos], estado: 'pedida' });
    } else if (l.estado === 'atendida') atendidas.add(l.id);
    else ignoradas += 1;
  }
  const pendentes = [...pedidas.values()].filter(e => !atendidas.has(e.id));
  return { pendentes, atendidas: [...pedidas.keys()].filter(id => atendidas.has(id)).length, ignoradas };
}

// Ilegível (linha ruim no meio) falha fechada: nada pendente aparece e o registro recusa.
export async function lerEncomendas(arquivo = ARQUIVO_ENCOMENDAS) {
  let texto;
  try { texto = await fs.readFile(arquivo, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') return { legivel: true, pendentes: [], atendidas: 0, ignoradas: 0, truncadasNoMeio: 0, truncadaNoFim: false };
    return { legivel: false, pendentes: [], atendidas: 0, ignoradas: 0, truncadasNoMeio: 0, truncadaNoFim: false };
  }
  let lido;
  try { lido = lerJsonl(texto, NOME_ARQUIVO); }
  catch { return { legivel: false, pendentes: [], atendidas: 0, ignoradas: 0, truncadasNoMeio: 0, truncadaNoFim: false }; }
  return { legivel: true, ...dobrarEncomendas(lido.linhas), truncadasNoMeio: lido.truncadasNoMeio, truncadaNoFim: lido.truncadaNoFim };
}
