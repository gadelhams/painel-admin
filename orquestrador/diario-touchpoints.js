// Diário JSONL dos touchpoints. Não cria nem apaga lease.

import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from './leitor-jsonl.js';

export class DiarioTouchpoints {
  constructor({ diretorio, agora }) {
    this.log = path.join(diretorio, 'touchpoints.jsonl');
    this.agora = agora;
  }

  async daCarta(id) {
    let texto;
    try { texto = await fs.readFile(this.log, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return lerJsonl(texto, 'touchpoints').linhas.filter(x => x.cartaId === id);
  }

  async anotar(evento) {
    await anexarJsonl(this.log, { quando: new Date(this.agora()).toISOString(), ...evento });
  }
}
