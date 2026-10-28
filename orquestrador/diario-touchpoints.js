// Diário JSONL dos touchpoints. Não cria nem apaga lease.

import fs from 'node:fs/promises';
import path from 'node:path';

export class DiarioTouchpoints {
  constructor({ diretorio, agora }) {
    this.log = path.join(diretorio, 'touchpoints.jsonl');
    this.agora = agora;
  }

  async daCarta(id) {
    let texto;
    try { texto = await fs.readFile(this.log, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    try { return texto.split('\n').filter(Boolean).map(JSON.parse).filter(x => x.cartaId === id); }
    catch { throw new Error('touchpoints ilegíveis'); }
  }

  async anotar(evento) {
    await fs.appendFile(this.log, `${JSON.stringify({ quando: new Date(this.agora()).toISOString(), ...evento })}\n`, 'utf8');
  }
}
