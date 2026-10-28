// Mede o fio de comentários de cada carta. O resultado fica no cache.

import { medirFio } from './medidas.js';

export class MedidorFios {
  constructor({ consultar, cache, concorrencia, log }) {
    this.consultar = consultar;
    this.cache = cache;
    this.concorrencia = concorrencia;
    this.log = log;
  }

  async comentarios(projetoId, issueId) {
    const q = this.consultar();
    const itens = [];
    let cursor = null;
    do {
      const pagina = await q(`/projects/${projetoId}/issues/${issueId}/comments/?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      itens.push(...(pagina.results ?? []));
      cursor = pagina.next_page_results ? pagina.next_cursor : null;
    } while (cursor);
    return itens;
  }

  async medir(issues) {
    const c = await this.cache.ler();
    const pendentes = issues.filter((i) => !c.fios[i.id] || c.fios[i.id].updatedAt !== i.updatedAt);
    let idx = 0;
    const trabalhador = async () => {
      while (idx < pendentes.length) {
        const i = pendentes[idx++];
        try {
          c.fios[i.id] = { updatedAt: i.updatedAt, ...medirFio(await this.comentarios(i.project.id, i.id)) };
        } catch (erro) { this.log(`[alinhamento] comentários de ${i.identifier}: ${erro.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concorrencia, pendentes.length || 1) }, trabalhador));
    return { medidos: pendentes.length, fios: c.fios };
  }
}
