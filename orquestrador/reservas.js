// Reserva de carta por sessão (PAINEL-54, item 9: "como evitar double work?"): um lease local por carta, a consulta "reservada por outra sessão viva?" e o mapa pid → CLI. Porta: o script, a vigília, o despacho, a mesa, o zelador e o Hangar leem daqui. Não escreve no Plane.
//
// - Arquivo `<estado>/reservas/<cartaId>.json` (tmp + rename) e diário `reservas.jsonl` de acréscimo.
// - Viva = o processo da sessão existe com o MESMO início (/proc/<pid>/stat, campo 22: pid
//   reaproveitado não herda a reserva) e a validade (4 h, renovada a cada reserva da mesma
//   sessão) não venceu. Reserva morta ou vencida é tomada, com o motivo no diário.
// - Gravar e soltar seguram a trava da orquestração (o mesmo diretório da frota): a reserva e o
//   lease de uma tentativa nunca nascem juntos na mesma carta. A consulta não segura trava (a
//   reserva da frota a chama já sob ela) e falha fechada: arquivo ilegível = ocupada.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TravaDisco } from './trava.js';
import { UUID } from './uuid.js';

export const DIRETORIO_ESTADO = path.join(os.homedir(), '.local', 'state', 'painel-admin');
export const VALIDADE_RESERVA_MS = 4 * 60 * 60_000;
export const QUEM = new Set(['CLAUDE_CODE', 'CODEX', 'HUMANO']);
// O nome do executável que faz de um processo uma sessão de IA conhecida.
const CLIS = [['claude', 'CLAUDE_CODE'], ['codex', 'CODEX']];

// Início do processo em ticks desde o boot (campo 22 de /proc/<pid>/stat); null = não existe.
export async function inicioDoPid(pid, raizProc = '/proc') {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  const bruto = await fs.readFile(path.join(raizProc, String(pid), 'stat'), 'utf8').catch(() => null);
  if (!bruto) return null;
  const campos = bruto.slice(bruto.lastIndexOf(')') + 2).split(' ');
  return campos[19] ?? null;
}

async function paiDe(pid, raizProc) {
  const bruto = await fs.readFile(path.join(raizProc, String(pid), 'stat'), 'utf8').catch(() => null);
  if (!bruto) return null;
  const ppid = Number(bruto.slice(bruto.lastIndexOf(')') + 2).split(' ')[1]);
  return Number.isInteger(ppid) && ppid > 1 ? ppid : null;
}

async function cliDe(pid, raizProc) {
  const bruto = await fs.readFile(path.join(raizProc, String(pid), 'cmdline'), 'utf8').catch(() => '');
  const nome = path.basename(bruto.split('\0')[0] ?? '');
  return CLIS.find(([n]) => nome === n || nome.startsWith(`${n}-`))?.[1] ?? null;
}

// O ancestral mais próximo que é uma CLI conhecida: { quem, pid } ou null.
export async function sessaoAncestral(pid, { raizProc = '/proc', maxSaltos = 32 } = {}) {
  let atual = pid;
  for (let i = 0; i < maxSaltos && atual; i++) {
    const quem = await cliDe(atual, raizProc);
    if (quem) return { quem, pid: atual };
    atual = await paiDe(atual, raizProc);
  }
  return null;
}

export class ReservasCarta {
  constructor({ diretorioEstado = DIRETORIO_ESTADO, agora = Date.now, raizProc = '/proc', inicio = inicioDoPid } = {}) {
    this.diretorio = path.join(diretorioEstado, 'reservas');
    this.orquestracao = path.join(diretorioEstado, 'orquestracao');
    this.trava = new TravaDisco(this.orquestracao);
    this.agora = agora;
    this.inicio = pid => inicio(pid, raizProc);
  }

  caminho(cartaId) {
    if (!UUID.test(cartaId ?? '')) throw new Error('id de carta inválido');
    return path.join(this.diretorio, `${cartaId.toLowerCase()}.json`);
  }

  async ler(cartaId) {
    try { return JSON.parse(await fs.readFile(this.caminho(cartaId), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw new Error('reserva ilegível'); }
  }

  async viva(r) {
    if (!r || Date.parse(r.validaAte) <= this.agora()) return false;
    const inicio = await this.inicio(r.pid);
    return inicio !== null && inicio === r.inicioPid;
  }

  // A consulta das outras peças: null = livre; senão { motivo, reserva }. Ilegível = ocupada.
  async ocupadaPorOutro(cartaId, { pid = null } = {}) {
    let r;
    try { r = await this.ler(cartaId); }
    catch { return { motivo: 'reserva ilegível (tratada como ocupada)', reserva: null }; }
    if (!r || !(await this.viva(r)) || (pid !== null && r.pid === pid)) return null;
    return { motivo: `${r.carta ?? cartaId} reservada por ${r.quem} (pid ${r.pid}) até ${r.validaAte}`, reserva: r };
  }

  async todas() {
    let nomes;
    try { nomes = await fs.readdir(this.diretorio); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const saida = [];
    for (const n of nomes.filter(x => /^[0-9a-f-]{36}\.json$/.test(x))) {
      const r = await this.ler(n.slice(0, -5)).catch(() => null);
      if (r) saida.push({ ...r, viva: await this.viva(r) });
    }
    return saida;
  }

  async anotar(evento) {
    await fs.mkdir(this.diretorio, { recursive: true });
    await fs.appendFile(path.join(this.diretorio, 'reservas.jsonl'), `${JSON.stringify({ quando: new Date(this.agora()).toISOString(), ...evento })}\n`);
  }

  async gravar(r) {
    await fs.mkdir(this.diretorio, { recursive: true });
    const destino = this.caminho(r.cartaId);
    const tmp = `${destino}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(r), { flag: 'wx' });
    await fs.rename(tmp, destino);
  }

  // quem/pid: a sessão (CLI ancestral, ou o shell do humano). Recusa com { recusa } sem gravar.
  async reservar({ cartaId, carta, projetoId = null, quem, pid, pasta = null, sessao = null }) {
    if (!QUEM.has(quem) || !Number.isInteger(pid) || typeof carta !== 'string' || !/^[A-Z][A-Z0-9]*-\d+$/.test(carta)) throw new Error('reserva fora da forma');
    const inicioPid = await this.inicio(pid);
    if (inicioPid === null) throw new Error('processo da sessão não existe');
    return this.trava.segurar(async () => {
      const frota = await fs.access(path.join(this.orquestracao, 'leases', `${cartaId.toLowerCase()}.json`)).then(() => true, () => false);
      if (frota) return { recusa: `${carta}: tentativa da frota com lease nesta carta (ativa ou em revisão)` };
      const atual = await this.ler(cartaId).catch(() => ({ ilegivel: true }));
      if (atual?.ilegivel) return { recusa: `${carta}: reserva ilegível; conferir ${this.caminho(cartaId)}` };
      const mesma = atual && atual.pid === pid && atual.inicioPid === inicioPid;
      if (atual && !mesma) {
        if (await this.viva(atual)) return { recusa: `${carta} reservada por ${atual.quem} (pid ${atual.pid}) até ${atual.validaAte}` };
        await this.anotar({ tipo: 'TOMADA', cartaId, carta, de: { quem: atual.quem, pid: atual.pid },
          motivo: Date.parse(atual.validaAte) <= this.agora() ? 'reserva vencida' : 'processo da sessão morto' });
      }
      const validaAte = new Date(this.agora() + VALIDADE_RESERVA_MS).toISOString();
      const reserva = { versao: 1, id: mesma ? atual.id : randomUUID(), cartaId: cartaId.toLowerCase(), carta, projetoId, quem, pid, inicioPid,
        pasta, sessao, desde: mesma ? atual.desde : new Date(this.agora()).toISOString(), validaAte };
      await this.gravar(reserva);
      // A validade de toda reserva viva da mesma sessão é renovada junto.
      for (const outra of await this.todas()) {
        if (outra.cartaId !== reserva.cartaId && outra.pid === pid && outra.inicioPid === inicioPid && outra.viva) {
          const { viva: _, ...semViva } = outra;
          await this.gravar({ ...semViva, validaAte });
        }
      }
      await this.anotar({ tipo: mesma ? 'RENOVADA' : 'RESERVA', cartaId, carta, quem, pid, validaAte });
      return { reserva, renovada: Boolean(mesma) };
    });
  }

  // Só a própria sessão solta (ou qualquer um, se a reserva já morreu).
  async soltar({ cartaId, carta, pid }) {
    return this.trava.segurar(async () => {
      const atual = await this.ler(cartaId).catch(() => ({ ilegivel: true }));
      if (!atual) return { solta: false, motivo: `${carta}: sem reserva` };
      if (atual.ilegivel) return { recusa: `${carta}: reserva ilegível; conferir ${this.caminho(cartaId)}` };
      if (atual.pid !== pid && await this.viva(atual)) return { recusa: `${carta} é reserva de ${atual.quem} (pid ${atual.pid}); só ela solta` };
      await fs.unlink(this.caminho(cartaId));
      await this.anotar({ tipo: 'SOLTA', cartaId, carta, quem: atual.quem, pid: atual.pid, por: pid });
      return { solta: true, reserva: atual };
    });
  }
}
