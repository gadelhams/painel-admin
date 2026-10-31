// Trava de instância do agendador (vigília e zelador): só o processo com ORQ_AGENDADOR=true e o pid gravado em disco agenda. Não varre nem despacha.
//
// J52 (parecer de 31/10/2026): o smoke na 7787 usa o mesmo diretório de estado e o mesmo
// `.env`; com dois processos haveria dois agendadores. A flag mora só na unit systemd
// (`docs/operacao.md`), e mesmo com ela o arquivo `agendador.json` decide: pid vivo de outro
// processo recusa; pid morto ou arquivo ilegível é tomado, sob a trava global. A cada volta
// do relógio o dono do arquivo é conferido de novo; se não for este processo, não agenda.
// Pid reaproveitado por outro programa conta como vivo: falha fechada (ninguém agenda até
// alguém apagar o arquivo à mão). Quem não tomou no arranque tenta de novo de tempos em tempos
// (`tomarEVigiar`, B21): o agendador volta sozinho quando o dono antigo morre.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const vivo = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export class InstanciaAgendador {
  constructor({ diretorio, comTrava, habilitado, pid = process.pid, processoVivo = vivo, agora = Date.now }) {
    this.arquivo = path.join(diretorio, 'agendador.json');
    this.diretorio = diretorio;
    this.comTrava = comTrava;
    this.habilitado = habilitado === true;
    this.pid = pid;
    this.processoVivo = processoVivo;
    this.agora = agora;
    this.tomada = false;
  }

  async lerDono() {
    try {
      const d = JSON.parse(await fs.readFile(this.arquivo, 'utf8'));
      return Number.isInteger(d?.pid) && d.pid > 0 ? d : { ilegivel: true };
    } catch (e) { return e.code === 'ENOENT' ? null : { ilegivel: true }; }
  }

  // Devolve { agenda, motivo }. Sem a flag nem tenta: o arquivo de quem agenda fica intacto.
  async tomar() {
    if (!this.habilitado) return { agenda: false, motivo: 'ORQ_AGENDADOR ausente: esta instância não agenda vigília nem zelador' };
    return this.comTrava(async () => {
      const dono = await this.lerDono();
      if (dono && !dono.ilegivel && dono.pid !== this.pid && this.processoVivo(dono.pid)) {
        this.tomada = false;
        return { agenda: false, motivo: `outra instância (pid ${dono.pid}) agenda desde ${dono.desde ?? '?'}` };
      }
      await fs.mkdir(this.diretorio, { recursive: true });
      const temporario = `${this.arquivo}.${randomUUID()}.tmp`;
      await fs.writeFile(temporario, JSON.stringify({ pid: this.pid, desde: new Date(this.agora()).toISOString() }), { flag: 'wx' });
      await fs.rename(temporario, this.arquivo);
      this.tomada = true;
      return { agenda: true, motivo: dono?.ilegivel ? 'arquivo do agendador ilegível foi tomado' : null };
    });
  }

  // Conferido em disco a cada volta: outro processo pode ter tomado o arquivo (pid morto aqui).
  async podeAgendar() {
    if (!this.habilitado || !this.tomada) return false;
    const dono = await this.lerDono();
    return Boolean(dono && !dono.ilegivel && dono.pid === this.pid);
  }

  // Toma agora ou tenta a cada `intervaloMs` até tomar; ao tomar, chama `aoTomar` uma vez.
  async tomarEVigiar(aoTomar, intervaloMs = 5 * 60_000) {
    let tentando = false;
    const tentar = async () => {
      if (tentando || this.tomada) return null;
      tentando = true;
      try {
        const r = await this.tomar();
        if (r.agenda) { this.pararVigia(); await aoTomar(r); }
        return r;
      } finally { tentando = false; }
    };
    const r = await tentar();
    if (!r.agenda && this.habilitado) {
      this.vigia = setInterval(() => { tentar().catch(() => {}); }, intervaloMs);
      this.vigia.unref?.();
    }
    return r;
  }

  pararVigia() { if (this.vigia) clearInterval(this.vigia); this.vigia = null; }

  async soltar() {
    if (!this.tomada) return;
    const dono = await this.lerDono();
    if (dono?.pid === this.pid) await fs.rm(this.arquivo, { force: true });
    this.tomada = false;
  }
}
