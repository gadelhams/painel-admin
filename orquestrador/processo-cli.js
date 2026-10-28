// Um processo filho: sem shell, grupo morto no tempo, saída capada e log em disco.

import { createWriteStream } from 'node:fs';

export class ProcessoCli {
  constructor({ spawn, env, agora = Date.now, maxSaidaBytes }) {
    this.spawn = spawn;
    this.env = env;
    this.agora = agora;
    this.maxSaidaBytes = maxSaidaBytes;
  }

  rodar({ executavel, argumentos, cwd, stdin = null, timeoutMs, maxSaidaBytes = this.maxSaidaBytes, log = null }) {
    return new Promise(resolve => {
      const inicio = this.agora();
      const saida = { stdout: [], stderr: [] };
      const bytes = { stdout: 0, stderr: 0, descartados: 0 };
      const arquivo = log ? createWriteStream(log, { flags: 'a' }) : null;
      arquivo?.write(`$ ${[executavel, ...argumentos].join(' ')}\n--- cwd ${cwd} ---\n`);
      let filho;
      try { filho = this.spawn(executavel, argumentos, { cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true }); }
      catch (erro) { arquivo?.end(); return resolve({ codigo: null, sinal: null, expirou: false, erroSpawn: erro.message, stdout: '', stderr: '', duracaoMs: 0 }); }
      let expirou = false;
      let erroSpawn = null;
      const matar = () => { try { process.kill(-filho.pid, 'SIGKILL'); } catch { try { filho.kill('SIGKILL'); } catch { /* já morreu */ } } };
      const temporizador = setTimeout(() => { expirou = true; matar(); }, timeoutMs);
      for (const fluxo of ['stdout', 'stderr']) {
        filho[fluxo].on('data', pedaco => {
          if (bytes[fluxo] + pedaco.length <= maxSaidaBytes) { saida[fluxo].push(pedaco); bytes[fluxo] += pedaco.length; arquivo?.write(pedaco); }
          else bytes.descartados += pedaco.length;
        });
      }
      filho.on('error', erro => { erroSpawn = erro.message; });
      filho.on('close', (codigo, sinal) => {
        clearTimeout(temporizador);
        arquivo?.end(`\n--- fim: código ${codigo} sinal ${sinal}${expirou ? ' (tempo esgotado)' : ''}${bytes.descartados ? ` (${bytes.descartados} bytes descartados)` : ''} ---\n`);
        resolve({ codigo, sinal, expirou, erroSpawn, stdout: Buffer.concat(saida.stdout).toString('utf8'),
          stderr: Buffer.concat(saida.stderr).toString('utf8'), duracaoMs: this.agora() - inicio, descartados: bytes.descartados });
      });
      filho.stdin.on('error', () => { /* processo morreu antes de ler o prompt: o retrato diz */ });
      if (stdin !== null) filho.stdin.end(stdin); else filho.stdin.end();
    });
  }
}
