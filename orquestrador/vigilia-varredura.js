// Percorre os projetos com play ligado. O passo de uma carta mora em passo-vigilia.js.
//
// O play é relido a cada projeto (J11) e de novo dentro da reserva (J66, passo-vigilia.js).
// O agendamento só existe na instância que tem a trava do agendador (J52): `podeAgendar` é
// conferido a cada volta do relógio, e sem ele a passada não roda.

import { PassoVigilia } from './passo-vigilia.js';

export class VigiliaVarredura {
  constructor({ servico, play, projetos, intervaloMs, registrarLog, livro, memoria, ocupada }) {
    this.projetos = projetos;
    this.play = play;
    this.intervaloMs = intervaloMs;
    this.registrarLog = registrarLog;
    this.livro = livro;
    this.memoria = memoria;
    this.ocupada = ocupada;
    this.temporizador = null;
    this.passo = new PassoVigilia({ servico, play, registrarLog, livro, memoria });
  }

  async varrer() {
    if (this.ocupada.atual) return { pulada: true };
    this.ocupada.atual = true;
    const resultados = [];
    try {
      for (const p of this.projetos.filter(x => x.plane)) {
        const leitura = await this.play.ler();
        if (!(await this.play.ligado(p.plane, leitura))) continue;
        try { resultados.push(await this.passo.projeto(p, leitura.registros[p.plane])); }
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

  iniciar(podeAgendar = async () => false) {
    if (this.temporizador) return;
    this.temporizador = setInterval(async () => {
      try { if (await podeAgendar()) await this.varrer(); }
      catch (e) { this.registrarLog(`[vigilia] ${e.message}`); }
    }, this.intervaloMs);
    this.temporizador.unref?.();
  }

  parar() { if (this.temporizador) clearInterval(this.temporizador); this.temporizador = null; }
}
