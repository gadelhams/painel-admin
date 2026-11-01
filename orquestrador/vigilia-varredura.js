// A passada da vigília no Hangar inteiro: uma tentativa por vez, em round-robin justo entre os projetos com play, sob o teto diário global. O passo de uma carta mora em passo-vigilia.js.
//
// F4b (contrato da F4 item 6; J51, J73): a vigília deixa de ser por projeto. A cada passada ela
// lê o play, a fila (uma vez) e o diário; com uma tentativa em curso em qualquer projeto (no
// passo, pela fila), ou o teto diário do Hangar atingido (`tetoDia`, contado dos diários `vigilia/<id>.jsonl` de todo o
// catálogo, sem as paradas da frota), não despacha nada. Senão percorre os projetos com play na
// ordem de quem teve a vez há mais tempo (a última TENTATIVA no diário; nunca = primeiro; empate
// pela ordem do catálogo) e para no PRIMEIRO que reservou uma carta: um projeto com a fila cheia
// não toma a vez dos outros. Os freios por projeto (contrato, 2 por carta, pausas, R1) ficam no
// passo. O play é relido a cada projeto (J11) e de novo dentro da reserva (J66). O agendamento só
// existe na instância que tem a trava do agendador (J52): `podeAgendar` é conferido a cada volta.

import { PassoVigilia } from './passo-vigilia.js';

const TETO_DIA_HANGAR = 12;

export class VigiliaVarredura {
  constructor({ servico, play, projetos, intervaloMs, registrarLog, livro, memoria, ocupada, tetoDia = TETO_DIA_HANGAR }) {
    this.servico = servico;
    this.projetos = projetos;
    this.play = play;
    this.intervaloMs = intervaloMs;
    this.registrarLog = registrarLog;
    this.livro = livro;
    this.memoria = memoria;
    this.ocupada = ocupada;
    this.tetoDia = tetoDia;
    this.temporizador = null;
    this.passo = new PassoVigilia({ servico, play, registrarLog, livro, memoria });
  }

  nota(projetoId, campos) {
    this.memoria.set(projetoId, { ...this.memoria.get(projetoId), ultimaVarredura: this.livro.iso(), ...campos });
    return { projetoId, ...this.memoria.get(projetoId) };
  }

  // Quem teve a vez há mais tempo primeiro: a vez é a última TENTATIVA do projeto no diário.
  async ordem(projetos) {
    const vez = new Map();
    for (const p of projetos) {
      const linhas = await this.livro.linhas(p.plane);
      vez.set(p.plane, linhas.filter(e => e.tipo === 'TENTATIVA').map(e => e.quando).sort().at(-1) ?? '');
    }
    return projetos.map((p, i) => ({ p, i })).sort((a, b) => vez.get(a.p.plane).localeCompare(vez.get(b.p.plane)) || a.i - b.i).map(x => x.p);
  }

  async varrer() {
    if (this.ocupada.atual) return { pulada: true };
    this.ocupada.atual = true;
    const resultados = [];
    try {
      const leitura = await this.play.ler();
      const ligados = [];
      for (const p of this.projetos.filter(x => x.plane)) if (await this.play.ligado(p.plane, leitura)) ligados.push(p);
      if (!ligados.length) return resultados;
      const parar = motivo => { for (const p of ligados) resultados.push(this.nota(p.plane, { motivoOciosa: motivo })); return resultados; };
      let feitas = 0;
      try { for (const p of this.projetos.filter(x => x.plane)) feitas += await this.livro.tentativas24h(p.plane); }
      catch (erro) { return parar(`diário da vigília ilegível: ${erro.message}; nada despacha`); }
      if (feitas >= this.tetoDia) return parar(`teto diário do Hangar atingido (${feitas}/${this.tetoDia})`);
      // A fila é lida uma vez na passada, só quando o primeiro projeto chega a precisar dela.
      let fila = null;
      const lerFila = () => (fila ??= this.servico.fila());
      for (const p of await this.ordem(ligados)) {
        const agora = await this.play.ler();
        if (!(await this.play.ligado(p.plane, agora))) continue;
        let r;
        try { r = await this.passo.projeto(p, agora.registros[p.plane], { lerFila }); }
        catch (erro) {
          this.nota(p.plane, { motivoOciosa: `erro na varredura: ${erro.message}` });
          await this.livro.anotar(p.plane, { tipo: 'ERRO', etapa: 'varredura', motivo: erro.message }).catch(() => {});
          this.registrarLog(`[vigilia] varredura de ${p.pasta} falhou: ${erro.message}`);
          resultados.push({ projetoId: p.plane, erro: erro.message });
          continue;
        }
        resultados.push(r);
        if (r.tentou) {
          for (const outro of ligados) if (outro.plane !== p.plane && !resultados.some(x => x.projetoId === outro.plane)) {
            resultados.push(this.nota(outro.plane, { motivoOciosa: `a vez desta passada foi de ${p.sigla ?? p.pasta}; uma tentativa por vez no Hangar` }));
          }
          break;
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
