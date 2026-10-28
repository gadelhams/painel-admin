// Diário da vigília: config e eventos em disco. Não escolhe carta nem despacha.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DIA_MS = 24 * 60 * 60_000;

export class DiarioVigilia {
  constructor({ diretorio, agora = Date.now }) {
    this.pasta = path.join(diretorio, 'vigilia');
    this.agora = agora;
  }

  iso() {
    return new Date(this.agora()).toISOString();
  }

  config(id) {
    return path.join(this.pasta, `${id}.json`);
  }

  eventos(id) {
    return path.join(this.pasta, `${id}.jsonl`);
  }

  async ler(id) {
    try { return JSON.parse(await fs.readFile(this.config(id), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return { ligada: false }; throw e; }
  }

  async gravar(id, cfg) {
    await fs.mkdir(this.pasta, { recursive: true });
    const temporario = `${this.config(id)}.${randomUUID()}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(cfg), { flag: 'wx' });
    await fs.rename(temporario, this.config(id));
  }

  async anotar(id, evento) {
    await fs.mkdir(this.pasta, { recursive: true });
    await fs.appendFile(this.eventos(id), `${JSON.stringify({ quando: this.iso(), ...evento })}\n`, 'utf8');
  }

  async linhas(id) {
    try { return (await fs.readFile(this.eventos(id), 'utf8')).split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('diário da vigília ilegível'); }
  }

  async tentativas24h(id) {
    const limite = this.agora() - DIA_MS;
    return (await this.linhas(id)).filter(e => e.tipo === 'TENTATIVA' && Date.parse(e.quando) > limite).length;
  }
}
