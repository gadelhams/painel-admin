// Monta o resumo de cada projeto: existência, git e portas. Não sonda produção.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { RAIZ, dirDoProjeto } from './caminhos.js';
import { LeituraGit } from './git-local.js';
import { SondaPorta } from './portas-locais.js';

export class EstadoLocal {
  constructor({ git = new LeituraGit(), portas = new SondaPorta(), projetos = PROJETOS } = {}) {
    this.git = git;
    this.portas = portas;
    this.projetos = projetos;
  }

  async projeto(projeto) {
    const caminho = dirDoProjeto(projeto);
    let existe = true;
    try {
      await fs.access(caminho);
    } catch {
      existe = false;
    }

    const caminhoRepo = projeto.subRepo ? path.join(caminho, projeto.subRepo) : caminho;
    const [gitInfo, portas] = await Promise.all([
      existe ? this.git.resumo(caminhoRepo) : { repositorio: false },
      this.portas.doProjeto(projeto),
    ]);

    return {
      pasta: projeto.pasta,
      titulo: projeto.titulo,
      descricao: projeto.descricao,
      stack: projeto.stack,
      entrada: projeto.entrada,
      producao: projeto.producao ?? null,
      congelado: projeto.congelado === true,
      existe,
      git: gitInfo,
      portas,
    };
  }

  async ler() {
    return { raiz: RAIZ, projetos: await Promise.all(this.projetos.map((p) => this.projeto(p))) };
  }
}

export function estadoProjetos() {
  return new EstadoLocal().ler();
}
