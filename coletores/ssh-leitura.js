// SSH somente leitura do servidor, sob demanda: a rota /api/producao/ssh e a ferramenta do C-3PO usam esta classe e esta lista, e nenhuma outra.

import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHAVE_SSH_PADRAO = path.join(os.homedir(), '.ssh', 'paroquia-vultr');

// A allowlist inteira (invariante 2): uptime, systemctl is-active, docker ps, df, free.
// Fonte única desde a fase 3 (PAINEL-2): o teste confere que o texto destes comandos
// não aparece em nenhum outro módulo.
export const CONSULTAS_SSH = Object.freeze([
  "echo '== uptime =='; uptime -p",
  "echo; echo '== systemd =='",
  'for s in corre-do-tarado caddy; do printf "%s: " "$s"; systemctl is-active "$s"; done',
  "echo; echo '== docker =='; docker ps --format '{{.Names}}\t{{.Status}}'",
  "echo; echo '== disco =='; df -h / | tail -1",
  "echo; echo '== memoria =='; free -h | head -2",
]);

export const COMANDO_SSH = CONSULTAS_SSH.join('; ');

export class LeituraSsh {
  constructor({ chave = CHAVE_SSH_PADRAO, executar = execFileAsync } = {}) {
    this.chave = chave;
    this.executar = executar;
  }

  async consultar() {
    try {
      const { stdout } = await this.executar(
        'ssh',
        [
          '-o', 'BatchMode=yes',
          '-o', 'ConnectTimeout=8',
          '-i', this.chave,
          'linuxuser@astargne.com',
          COMANDO_SSH,
        ],
        { timeout: 30_000 },
      );
      return { ok: true, saida: stdout };
    } catch (erro) {
      return { ok: false, erro: erro.stderr?.trim() || erro.message };
    }
  }
}
