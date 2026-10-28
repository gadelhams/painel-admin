// SSH somente leitura do servidor, sob demanda.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMANDO = [
  "echo '== uptime =='; uptime -p",
  "echo; echo '== systemd =='",
  'for s in corre-do-tarado caddy; do printf "%s: " "$s"; systemctl is-active "$s"; done',
  "echo; echo '== docker =='; docker ps --format '{{.Names}}\t{{.Status}}'",
  "echo; echo '== disco =='; df -h / | tail -1",
  "echo; echo '== memoria =='; free -h | head -2",
].join('; ');

export class LeituraSsh {
  constructor({ chave }) {
    this.chave = chave;
  }

  async consultar() {
    try {
      const { stdout } = await execFileAsync(
        'ssh',
        [
          '-o', 'BatchMode=yes',
          '-o', 'ConnectTimeout=8',
          '-i', this.chave,
          'linuxuser@astargne.com',
          COMANDO,
        ],
        { timeout: 30_000 },
      );
      return { ok: true, saida: stdout };
    } catch (erro) {
      return { ok: false, erro: erro.stderr?.trim() || erro.message };
    }
  }
}
