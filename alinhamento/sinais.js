// Junta os sinais de um projeto. Git, current.md e fio moram ao lado.

import path from 'node:path';
import { CANDIDATOS_DOCS, existe } from './medidas.js';
import { SinalGit } from './sinal-git.js';
import { SinalCurrent } from './sinal-current.js';
import { SinalFio } from './sinal-fio.js';

export class SinaisProjeto {
  constructor({ dirDe, git, portaoDocs }) {
    this.dirDe = dirDe;
    this.git = new SinalGit(git);
    this.current = new SinalCurrent();
    this.fio = new SinalFio();
    this.portaoDocs = portaoDocs;
  }

  async docs(dirRepo) {
    const docs = {};
    for (const [tipo, candidatos] of Object.entries(CANDIDATOS_DOCS)) {
      docs[tipo] = null;
      for (const cand of candidatos) if (await existe(path.join(dirRepo, cand))) { docs[tipo] = cand; break; }
    }
    return docs;
  }

  async de(p, plane, fios) {
    const dir = this.dirDe(p);
    const dirRepo = p.subRepo ? path.join(dir, p.subRepo) : dir;
    const sinais = [];
    if (!(await existe(dir))) {
      sinais.push({ tipo: 'catalogo', gravidade: 'alta', texto: 'pasta do catálogo não existe no disco' });
      return { pasta: p.pasta, titulo: p.titulo, sinais, docs: {} };
    }
    const docs = await this.docs(dirRepo);
    const git = await this.git.ler(dirRepo);
    sinais.push(...git.sinais);
    sinais.push(...await this.current.ler({ dirRepo, dataCommit: git.dataCommit, temGit: git.temGit, plane, projeto: p }));
    const erros = await this.portaoDocs(dirRepo);
    if (erros) sinais.push({ tipo: 'check_docs', gravidade: 'alta', texto: `portão de docs com ${erros} erro(s)` });
    sinais.push(...this.fio.ler({ plane, projeto: p, fios }));
    return { pasta: p.pasta, titulo: p.titulo, congelado: p.congelado === true, docs, sinais };
  }
}
