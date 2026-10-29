// Resumo da carta: o estado que a descrição declara, o último handoff e gate e o tamanho
// do fio. O fio inteiro fica no Plane, num link. Não prepara handoff.

class CanalConversa {
  constructor(painel) { this.painel = painel; }

  get n() { return this.painel.n; }

  async carregar() {
    if (!this.n.estado.carta) return;
    const id = this.n.estado.carta.id;
    this.n.mensagem('orq-conversa', 'Lendo a carta no Plane…');
    try {
      const canal = await this.n.json(`/api/orquestracao/canal?carta=${encodeURIComponent(id)}&projeto=${encodeURIComponent(this.n.estado.carta.projetoId)}`, { signal: this.n.sinal('conversa') });
      if (this.n.estado.carta?.id !== id) return;
      this.desenhar(canal.resumo, this.n.estado.carta);
    } catch (erro) { if (this.n.abortado(erro)) return; if (this.n.estado.carta?.id === id) this.n.mensagem('orq-conversa', `Canal indisponível: ${erro.message}`); }
  }

  desenhar(r, carta) {
    const alvo = this.n.$('orq-conversa');
    alvo.replaceChildren();
    const data = q => (q ? new Date(q).toLocaleString('pt-BR') : '');
    const bloco = (titulo, texto) => {
      const caixa = this.n.criar('article', '', 'orq-interacao');
      caixa.append(this.n.criar('strong', titulo));
      for (const linha of String(texto).split('\n')) caixa.append(this.n.criar('p', linha));
      alvo.append(caixa);
    };
    if (r.estado) bloco('Estado', r.estado);
    else bloco('Descrição', r.descricao ?? '(sem descrição)');
    if (r.feito) bloco('Feito e decidido', r.feito);
    if (r.ultimoHandoff) bloco(`Último handoff · ${data(r.ultimoHandoff.quando)}`, `${r.ultimoHandoff.papel} · ${r.ultimoHandoff.resultado} · ${r.ultimoHandoff.resumo}`);
    if (r.ultimoGate) bloco('Último gate', `${r.ultimoGate.gate} · ${data(r.ultimoGate.quando)}`);
    const fio = r.fio;
    const rodape = this.n.criar('p', `${fio.comentarios} comentário(s) no fio${fio.ultimo ? ` · último de ${fio.ultimo.autor} em ${data(fio.ultimo.quando)}` : ''}${fio.pedeCompactacao ? ` · ${fio.desdeCompactacao} desde a última compactação: pede COMPACTADO/v1` : ''}`, 'orq-ajuda');
    alvo.append(rodape);
    if (!r.estado) alvo.append(this.n.criar('p', 'A descrição ainda não tem o bloco "Estado" da compactação (PADROES-BACKLOG.md).', 'orq-ajuda'));
    if (carta?.url) {
      const link = this.n.criar('a', 'Abrir o fio inteiro no Plane ↗');
      link.href = carta.url; link.target = '_blank'; link.rel = 'noopener';
      alvo.append(link);
    }
  }
}

globalThis.CanalConversa = CanalConversa;
