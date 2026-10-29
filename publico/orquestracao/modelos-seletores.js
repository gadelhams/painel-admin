// Desenha os seletores provedor → modelo → esforço de cada papel. Não valida nem grava a frota.

class SeletoresModelo {
  constructor(n) { this.n = n; }

  desenhar(dados, alvo, aoAlterar) {
    const provedores = [...new Set(dados.opcoes.map(opcao => opcao.provedor))];
    const campo = (nome, seletor) => {
      const label = this.n.criar('label', '', 'orq-campo');
      label.append(this.n.criar('span', nome, 'orq-campo-titulo'), seletor);
      return label;
    };
    for (const papel of dados.papeis) {
      const linha = this.n.criar('div', '', 'orq-papel');
      linha.dataset.papel = papel;
      const rotulo = this.n.criar('span', papel.replaceAll('_', ' '), 'orq-papel-nome');
      const provedor = this.n.criar('select');
      provedor.className = 'orq-seletor-provedor';
      provedor.setAttribute('aria-label', `Provedor para ${papel.replaceAll('_', ' ')}`);
      for (const nome of provedores) provedor.add(new Option(nome === 'openai' ? 'OpenAI' : nome === 'claude' ? 'Claude' : nome, nome));
      const modelo = this.n.criar('select');
      modelo.className = 'orq-seletor-modelo';
      modelo.setAttribute('aria-label', `Modelo para ${papel.replaceAll('_', ' ')}`);
      const esforco = this.n.criar('select');
      esforco.className = 'orq-seletor-esforco';
      esforco.setAttribute('aria-label', `Esforço para ${papel.replaceAll('_', ' ')}`);
      const preencherEsforcos = () => {
        const opcao = dados.opcoes.find(op => op.provedor === provedor.value && op.modelo === modelo.value);
        if (!opcao) return esforco.replaceChildren();
        esforco.replaceChildren(...opcao.esforcos.map(e => new Option(e === 'xhigh' ? 'extreme high' : e, e)));
        esforco.value = opcao.esforcoPadrao;
      };
      const preencherModelos = () => {
        modelo.replaceChildren(...dados.opcoes.filter(op => op.provedor === provedor.value)
          .map(op => new Option(`${op.modelo}${op.disponivel ? '' : ' · sem executor'}`, op.modelo)));
        preencherEsforcos();
      };
      provedor.addEventListener('change', () => { preencherModelos(); aoAlterar(); });
      modelo.addEventListener('change', () => { preencherEsforcos(); aoAlterar(); });
      esforco.addEventListener('change', aoAlterar);
      preencherModelos();
      const registrado = dados.perfil?.selecoes?.[papel];
      if (registrado && dados.opcoes.some(op => op.provedor === registrado.provedor && op.modelo === registrado.modelo)) {
        provedor.value = registrado.provedor;
        preencherModelos();
        modelo.value = registrado.modelo;
        preencherEsforcos();
        if ([...esforco.options].some(o => o.value === registrado.esforco)) esforco.value = registrado.esforco;
      }
      linha.append(rotulo, campo('Provedor', provedor), campo('Modelo', modelo), campo('Esforço', esforco));
      alvo.append(linha);
    }
  }

  // `raiz` separa os blocos (executor e zelador) que convivem na mesma tela.
  ler(raiz = document) {
    const selecoes = {};
    for (const linha of raiz.querySelectorAll('.orq-papel')) {
      selecoes[linha.dataset.papel] = {
        provedor: linha.querySelector('.orq-seletor-provedor').value,
        modelo: linha.querySelector('.orq-seletor-modelo').value,
        esforco: linha.querySelector('.orq-seletor-esforco').value,
      };
    }
    return selecoes;
  }
}

globalThis.SeletoresModelo = SeletoresModelo;
