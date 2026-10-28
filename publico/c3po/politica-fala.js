// Política pura da voz do C-3PO. Sem DOM, sem fetch, sem chave.
// O navegador (voz.js) só adapta microfone e alto-falante; o que decide
// corte, eco, nome e retentativa mora aqui para o teste enxergar sem API.
// Script clássico de propósito: as páginas carregam isto antes de voz.js.

class Fala {
  static MIN_BLOCO = 160;

  static normalizar(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  }

  // Marcação fica na tela. A boca recebe texto corrido.
  static limpar(texto) {
    return String(texto ?? '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*`#~]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\|/g, ', ')
      .replace(/_/g, ' ')
      .replace(/[→⇒]/g, ', ')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  // Parágrafo corta sempre. Sentença ou quebra de linha só depois do mínimo.
  // Não corta "3.5" nem "01:32" (o ponto precisa de espaço depois).
  static corte(texto, minimo) {
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '\n') {
        let j = i + 1;
        while (j < texto.length && (texto[j] === ' ' || texto[j] === '\t')) j++;
        if (texto[j] === '\n') return i;
        if (i + 1 >= minimo) return i;
      } else if ('.!?…'.includes(c) && i + 1 < texto.length && /\s/.test(texto[i + 1])) {
        if (i + 1 >= minimo) return i;
      }
    }
    return -1;
  }
}

class Eco {
  // Fragmento contido no que a boca acabou de dizer é eco. Frase diferente não.
  static parece(ouvidoBruto, ditoBruto) {
    const palavras = (bruto) => Fala.normalizar(bruto)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const ouvido = palavras(ouvidoBruto);
    const dito = palavras(ditoBruto);
    if (!ouvido.length || !dito.length) return false;
    const conjunto = new Set(dito);
    const contidas = ouvido.filter((p) => conjunto.has(p)).length;
    if (contidas === ouvido.length) return true;
    return ouvido.length >= 4 && contidas / ouvido.length >= 0.75;
  }
}

class CorretorDeNomes {
  static SIMILARIDADE_MINIMA = 0.72;
  static SIMILARIDADE_PALAVRA = 0.82;
  static TERMOS = [
    'Fastify', 'Drizzle', 'PostGIS', 'pgRouting', 'Tailscale', 'ElevenLabs',
    'Vultr', 'RackNerd', 'Mermaid', 'systemd', 'Caddy', 'TypeScript',
    'React', 'Vite', 'Docker', 'GitHub', 'Ollama', 'Whisper', 'Anthropic',
    'Claude', 'Postgres', 'MariaDB', 'rAthena', 'Capacitor', 'Tizen',
  ];

  constructor(catalogo = []) {
    this.catalogo = catalogo;
  }

  // CamelCase antes de baixar a caixa: "SistemaLoreEngine" vira três palavras.
  // Baixar antes apagava a fronteira e o nome inteiro virava uma palavra só.
  static palavras(nome) {
    const separado = String(nome).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return Fala.normalizar(separado).split(/[^a-z0-9]+/).filter(Boolean);
  }

  static distancia(a, b) {
    const linha = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) linha[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let anterior = linha[0];
      linha[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = linha[j];
        linha[j] = a[i - 1] === b[j - 1]
          ? anterior
          : 1 + Math.min(anterior, linha[j], linha[j - 1]);
        anterior = temp;
      }
    }
    return linha[b.length];
  }

  static doCatalogo(projetos = [], termos = CorretorDeNomes.TERMOS) {
    const vistos = new Set();
    const doCatalogo = projetos
      .flatMap((p) => [p.pasta, p.titulo])
      .filter((nome) => nome && !vistos.has(nome) && vistos.add(nome))
      .map((nome) => ({ exibicao: nome, falado: CorretorDeNomes.palavras(nome) }))
      .filter((alvo) => alvo.falado.length >= 2);
    const doGlossario = termos.map((nome) => ({
      exibicao: nome,
      falado: CorretorDeNomes.palavras(nome),
      limiar: CorretorDeNomes.SIMILARIDADE_PALAVRA,
    }));
    return new CorretorDeNomes([...doCatalogo, ...doGlossario]);
  }

  corrigir(texto) {
    if (!this.catalogo.length) return { texto, trocas: [] };
    const palavras = String(texto).split(/(\s+)/);
    const indices = palavras.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i !== -1);
    const trocas = [];

    for (const alvo of this.catalogo) {
      for (let ini = 0; ini + alvo.falado.length <= indices.length; ini++) {
        const fim = ini + alvo.falado.length;
        const janelaTexto = indices.slice(ini, fim).map((i) => palavras[i]).join(' ');
        const juntoJanela = Fala.normalizar(janelaTexto).replace(/[^a-z0-9]/gi, '');
        const juntoAlvo = alvo.falado.join('');
        if (!juntoJanela) continue;
        const distancia = CorretorDeNomes.distancia(juntoJanela, juntoAlvo);
        const similaridade = 1 - distancia / Math.max(juntoJanela.length, juntoAlvo.length);
        if (similaridade >= (alvo.limiar ?? CorretorDeNomes.SIMILARIDADE_MINIMA)
          && janelaTexto.toLowerCase() !== alvo.exibicao.toLowerCase()) {
          palavras[indices[ini]] = alvo.exibicao;
          for (let k = ini + 1; k < fim; k++) palavras[indices[k]] = '';
          trocas.push(`"${janelaTexto}" → "${alvo.exibicao}"`);
          break;
        }
      }
    }

    return { texto: palavras.join('').replace(/\s{2,}/g, ' ').trim(), trocas };
  }
}

class GatilhoC3po {
  static VARIANTES = ['c3po', 'cetrepo', 'cetrepio', 'sipio', 'sepio', 'cepeo', 'ceotrepeo'];
  static SIMILARIDADE = 0.65;

  static detectar(texto) {
    const palavras = String(texto ?? '').split(/(\s+)/);
    const indices = palavras.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i !== -1);
    for (let tam = 1; tam <= 4 && tam <= indices.length; tam++) {
      for (let ini = 0; ini + tam <= indices.length; ini++) {
        const fim = ini + tam;
        const janela = indices.slice(ini, fim).map((i) => palavras[i]).join('');
        const normal = Fala.normalizar(janela).replace(/[^a-z0-9]/g, '');
        if (!normal) continue;
        for (const variante of GatilhoC3po.VARIANTES) {
          const distancia = CorretorDeNomes.distancia(normal, variante);
          const similaridade = 1 - distancia / Math.max(normal.length, variante.length);
          if (similaridade >= GatilhoC3po.SIMILARIDADE) {
            const resto = indices.slice(fim).map((i) => palavras[i]).join(' ').trim();
            return { encontrado: true, resto };
          }
        }
      }
    }
    return { encontrado: false, resto: '' };
  }
}

class RetentativaEleven {
  // Falha isolada: uma nova tentativa na hora. 429 é fila, não queda: até 4
  // tentativas, com espera crescente. A quinta desiste desta frase e o
  // chamador fala no navegador sem desligar a ElevenLabs da sessão.
  static decidir({ ocupada = false, tentativa = 0, max = 4 } = {}) {
    if (ocupada) {
      if (tentativa + 1 >= max) return { agir: 'desistir' };
      return { agir: 'esperar', ms: 350 * (tentativa + 1) };
    }
    if (tentativa >= 1) return { agir: 'desistir' };
    return { agir: 'de-novo' };
  }
}

globalThis.PoliticaFala = { Fala, Eco, CorretorDeNomes, GatilhoC3po, RetentativaEleven };
