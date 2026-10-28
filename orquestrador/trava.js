// Trava de diretório da orquestração. Quem espera desiste em 60 s; trava de processo morto é recuperada.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class TravaDisco {
  constructor(diretorio) {
    this.diretorio = diretorio;
    this.caminho = path.join(diretorio, '.trava');
  }

  async recuperar() {
    let info;
    try { info = await fs.stat(this.caminho); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (Date.now() - info.mtimeMs < 30_000) return;
    let dono;
    try { dono = JSON.parse(await fs.readFile(path.join(this.caminho, 'dono.json'), 'utf8')); }
    catch { dono = null; }
    if (Number.isInteger(dono?.pid)) {
      try { process.kill(dono.pid, 0); return; }
      catch (e) { if (e.code !== 'ESRCH') return; }
    }
    const orfa = `${this.caminho}.orfa-${randomUUID()}`;
    try {
      await fs.rename(this.caminho, orfa);
      await fs.rm(orfa, { recursive: true });
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  async segurar(acao) {
    await fs.mkdir(this.diretorio, { recursive: true });
    const TENTATIVAS = 3000;
    for (let i = 0; i < TENTATIVAS; i++) {
      try {
        await fs.mkdir(this.caminho);
        await fs.writeFile(path.join(this.caminho, 'dono.json'), JSON.stringify({ pid: process.pid, quando: new Date().toISOString() }));
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        await this.recuperar();
        if (i === TENTATIVAS - 1) throw new Error('trava da orquestração ocupada; intervenção necessária');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    try { return await acao(); }
    finally {
      await fs.unlink(path.join(this.caminho, 'dono.json'));
      await fs.rmdir(this.caminho);
    }
  }
}
