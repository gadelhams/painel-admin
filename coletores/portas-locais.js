// Escuta TCP em 127.0.0.1. Não lê git.

import net from 'node:net';

export class SondaPorta {
  aberta(porta) {
    return new Promise((resolve) => {
      const soquete = net.createConnection({ host: '127.0.0.1', port: porta, timeout: 600 });
      soquete.once('connect', () => { soquete.destroy(); resolve(true); });
      soquete.once('error', () => resolve(false));
      soquete.once('timeout', () => { soquete.destroy(); resolve(false); });
    });
  }

  async doProjeto(projeto) {
    return Promise.all(projeto.portas.map(async (p) => ({ ...p, ativa: await this.aberta(p.porta) })));
  }
}
