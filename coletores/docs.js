// Docs de um projeto do catálogo, já dentro da raiz. A lista e o corte moram ao lado.

import path from 'node:path';
import fs from 'node:fs/promises';
import { PROJETOS } from '../projetos.js';
import { dirDoProjeto, resolverDentroDaRaiz } from './caminhos.js';
import { lerArquivoMd } from './leitura-md.js';
import { listarModeladores } from './modeladores.js';

function trechosProjeto(projeto, ...resto) {
  return projeto.subRepo ? [projeto.area, projeto.pasta, projeto.subRepo, ...resto] : [projeto.area, projeto.pasta, ...resto];
}

export class DocsProjeto {
  async curados(dirProjeto, docsDeclarados) {
    const grupos = {};
    for (const grupo of ['arquitetura', 'objetos', 'dataFlow']) {
      grupos[grupo] = await Promise.all(
        (docsDeclarados[grupo] ?? []).map(async (caminho) => {
          try {
            const conteudo = await lerArquivoMd(path.join(dirProjeto, caminho));
            return { caminho, conteudo };
          } catch (erro) {
            return { caminho, erro: erro?.code ?? String(erro?.message ?? erro) };
          }
        }),
      );
    }
    return grupos;
  }

  async doProjeto(pasta) {
    const projeto = PROJETOS.find((p) => p.pasta === pasta);
    if (!projeto) return { erro: 'projeto não encontrado' };

    const caminho = dirDoProjeto(projeto);
    const existe = await fs.access(caminho).then(() => true, () => false);
    if (!existe) return { erro: 'pasta não sincronizada nesta máquina' };

    const dirProjeto = resolverDentroDaRaiz(...trechosProjeto(projeto));
    if (!dirProjeto) return { erro: 'projeto não encontrado' };

    const [modeladores, curados] = await Promise.all([
      listarModeladores(dirProjeto).catch(() => []),
      this.curados(dirProjeto, projeto.docs ?? {}),
    ]);
    return { modeladores, curados };
  }

  async modelador(pasta, arquivo) {
    const projeto = PROJETOS.find((p) => p.pasta === pasta);
    if (!projeto) return { erro: 'projeto não encontrado' };
    if (!arquivo || !arquivo.toLowerCase().endsWith('.md')) return { erro: 'arquivo precisa ser um .md' };

    const alvo = resolverDentroDaRaiz(...trechosProjeto(projeto, arquivo));
    if (!alvo) return { erro: 'caminho de arquivo inválido' };
    try {
      return { caminho: arquivo, conteudo: await lerArquivoMd(alvo) };
    } catch (erro) {
      return { erro: erro?.code === 'ENOENT' ? 'arquivo não encontrado' : String(erro?.message ?? erro) };
    }
  }
}

export function docsProjeto(pasta) {
  return new DocsProjeto().doProjeto(pasta);
}

export function lerModeladorProjeto(pasta, arquivo) {
  return new DocsProjeto().modelador(pasta, arquivo);
}
