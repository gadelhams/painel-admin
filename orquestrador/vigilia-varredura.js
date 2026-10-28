// Percorre os projetos ligados. O passo de uma carta mora em passo-vigilia.js.

import { PassoVigilia } from './passo-vigilia.js';

export class VigiliaVarredura {
  constructor({ servico, projetos, intervaloMs, registrarLog, livro, memoria, controle, ocupada }) {
    this.projetos = projetos;
    this.intervaloMs = intervaloMs;
    this.registrarLog = registrarLog;
    this.livro = livro;
    this.memoria = memoria;
    this.ocupada = ocupada;
    this.temporizador = null;
    this.passo = new PassoVigilia({ servico, registrarLog, livro, memoria, controle });
  }

  async varrer() {
    if (this.ocupada.atual) return { pulada: true };
    this.ocupada.atual = true;
    const resultados = [];
    try {
      for (const p of this.projetos.filter(x => x.plane)) {
        const local = await this.livro.ler(p.plane);
        if (!local.ligada) continue;
        try { resultados.push(await this.passo.projeto(p, local)); }
        catch (erro) {
          this.memoria.set(p.plane, { ...this.memoria.get(p.plane), ultimaVarredura: this.livro.iso(), motivoOciosa: `erro na varredura: ${erro.message}` });
          await this.livro.anotar(p.plane, { tipo: 'ERRO', etapa: 'varredura', motivo: erro.message }).catch(() => {});
          this.registrarLog(`[vigilia] varredura de ${p.pasta} falhou: ${erro.message}`);
          resultados.push({ projetoId: p.plane, erro: erro.message });
        }
      }
    } finally { this.ocupada.atual = false; }
    return resultados;
  }

  iniciar() {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => { this.varrer().catch(e => this.registrarLog(`[vigilia] ${e.message}`)); }, this.intervaloMs);
    this.temporizador.unref?.();
  }

  parar() { if (this.temporizador) clearInterval(this.temporizador); this.temporizador = null; }
}
