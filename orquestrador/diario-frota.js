// Diário da frota: projeção só-leitura dos livros que já existem (touchpoints do despacho e
// diários da vigília). Um formato só para a aba, o Hangar e o C-3PO; só campos estruturados.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { lerJsonl } from './leitor-jsonl.js';

const CAMPOS = ['tipo', 'carta', 'cartaId', 'tentativaId', 'resultado', 'etapa', 'de', 'para', 'ate', 'grupo', 'frotaVersao'];

function evento(bruto, origem, projetoId = null) {
  const e = { quando: bruto.quando ?? null, origem, projetoId: projetoId ?? bruto.projetoId ?? null };
  for (const c of CAMPOS) if (typeof bruto[c] === 'string' || typeof bruto[c] === 'number') e[c] = bruto[c];
  if (typeof bruto.motivo === 'string') e.motivo = bruto.motivo.slice(0, 200);
  // A causa do impedido vem como objeto no despacho e como texto na vigília; sai um só formato.
  const causa = typeof bruto.causa === 'string' ? bruto.causa : bruto.causa?.tipo;
  if (['cli', 'limite', 'carta', 'infra'].includes(causa)) e.causa = causa;
  return e;
}

async function lerArquivo(arquivo, nome) {
  let texto;
  try { texto = await fs.readFile(arquivo, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { linhas: [], truncadaNoFim: false }; throw e; }
  return lerJsonl(texto, nome);
}

export function criarLeitorDiarioFrota({ diretorio, projetos = PROJETOS, limite = 200 }) {
  return async function lerDiarioFrota({ cartaId = null } = {}) {
    const eventos = [];
    const avisos = [];
    const fontes = [{ arquivo: path.join(diretorio, 'touchpoints.jsonl'), nome: 'despacho', origem: 'despacho', projetoId: null },
      ...projetos.filter(p => p.plane).map(p => ({ arquivo: path.join(diretorio, 'vigilia', `${p.plane}.jsonl`), nome: `vigília ${p.titulo}`, origem: 'vigilia', projetoId: p.plane }))];
    for (const f of fontes) {
      try {
        const { linhas, truncadaNoFim, truncadasNoMeio } = await lerArquivo(f.arquivo, f.nome);
        if (truncadaNoFim) avisos.push(`${f.nome}: última linha incompleta ignorada`);
        if (truncadasNoMeio) avisos.push(`${f.nome}: ${truncadasNoMeio} linha(s) de escrita interrompida ignorada(s) no meio; o registro seguinte foi preservado`);
        eventos.push(...linhas.map(l => evento(l, f.origem, f.projetoId)));
      } catch (erro) { avisos.push(`${f.nome}: ${erro.message}`); }
    }
    const filtrados = cartaId ? eventos.filter(e => e.cartaId === cartaId) : eventos;
    filtrados.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    return { atualizadoEm: new Date().toISOString(), eventos: filtrados.slice(0, limite), total: filtrados.length, avisos };
  };
}
