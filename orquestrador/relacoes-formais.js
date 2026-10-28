// Relações formais do Plane: blocked_by, start_after e finish_after. Não lê o texto da carta.

export class RelacoesFormais {
  idDe(relacao) {
    if (typeof relacao === 'string') return relacao;
    for (const chave of ['issue_id', 'work_item_id', 'related_work_item', 'related_issue', 'work_item', 'issue', 'target']) {
      const valor = relacao?.[chave];
      if (typeof valor === 'string') return valor;
      if (typeof valor?.id === 'string') return valor.id;
    }
    return null;
  }

  ler(relacoes, cartasPorId) {
    if (!relacoes || typeof relacoes !== 'object') return { erro: [{ id: '?', estado: 'desconhecida', motivo: 'relações do Plane indisponíveis' }] };
    if (['blocked_by', 'start_after', 'finish_after'].some(tipo => relacoes[tipo] !== undefined && !Array.isArray(relacoes[tipo]))) {
      return { erro: [{ id: '?', estado: 'desconhecida', motivo: 'relações do Plane inválidas' }] };
    }
    const ids = [...(relacoes.blocked_by ?? []), ...(relacoes.start_after ?? []), ...(relacoes.finish_after ?? [])];
    const codigos = new Set();
    const dependencias = ids.map(r => {
      const id = this.idDe(r);
      const alvo = id && cartasPorId.get(id);
      if (!id || !alvo) return { id: id ?? '?', estado: 'desconhecida', motivo: 'carta dependente não encontrada na leitura' };
      const codigo = `${alvo.sigla}-${alvo.sequence_id}`;
      codigos.add(codigo.toUpperCase());
      return { id: codigo, estado: alvo.state?.group === 'completed' ? 'concluida' : 'pendente', motivo: alvo.state?.name ?? 'estado não concluído' };
    });
    return { ids, codigos, dependencias };
  }
}
