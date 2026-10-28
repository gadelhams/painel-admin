// Diário das trocas. O valor de uma chave nunca entra num evento.

import fs from 'node:fs/promises';
import path from 'node:path';

export class DiarioChaves {
  constructor({ diretorioEstado, agora = Date.now }) {
    this.diretorio = diretorioEstado;
    this.arquivo = path.join(diretorioEstado, 'chaves.jsonl');
    this.agora = agora;
  }

  async ler() {
    try { return (await fs.readFile(this.arquivo, 'utf8')).split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('eventos de chaves ilegíveis'); }
  }

  async anotar(evento) {
    if ('valor' in evento) throw new Error('evento de chave nunca leva valor');
    await fs.mkdir(this.diretorio, { recursive: true });
    await fs.appendFile(this.arquivo, `${JSON.stringify({ quando: new Date(this.agora()).toISOString(), ...evento })}\n`, 'utf8');
  }
}
