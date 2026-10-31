// Leases do zelador em disco: um global (um job por vez no Hangar) e um por projeto, com jobId e prazo. Toda operação sob a trava global; não chama CLI nem Plane.
//
// J14 do plano e J53 do parecer (31/10/2026): adquirir, renovar e soltar comparam o jobId
// sob `comTrava`; quem vai escrever no Plane chama `conferirSobTrava` dentro da mesma trava
// da escrita (fencing) — lease vencido, de outro job ou ilegível recusa a escrita. Lease
// ilegível conta como ocupado; a saída explícita é apagar o arquivo à mão (o motivo diz qual).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UUID } from './uuid.js';

const TTL_LEASE_ZELADOR_MS = 20 * 60_000;

export class LeaseZelador {
  constructor({ diretorio, comTrava, agora = Date.now, ttlMs = TTL_LEASE_ZELADOR_MS }) {
    this.pasta = path.join(diretorio, 'zelador');
    this.comTrava = comTrava;
    this.agora = agora;
    this.ttlMs = ttlMs;
  }

  caminho(projetoId = null) {
    if (projetoId !== null && !UUID.test(projetoId)) throw new Error('projeto inválido para o lease do zelador');
    return path.join(this.pasta, projetoId ? `lease-${projetoId.toLowerCase()}.json` : 'lease-global.json');
  }

  async ler(projetoId = null) {
    const arquivo = this.caminho(projetoId);
    let d;
    try { d = JSON.parse(await fs.readFile(arquivo, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; return { ilegivel: true, arquivo }; }
    if (!UUID.test(d?.jobId ?? '') || !Number.isFinite(Date.parse(d?.expiraEm))) return { ilegivel: true, arquivo };
    return d;
  }

  vigente(l) { return l && !l.ilegivel && Date.parse(l.expiraEm) > this.agora(); }

  async gravar(projetoId, lease) {
    await fs.mkdir(this.pasta, { recursive: true });
    const destino = this.caminho(projetoId);
    const temporario = `${destino}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporario, JSON.stringify(lease), { flag: 'wx' });
      await fs.rename(temporario, destino);
    } finally { await fs.rm(temporario, { force: true }).catch(() => {}); }
  }

  // { ok, motivo }: sem escrita quando recusa.
  adquirir(jobId, projetoId) {
    return this.comTrava(async () => {
      for (const alvo of [null, projetoId]) {
        const l = await this.ler(alvo);
        if (l?.ilegivel) return { ok: false, motivo: `lease do zelador ilegível (${l.arquivo}); apague o arquivo à mão para liberar` };
        if (this.vigente(l) && l.jobId !== jobId) return { ok: false, motivo: alvo ? 'outro job do zelador neste projeto' : `outro job do zelador em curso (${l.projetoId ?? '?'})` };
      }
      const agora = this.agora();
      const lease = { jobId, projetoId, adquiridoEm: new Date(agora).toISOString(), expiraEm: new Date(agora + this.ttlMs).toISOString() };
      await this.gravar(null, lease);
      await this.gravar(projetoId, lease);
      return { ok: true, lease };
    });
  }

  // Fencing (J53): quem chama já segura a trava. Lança se o job não é mais o dono vigente.
  async conferirSobTrava(jobId, projetoId) {
    for (const alvo of [null, projetoId]) {
      const l = await this.ler(alvo);
      if (!this.vigente(l) || l.jobId !== jobId) throw new Error('lease do zelador perdido ou vencido; escrita abortada');
    }
  }

  renovar(jobId, projetoId) {
    return this.comTrava(async () => {
      await this.conferirSobTrava(jobId, projetoId);
      const l = await this.ler(null);
      const expiraEm = new Date(this.agora() + this.ttlMs).toISOString();
      await this.gravar(null, { ...l, expiraEm });
      await this.gravar(projetoId, { ...l, expiraEm });
      return expiraEm;
    });
  }

  // Solta só o que é do job; lease de outro job fica.
  soltar(jobId, projetoId) {
    return this.comTrava(async () => {
      for (const alvo of [projetoId, null]) {
        const l = await this.ler(alvo);
        if (l && !l.ilegivel && l.jobId === jobId) await fs.rm(this.caminho(alvo), { force: true });
      }
    });
  }
}
