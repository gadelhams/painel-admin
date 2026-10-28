// Cache da varredura em disco. Não decide sinal.

import fs from 'node:fs/promises';
import path from 'node:path';

export class CacheAlinhamento {
  constructor(diretorioEstado) {
    this.diretorio = diretorioEstado;
    this.arquivo = path.join(diretorioEstado, 'alinhamento.json');
    this.dados = null;
  }

  async ler() {
    if (this.dados) return this.dados;
    try { this.dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch { this.dados = { varridoEm: null, fios: {} }; }
    if (!this.dados.fios) this.dados.fios = {};
    return this.dados;
  }

  async gravar() {
    await fs.mkdir(this.diretorio, { recursive: true });
    const tmp = `${this.arquivo}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.dados), 'utf8');
    await fs.rename(tmp, this.arquivo);
  }
}
