// Conta cartas por projeto e fecha o envelope da fila. Não julga a carta.

export class ResumoFila {
  static de({ itens, projetos, catalogo, podeExecutar, frota = null }) {
    const contagens = new Map();
    for (const item of itens) {
      const atual = contagens.get(item.projetoId) ?? { cartas: 0, candidatas: 0, elegiveis: 0 };
      atual.cartas++;
      if (item.labels.includes('READY TO DEV') || item.labels.includes('READY TO TEST')) atual.candidatas++;
      if (item.elegivel) atual.elegiveis++;
      contagens.set(item.projetoId, atual);
    }
    const visiveis = new Set(projetos.map(p => p.id));
    const projetosDaFila = [...catalogo].map(([id, entrada]) => ({
      id, nome: projetos.find(p => p.id === id)?.name ?? entrada.titulo,
      acessivel: visiveis.has(id),
      ...(contagens.get(id) ?? { cartas: 0, candidatas: 0, elegiveis: 0 }),
      impedimento: visiveis.has(id) ? null : 'Sem acesso de leitura ao projeto no Plane para a identidade Guest do Painel',
    }));
    return { modo: podeExecutar ? 'despacho-controlado' : 'leitura-e-simulacao',
      execucaoHabilitada: podeExecutar,
      atualizadoEm: new Date().toISOString(), frota, projetos: projetosDaFila, itens };
  }
}
