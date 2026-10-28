// Decisões derivadas do backlog. A idade do markdown vem de idade-linha.js; a do Plane, da criação do item.

import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { dirDoProjeto } from './caminhos.js';
import { lerBacklog } from './backlog.js';
import { IdadeLinha } from './idade-linha.js';

export class DecisoesBacklog {
  constructor({ idade = new IdadeLinha() } = {}) {
    this.idade = idade;
  }

  nodosComTag(nodos) {
    const achados = [];
    for (const nodo of nodos ?? []) {
      if (nodo.tags?.length) achados.push(nodo);
      achados.push(...this.nodosComTag(nodo.filhos));
    }
    return achados;
  }

  async listar() {
    const { projetos } = await lerBacklog();
    const pendentes = [];

    for (const pr of projetos) {
      if (pr.estado !== 'ok') continue;
      const projeto = PROJETOS.find((p) => p.pasta === pr.pasta);
      if (!projeto) continue;

      const caminhoRepo = projeto.subRepo ? path.join(dirDoProjeto(projeto), projeto.subRepo) : dirDoProjeto(projeto);
      const caminhoRelativo = pr.fonte === 'plane' ? null : projeto.subRepo && pr.backlog.startsWith(`${projeto.subRepo}/`)
        ? pr.backlog.slice(projeto.subRepo.length + 1)
        : pr.backlog;

      for (const feature of pr.features) {
        for (const nodo of this.nodosComTag(feature.itens)) {
          for (const tag of nodo.tags) {
            pendentes.push({
              id: `${pr.pasta}:${nodo.identificador ?? nodo.linha}:${tag.tag}`,
              projeto: pr.pasta,
              tituloProjeto: pr.titulo,
              arquivo: pr.backlog,
              feature: feature.titulo,
              texto: nodo.texto,
              tag: tag.tag,
              detalhe: tag.detalhe ?? null,
              estado: nodo.estado ?? 'aberto',
              linha: nodo.linha,
              identificador: nodo.identificador ?? null,
              url: nodo.url ?? null,
              criadoEm: nodo.criadoEm ?? null,
              caminhoRepo,
              caminhoRelativo,
            });
          }
        }
      }
    }

    const decisoes = await Promise.all(pendentes.map(async ({ caminhoRepo, caminhoRelativo, criadoEm, ...decisao }) => ({
      ...decisao,
      desde: caminhoRelativo === null ? criadoEm : await this.idade.desde(caminhoRepo, caminhoRelativo, decisao.linha),
    })));
    return { decisoes };
  }
}

export function decisoesDoBacklog() {
  return new DecisoesBacklog().listar();
}
