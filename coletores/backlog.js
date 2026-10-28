// Monta o backlog de cada projeto: Plane quando há id, markdown no resto. Nada é escrito.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { lerWorkspacePlane, montarFeatures } from '../plane.js';
import { dirDoProjeto } from './caminhos.js';
import { parsearBacklog } from './parser-backlog.js';

export async function lerBacklog(projetos = PROJETOS, { lerPlane = lerWorkspacePlane } = {}) {
  const doPlane = projetos.filter((p) => p.plane);
  let plane = null;
  let erroPlane = null;
  if (doPlane.length) {
    try {
      plane = await lerPlane();
    } catch (erro) {
      erroPlane = String(erro?.message ?? erro);
    }
  }
  return {
    projetos: await Promise.all(
      projetos
        .filter((p) => p.backlog || p.plane)
        .map(async (p) => {
          if (p.plane) {
            const base = { pasta: p.pasta, titulo: p.titulo, fonte: 'plane', backlog: 'Plane' };
            if (erroPlane) return { ...base, estado: 'erro_plane', erro: erroPlane };
            const montado = montarFeatures(plane, p.plane);
            if (!montado) return { ...base, estado: 'erro_plane', erro: `projeto ${p.plane} não existe ou o usuário "painel" não é membro dele` };
            return { ...base, backlog: `Plane · ${montado.nome}`, url: montado.url, estado: 'ok', features: montado.features };
          }
          const base = { pasta: p.pasta, titulo: p.titulo, fonte: 'markdown', backlog: p.backlog };
          try {
            const bruto = await fs.readFile(path.join(dirDoProjeto(p), p.backlog), 'utf8');
            return { ...base, estado: 'ok', features: parsearBacklog(bruto) };
          } catch (erro) {
            if (erro?.code === 'ENOENT') return { ...base, estado: 'sem_arquivo' };
            return { ...base, estado: 'erro_leitura', erro: erro?.code ?? String(erro?.message ?? erro) };
          }
        }),
    ),
  };
}
