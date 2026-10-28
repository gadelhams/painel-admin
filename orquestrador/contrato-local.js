// Contrato local `.orquestrador.json` de um projeto do catálogo.

import fs from 'node:fs/promises';
import path from 'node:path';
import { validarContrato } from './politica.js';

export const RAIZ = path.resolve(import.meta.dirname, '../..');
const REPOSITORIO = path.resolve(import.meta.dirname, '..');

export async function contratoDoProjeto(projeto, raiz) {
  if (!projeto || projeto.area !== 'ProjetosPessoais') return { contrato: null, erros: [] };
  const pasta = raiz === RAIZ && projeto.pasta === 'painel-admin'
    ? REPOSITORIO : path.join(raiz, projeto.pasta, projeto.subRepo ?? '');
  const arquivo = path.join(pasta, '.orquestrador.json');
  try {
    const contrato = JSON.parse(await fs.readFile(arquivo, 'utf8'));
    return { contrato, erros: validarContrato(contrato, projeto.plane) };
  } catch (e) {
    if (e.code === 'ENOENT') return { contrato: null, erros: [] };
    return { contrato: {}, erros: ['arquivo local ilegível'] };
  }
}

export function recusa(mensagem) {
  const erro = new Error(mensagem);
  erro.semEscrita = true;
  return erro;
}

export async function todas(consultar, url) {
  const itens = [];
  let cursor;
  do {
    const sep = url.includes('?') ? '&' : '?';
    const pagina = await consultar(`${url}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(pagina.results)) throw new Error('resposta paginada inválida do Plane');
    itens.push(...pagina.results);
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return itens;
}
