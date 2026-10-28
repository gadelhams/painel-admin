// Raiz e portão de caminho. Exitlag fica fora de propósito.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { PROJETOS } from '../projetos.js';

export const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..');

export const AREAS = ['ProjetosPessoais', 'ProjetosCompartilhados'];

export function dirDoProjeto(projeto) {
  return path.join(RAIZ, projeto.area, projeto.pasta);
}

export function trechosDoNome(nome) {
  const doCatalogo = PROJETOS.find((p) => p.pasta === nome);
  if (doCatalogo) return [doCatalogo.area, doCatalogo.pasta];
  const area = AREAS.find((a) => existsSync(path.join(RAIZ, a, nome)));
  return [area ?? AREAS[0], nome];
}

function temEscapeDeCaminho(trecho) {
  return trecho.split(/[\\/]/).some((parte) => parte === '..');
}

export function resolverDentroDaRaiz(...trechos) {
  if (trechos.some(temEscapeDeCaminho)) return null;
  const alvo = path.resolve(RAIZ, ...trechos);
  if (!AREAS.some((a) => alvo.startsWith(path.join(RAIZ, a) + path.sep))) return null;
  return alvo;
}
