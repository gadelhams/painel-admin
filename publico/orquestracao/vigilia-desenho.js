// Desenho de um projeto da vigília. A confirmação mora em vigilia-confirmacao.js.

class DesenhoVigilia {
  constructor(n) { this.n = n; }

  // As pausas são da frota, globais (o pausadaAte por projeto saiu em 29/10/2026).
  pausas(dados) {
    const frota = dados.projetos[0]?.frota ?? {};
    const linhas = FrotaOrquestracao.pausas({ pausas: dados.pausasFrota, versao: frota.versao, hash: frota.hash });
    return this.n.criar('p', linhas.length ? `Pausas da frota (todos os projetos): ${linhas.join(' · ')}` : 'Frota sem pausas.', 'orq-ajuda');
  }

  projeto(p, aoPreparar) {
    const caixa = this.n.criar('article', '', 'orq-vigilia-projeto');
    const situacao = p.ligada ? 'ligada' : 'desligada';
    caixa.append(this.n.criar('h3', `${p.nome} · ${situacao}`));
    if (p.limites) {
      caixa.append(this.n.criar('p', `Freios: 1 tentativa por vez · ${p.limites.maxTentativasPorCarta} por carta · ${p.tentativasHoje}/${p.limites.tetoPorDia} hoje · pausa de ${p.limites.pausaPorLimiteMinutos} min no limite de uso · comando de aceite ${p.limites.comando}`));
    }
    caixa.append(this.n.criar('p', p.frota?.estado === 'ok' ? `Modelos: frota v${p.frota.versao} (sub-aba Frota)` : `Frota ${p.frota?.estado ?? 'desconhecida'}: a vigília não despacha`, 'orq-ajuda'));
    for (const aviso of p.avisos ?? []) caixa.append(this.n.criar('p', `Contrato: ${aviso}`, 'orq-ajuda'));
    if (p.impedimentos.length) caixa.append(this.n.criar('p', `Impedimentos: ${p.impedimentos.join('; ')}`, 'orq-ajuda'));
    caixa.append(this.n.criar('p', `Última varredura: ${p.ultimaVarredura ? new Date(p.ultimaVarredura).toLocaleTimeString('pt-BR') : 'nenhuma desde o início do processo'} · próxima carta: ${p.proximaCarta ?? '—'}${p.motivoOciosa ? ` · ${p.motivoOciosa}` : ''}`));
    if (!p.impedimentos.length || p.ligada) {
      const botao = this.n.criar('button', p.ligada ? 'Preparar desligamento' : 'Preparar vigília', 'orq-acao');
      botao.type = 'button';
      botao.addEventListener('click', () => aoPreparar(p.projetoId, !p.ligada, caixa));
      caixa.append(botao);
    }
    const lista = this.n.criar('ul', '', 'orq-vigilia-diario');
    for (const e of p.diario) lista.append(this.n.criar('li', `${e.quando ? new Date(e.quando).toLocaleString('pt-BR') : '?'} · ${e.tipo}${e.carta ? ` · ${e.carta}` : ''}${e.resultado ? ` · ${e.resultado}` : ''}${e.para ? ` · ${e.de} → ${e.para}` : ''}${e.motivo ? ` · ${e.motivo}` : ''}`));
    if (!p.diario.length) lista.append(this.n.criar('li', 'Sem eventos.'));
    caixa.append(this.n.criar('h4', 'Diário'), lista);
    return caixa;
  }
}

globalThis.DesenhoVigilia = DesenhoVigilia;
