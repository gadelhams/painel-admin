// Sinais do fio de comentários: longo demais, ou selado sem compactar.

import { LIMIAR_FIO, MARCA_COMPACTADO, REGRA_DESDE } from './medidas.js';

export class SinalFio {
  ler({ plane, projeto, fios }) {
    const sinais = [];
    if (!(plane && projeto.plane)) return sinais;
    for (const i of plane.issues.filter((x) => x.project.id === projeto.plane)) {
      const f = fios[i.id];
      if (!f) continue;
      const selado = i.state.type === 'completed' || i.state.type === 'canceled';
      if (f.desdeCompactado >= LIMIAR_FIO) sinais.push({ tipo: 'fio_longo', gravidade: 'media', texto: `${i.identifier}: ${f.desdeCompactado} comentários desde a última compactação`, carta: i.identifier, url: i.url });
      else if (selado && f.total > 0 && !f.compactadoEm && String(i.updatedAt) >= REGRA_DESDE) sinais.push({ tipo: 'selado_sem_compactar', gravidade: 'baixa', texto: `${i.identifier}: selado com ${f.total} comentário(s) e sem ${MARCA_COMPACTADO}`, carta: i.identifier, url: i.url });
    }
    return sinais;
  }
}
