// Diário das trocas. O valor de uma chave nunca entra num evento.

import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from '../orquestrador/leitor-jsonl.js';

export class DiarioChaves {
  constructor({ diretorioEstado, agora = Date.now }) {
    this.diretorio = diretorioEstado;
    this.arquivo = path.join(diretorioEstado, 'chaves.jsonl');
    this.agora = agora;
  }

  async ler() {
    // O mesmo leitor dos outros diários (N4c): cauda interrompida não derruba o histórico.
    let texto;
    try { texto = await fs.readFile(this.arquivo, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('eventos de chaves ilegíveis'); }
    try { return lerJsonl(texto, 'eventos de chaves').linhas; }
    catch { throw new Error('eventos de chaves ilegíveis'); }
  }

  async anotar(evento) {
    if ('valor' in evento) throw new Error('evento de chave nunca leva valor');
    await fs.mkdir(this.diretorio, { recursive: true });
    await anexarJsonl(this.arquivo, { quando: new Date(this.agora()).toISOString(), ...evento });
  }
}
