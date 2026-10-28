// Processo ssh sem shell. Não interpreta status nem redige segredo.

import { spawn } from 'node:child_process';

const TIMEOUT_SSH_MS = 15_000;
const MAX_SAIDA = 1024 * 1024;

export class ProcessoSsh {
  constructor({ binario = 'ssh', timeoutMs = TIMEOUT_SSH_MS, maxSaida = MAX_SAIDA } = {}) {
    this.binario = binario;
    this.timeoutMs = timeoutMs;
    this.maxSaida = maxSaida;
  }

  executar(args, stdin) {
    return new Promise((resolve, reject) => {
      const filho = spawn(this.binario, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: this.timeoutMs,
        killSignal: 'SIGKILL',
      });
      const stdout = [];
      const stderr = [];
      let tamanho = 0;
      filho.stdout.on('data', (pedaco) => {
        tamanho += pedaco.length;
        if (tamanho > this.maxSaida) { filho.kill('SIGKILL'); return; }
        stdout.push(pedaco);
      });
      filho.stderr.on('data', (pedaco) => stderr.push(pedaco));
      filho.on('error', reject);
      filho.on('close', (codigo, sinal) => {
        resolve({
          codigo: sinal ? null : codigo,
          sinal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
      filho.stdin.on('error', () => { /* o processo morreu antes de ler; o close reporta */ });
      filho.stdin.end(stdin ?? '');
    });
  }
}

export function criarExecutorSsh(opcoes) {
  const processo = new ProcessoSsh(opcoes);
  return (args, stdin) => processo.executar(args, stdin);
}

export const executarSsh = criarExecutorSsh();
