// Um arquivo de lease por carta. Não escreve o diário.

import fs from 'node:fs/promises';
import path from 'node:path';

export class ArquivoLease {
  constructor(diretorio) { this.diretorio = diretorio; }

  nome(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('id de carta inválido');
    return id.toLowerCase();
  }

  caminho(id) {
    return path.join(this.diretorio, 'leases', `${this.nome(id)}.json`);
  }

  async ler(id) {
    try { return JSON.parse(await fs.readFile(this.caminho(id), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`lease de ${id} ilegível`); }
  }

  async gravar(id, lease, sufixo) {
    const destino = this.caminho(id);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    const temporario = `${destino}.${sufixo}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(lease), { flag: 'wx' });
    await fs.rename(temporario, destino);
  }

  async apagar(id) {
    await fs.unlink(this.caminho(id));
  }

  async ids() {
    let arquivos;
    try { arquivos = await fs.readdir(path.join(this.diretorio, 'leases')); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return arquivos.filter(x => /^[0-9a-f-]{36}\.json$/i.test(x)).map(x => x.slice(0, -5));
  }
}
