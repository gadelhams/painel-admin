// Diário da vigília: eventos em disco por projeto (`vigilia/<id>.jsonl`). Não escolhe carta nem despacha.
//
// Desde a F3 (31/10/2026) o "ligado" do projeto mora no play (play.js); o toggle antigo
// `vigilia/<id>.json` foi migrado e não é mais lido. Este diário continua: é a fonte do
// teto diário (`tentativas24h`) e do diário da frota.

import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from './leitor-jsonl.js';
import { CAUSAS_DA_FROTA } from './frota-pausas.js';

const DIA_MS = 24 * 60 * 60_000;

export class DiarioVigilia {
  constructor({ diretorio, agora = Date.now }) {
    this.pasta = path.join(diretorio, 'vigilia');
    this.agora = agora;
  }

  iso() {
    return new Date(this.agora()).toISOString();
  }

  eventos(id) {
    return path.join(this.pasta, `${id}.jsonl`);
  }

  async anotar(id, evento) {
    await fs.mkdir(this.pasta, { recursive: true });
    await anexarJsonl(this.eventos(id), { quando: this.iso(), ...evento });
  }

  async linhas(id) {
    let texto;
    try { texto = await fs.readFile(this.eventos(id), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return lerJsonl(texto, 'diário da vigília').linhas;
  }

  async tentativas24h(id) {
    const limite = this.agora() - DIA_MS;
    // Tentativa parada pela frota (CLI ou limite) não conta para o teto do dia.
    return (await this.linhas(id)).filter(e => e.tipo === 'TENTATIVA' && Date.parse(e.quando) > limite && !CAUSAS_DA_FROTA.has(e.causa)).length;
  }
}
