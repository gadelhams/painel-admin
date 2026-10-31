// O processo do outro lado de uma conexão TCP de loopback, pelo /proc (tabela de sockets + descritores). Só leitura; não decide nada.
//
// Serve à rota de reserva (PAINEL-54 item 9): quem pede não diz o próprio pid — o painel acha
// o dono do socket cliente. Só enxerga processos deste usuário (os /proc/<pid>/fd alheios são
// ilegíveis), o que basta: o agente local roda como o mesmo usuário do painel.
import fs from 'node:fs/promises';
import path from 'node:path';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const ehLoopback = endereco => LOOPBACK.has(endereco ?? '');

const porta = hex => Number.parseInt(hex.split(':').at(-1), 16);

async function inodeDoSocket({ portaCliente, portaServidor }, raizProc) {
  for (const arquivo of ['tcp', 'tcp6']) {
    const bruto = await fs.readFile(path.join(raizProc, 'net', arquivo), 'utf8').catch(() => '');
    for (const linha of bruto.split('\n').slice(1)) {
      const c = linha.trim().split(/\s+/);
      if (c.length < 10 || c[3] !== '01') continue;
      if (porta(c[1]) === portaCliente && porta(c[2]) === portaServidor) return c[9];
    }
  }
  return null;
}

// { remotePort, localPort } do socket aceito → pid do processo cliente, ou null.
export async function pidDoCliente(socket, { raizProc = '/proc' } = {}) {
  if (!socket || !ehLoopback(socket.remoteAddress) || !Number.isInteger(socket.remotePort) || !Number.isInteger(socket.localPort)) return null;
  const inode = await inodeDoSocket({ portaCliente: socket.remotePort, portaServidor: socket.localPort }, raizProc);
  if (!inode || inode === '0') return null;
  const alvo = `socket:[${inode}]`;
  const pids = (await fs.readdir(raizProc).catch(() => [])).filter(n => /^\d+$/.test(n));
  for (const pid of pids) {
    const fds = await fs.readdir(path.join(raizProc, pid, 'fd')).catch(() => []);
    for (const fd of fds) {
      if (await fs.readlink(path.join(raizProc, pid, 'fd', fd)).catch(() => null) === alvo) return Number(pid);
    }
  }
  return null;
}
