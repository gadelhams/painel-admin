// Sandbox `bwrap` dos filhos do executor (J60): as CLIs dos três papéis e o comando de aceite rodam com as chaves do painel mascaradas. Não decide quem roda; só embrulha e sonda.
//
// O que fica de fora do alcance do filho (F4b, contrato da F4 item 5):
// - tmpfs por cima de `~/.config/plane` (as chaves de escrita, inclusive a do zelador e a de
//   Admin), `~/.local/state/painel-admin` (play, frota, leases, reservas; só o worktree e os logs
//   DA tentativa voltam por re-bind), `~/.ssh`, `~/.config/linear` e `~/.config/gh`;
// - `/dev/null` por cima do `.env` do painel e do de cada projeto do catálogo (só os que existem:
//   um ponto de montagem ausente seria criado no disco de verdade, porque `/` vai por bind);
// - `/dev` mínimo do bwrap (null, zero, random, tty, shm), não o da máquina;
// - `/proc` novo num pid namespace próprio: sem ele, o `/proc/<pid do painel>/environ` (com a
//   chave Guest e as de escrita legadas do `.env`) seria legível pelo mesmo usuário;
// - rede: mantida para as CLIs (precisam da API do provedor), cortada (`--unshare-net`) para o
//   comando de aceite, salvo `redeNoAceite: true` no contrato.
// `--die-with-parent` e nada de `--new-session`: o grupo de processos continua o do bwrap, e o
// `kill(-pgid)` do ProcessoCli (tempo esgotado) e a vigia de pgid da J51 seguem valendo.
// Sem bwrap funcional (sonda falha) o gate do zelador é inelegível, com o motivo (falha fechada).
import { spawn as spawnPadrao } from 'node:child_process';
import { constants as FS, existsSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { RAIZ } from './contrato-local.js';

export const BWRAP_PADRAO = '/usr/bin/bwrap';
const REPOSITORIO = path.resolve(import.meta.dirname, '..');
const SONDA_VALIDA_MS = 10 * 60_000;

// O `.env` de cada projeto do catálogo (raiz do projeto e do sub-repositório) e o do painel.
function arquivosEnvDoCatalogo({ projetos = PROJETOS, raiz = RAIZ, repositorio = REPOSITORIO } = {}) {
  const base = p => (p.area === 'ProjetosCompartilhados' ? path.join(raiz, '..', 'ProjetosCompartilhados', p.pasta) : path.join(raiz, p.pasta));
  const todos = projetos.flatMap(p => [path.join(base(p), '.env'), ...(p.subRepo ? [path.join(base(p), p.subRepo, '.env')] : [])]);
  return [...new Set([path.join(repositorio, '.env'), ...todos])];
}

export class SandboxCli {
  constructor({ bwrap = BWRAP_PADRAO, home = os.homedir(), diretorioPainel = path.join(home, '.local', 'state', 'painel-admin'),
    arquivosEnv = arquivosEnvDoCatalogo(), spawn = spawnPadrao, agora = Date.now } = {}) {
    this.bwrap = bwrap;
    this.home = home;
    this.diretorioPainel = diretorioPainel;
    this.arquivosEnv = arquivosEnv;
    this.spawn = spawn;
    this.agora = agora;
    this.ultima = null;
  }

  // Lidas a cada embrulho: um `.env` criado depois do arranque também é mascarado.
  mascaras() {
    const existe = (p, tipo) => { try { const s = statSync(p); return tipo === 'dir' ? s.isDirectory() : s.isFile(); } catch { return false; } };
    const pastas = [path.join(this.home, '.config', 'plane'), this.diretorioPainel, path.join(this.home, '.ssh'),
      path.join(this.home, '.config', 'linear'), path.join(this.home, '.config', 'gh')].filter(p => existe(p, 'dir'));
    return { pastas, arquivos: this.arquivosEnv.filter(p => existe(p, 'arquivo')) };
  }

  /**
   * Os argumentos do bwrap para um filho. `gravaveis`: pastas que voltam por re-bind por cima
   * das máscaras (o worktree e os logs da tentativa); `rede: false` corta a rede.
   */
  argumentos({ executavel, argumentos = [], gravaveis = [], rede = true }) {
    if (typeof executavel !== 'string' || !path.isAbsolute(executavel)) throw new Error('executável do sandbox precisa de caminho absoluto');
    const { pastas, arquivos } = this.mascaras();
    const religar = gravaveis.map(p => path.resolve(p));
    for (const p of religar) if (!existsSync(p)) throw new Error(`pasta gravável do sandbox ausente: ${p}`);
    // `--dev /dev`: o `--bind` monta com nodev, e sem um /dev próprio o `claude` (Bun) aborta na
    // partida (provado em 31/10/2026, bubblewrap 0.12.0).
    return ['--die-with-parent', '--bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc',
      ...pastas.flatMap(p => ['--tmpfs', p]), ...arquivos.flatMap(f => ['--ro-bind', '/dev/null', f]),
      ...religar.flatMap(p => ['--bind', p, p]), ...(rede ? [] : ['--unshare-net']), '--', executavel, ...argumentos];
  }

  embrulhar(pedido) {
    return { executavel: this.bwrap, argumentos: this.argumentos(pedido) };
  }

  // Roda `true` sob as mesmas máscaras e sem rede. { ok, motivo, em }; guardada 10 min.
  async sondar({ forcar = false } = {}) {
    if (!forcar && this.ultima && this.agora() - Date.parse(this.ultima.em) < SONDA_VALIDA_MS) return this.ultima;
    const em = new Date(this.agora()).toISOString();
    let motivo = null;
    try { await fs.access(this.bwrap, FS.X_OK); } catch { motivo = `bwrap ausente em ${this.bwrap}`; }
    if (!motivo) {
      const verdadeiro = ['/usr/bin/true', '/bin/true'].find(p => existsSync(p));
      if (!verdadeiro) motivo = 'true ausente para a sonda';
      else {
        motivo = await new Promise(resolve => {
          let filho;
          try { filho = this.spawn(this.bwrap, this.argumentos({ executavel: verdadeiro, rede: false }), { stdio: ['ignore', 'ignore', 'pipe'] }); }
          catch (e) { resolve(`bwrap não iniciou: ${e.message}`); return; }
          let erro = '';
          const prazo = setTimeout(() => { try { filho.kill('SIGKILL'); } catch { /* já saiu */ } }, 10_000);
          filho.stderr?.on('data', d => { erro = (erro + d).slice(-300); });
          filho.on('error', e => { clearTimeout(prazo); resolve(`bwrap não iniciou: ${e.message}`); });
          filho.on('close', codigo => { clearTimeout(prazo); resolve(codigo === 0 ? null : `bwrap falhou (código ${codigo}): ${erro.trim().split('\n').at(-1) ?? ''}`.trim()); });
        });
      }
    }
    this.ultima = { ok: !motivo, motivo, em };
    return this.ultima;
  }
}
