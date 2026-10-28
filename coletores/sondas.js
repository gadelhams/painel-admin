// Quais endereços de produção sondar. O GET mora em sonda-https.js.

import { PROJETOS, PRODUCAO_EXTRA } from '../projetos.js';
import { SondaHttps } from './sonda-https.js';

export class EstadoProducao {
  constructor({ sonda = new SondaHttps(), projetos = PROJETOS, extra = PRODUCAO_EXTRA } = {}) {
    this.sonda = sonda;
    this.projetos = projetos;
    this.extra = extra;
  }

  async ler() {
    const alvos = [
      ...this.projetos.filter((p) => p.producao).map((p) => ({ rotulo: p.titulo, url: p.producao })),
      ...this.extra,
    ];
    const sondas = await Promise.all(
      alvos.map(async (a) => ({ rotulo: a.rotulo, ...(await this.sonda.pedir(a.url, a.conferirCorpo)) })),
    );
    return { sondas };
  }
}

export function estadoProducao() {
  return new EstadoProducao().ler();
}
