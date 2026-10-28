// Lista da aba Chaves. A linha mora em chaves-linha.js e o formulário em chaves-troca-form.js.

class DesenhoChaves {
  constructor(painel) {
    this.painel = painel;
    this.formulario = new FormularioTroca(painel);
    this.linhas = new LinhaChaves(painel, this.formulario);
  }

  botao(texto, acao) {
    const b = el('button', { type: 'button', class: 'orq-acao' }, texto);
    b.addEventListener('click', acao);
    return b;
  }

  desenhar() {
    const dados = this.painel.dados;
    const status = this.painel.status;
    const cabecalho = el('div', { class: 'decisoes-cabecalho' },
      el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 06 / CHAVES'),
        el('h2', { class: 'titulo-secao' }, dados ? `${dados.pendentes.length} rotações pendentes` : 'Chaves e segredos'),
        el('p', { class: 'kicker' }, dados ? `só nomes circulam · servidor ${dados.servidorLidoEm ? `lido às ${new Date(dados.servidorLidoEm).toLocaleTimeString('pt-BR')}` : 'não lido'} · troca no servidor ${dados.escritaServidorHabilitada ? 'ligada' : 'desligada (aguarda validador-deploy)'}` : '')),
      el('div', {}, this.botao('Reler desta máquina', () => this.painel.carregar()), ' ', this.botao('Ler inventário do servidor (ssh)', () => this.painel.carregar({ servidor: true }))));
    const blocos = [cabecalho];
    if (status) blocos.push(el('p', { class: status.tipo === 'erro' ? 'discreto erro' : 'discreto' }, status.texto));
    if (dados) {
      for (const p of dados.projetos) {
        const onde = [];
        if (p.local) onde.push(`local ${p.local.arquivo} ${p.local.existe ? `(modo ${p.local.modo}${p.local.permissaoFrouxa ? ' — FROUXO' : ''})` : `(${p.local.motivo})`}`);
        if (p.servidor) onde.push(`servidor ${p.servidor.lido ? `${p.servidor.arquivo} (modo ${p.servidor.modo}${p.servidor.permissaoFrouxa ? ' — FROUXO' : ''})` : 'não lido'} · unit ${p.servidor.unit}`);
        blocos.push(el('details', { class: 'grupo-projeto-decisoes', ...(p.chaves.some(c => c.rotacao) || p.foraDoEnv.some(c => c.rotacao) ? { open: '' } : {}) },
          el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'grupo-projeto-titulo' }, p.projeto), el('span', { class: 'kicker grupo-projeto-arquivo' }, onde.join(' · ')), el('span', { class: 'selo-contagem' }, String(p.chaves.length + p.foraDoEnv.length))),
          el('div', { class: 'lista-decisoes-tab' }, ...p.chaves.map(c => this.linhas.desenhar(p.projeto, c)), ...p.foraDoEnv.map(c => this.linhas.desenhar(p.projeto, c, 'fora')),
            ...(p.extras.length ? [el('p', { class: 'kicker' }, `outras variáveis no arquivo (não catalogadas): ${p.extras.join(', ')}`)] : []))));
      }
      const eventos = el('ul', { class: 'chaves-eventos' }, ...dados.eventos.map(e => el('li', {}, `${new Date(e.quando).toLocaleString('pt-BR')} · ${e.tipo} · ${e.projeto} · ${e.nome} · ${e.alvo}${e.reiniciado ? ' · reiniciado' : ''}`)));
      blocos.push(el('details', { class: 'grupo-projeto-decisoes' }, el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'grupo-projeto-titulo' }, 'Últimas trocas (sem valores)'), el('span', { class: 'selo-contagem' }, String(dados.eventos.length))), dados.eventos.length ? eventos : el('p', { class: 'discreto' }, 'nenhuma troca registrada.')));
    }
    this.painel.aba.replaceChildren(...blocos);
  }
}

globalThis.DesenhoChaves = DesenhoChaves;
