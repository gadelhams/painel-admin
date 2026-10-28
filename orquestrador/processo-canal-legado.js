// Um processo do leitor legado. Não escolhe a config e não guarda cache.

export class ProcessoCanalLegado {
  constructor({ diretorioSupervisor, executavel, script, timeoutMs, maxSaida, spawn, normalizar }) {
    this.diretorioSupervisor = diretorioSupervisor;
    this.executavel = executavel;
    this.script = script;
    this.timeoutMs = timeoutMs;
    this.maxSaida = maxSaida;
    this.spawn = spawn;
    this.normalizar = normalizar;
  }

  ler(config) {
    return new Promise(resolve => {
      const indisponivel = motivo => resolve({ config, disponivel: false, motivo });
      const pedacos = [];
      let total = 0;
      let filho;
      try { filho = this.spawn(this.executavel, [this.script, '--config', config], { cwd: this.diretorioSupervisor, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (erro) { return indisponivel(`leitor legado não iniciou: ${erro.code ?? erro.message}`); }
      const temporizador = setTimeout(() => { try { filho.kill('SIGKILL'); } catch { /* já morreu */ } }, this.timeoutMs);
      let estourou = false;
      filho.stdout.on('data', p => { total += p.length; if (total <= this.maxSaida) pedacos.push(p); else estourou = true; });
      filho.stderr.on('data', () => { /* ruído do parser; o JSON vai pelo stdout */ });
      filho.on('error', erro => { clearTimeout(temporizador); indisponivel(`leitor legado não iniciou: ${erro.code ?? erro.message}`); });
      filho.on('close', (codigo, sinal) => {
        clearTimeout(temporizador);
        if (sinal) return indisponivel(`leitor legado excedeu ${Math.round(this.timeoutMs / 1000)} s`);
        if (codigo !== 0) return indisponivel(`leitor legado terminou com código ${codigo}`);
        if (estourou) return indisponivel('saída do leitor legado acima do teto');
        try { resolve(this.normalizar(JSON.parse(Buffer.concat(pedacos).toString('utf8')), config)); }
        catch (erro) { indisponivel(`saída do leitor legado ilegível: ${erro.message}`); }
      });
    });
  }
}
