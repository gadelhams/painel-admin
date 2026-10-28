// DOM e markdown do painel. Texto de dado vira elemento; nunca innerHTML.

class Dom {
  static criar(tag, atributos = {}, ...filhos) {
    const nodo = document.createElement(tag);
    for (const [chave, valor] of Object.entries(atributos)) {
      if (chave === 'class') nodo.className = valor;
      else nodo.setAttribute(chave, valor);
    }
    nodo.append(...filhos);
    return nodo;
  }
}

function el(tag, atributos = {}, ...filhos) {
  return Dom.criar(tag, atributos, ...filhos);
}

class Markdown {
  static formatar(texto) {
    const nos = [];
    texto.split('**').forEach((pedaco, i) => {
      const filhos = pedaco.split('`').map((s, j) => (j % 2 ? el('code', {}, s) : s));
      if (i % 2) nos.push(el('strong', {}, ...filhos));
      else nos.push(...filhos);
    });
    return nos;
  }

  static inline(texto) {
    const nos = [];
    let ultimo = 0;
    for (const m of texto.matchAll(Markdown.RE_INLINE)) {
      if (m.index > ultimo) nos.push(texto.slice(ultimo, m.index));
      if (m[1] !== undefined) nos.push(el('strong', {}, m[1]));
      else if (m[2] !== undefined) nos.push(el('code', {}, m[2]));
      else nos.push(el('a', { href: m[4], target: '_blank', rel: 'noopener' }, m[3]));
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) nos.push(texto.slice(ultimo));
    return nos;
  }

  static renderizar(texto) {
    const blocos = [];
    const linhas = texto.split(/\r?\n/);
    let i = 0;
    let paragrafo = [];
    let listaAtual = null;

    function fecharParagrafo() {
      if (paragrafo.length) {
        blocos.push(el('p', {}, ...Markdown.inline(paragrafo.join(' '))));
        paragrafo = [];
      }
    }
    function fecharLista() {
      if (listaAtual) {
        blocos.push(listaAtual.elemento);
        listaAtual = null;
      }
    }

    while (i < linhas.length) {
      const linha = linhas[i];
      const cerca = linha.match(/^```\s*(\S*)\s*$/);
      if (cerca) {
        fecharParagrafo();
        fecharLista();
        const linguagem = cerca[1] || '';
        const codigo = [];
        i++;
        while (i < linhas.length && !/^```\s*$/.test(linhas[i])) {
          codigo.push(linhas[i]);
          i++;
        }
        i++;
        const conteudo = codigo.join('\n');
        blocos.push(linguagem === 'mermaid' ? el('pre', { class: 'mermaid' }, conteudo) : el('pre', {}, el('code', {}, conteudo)));
        continue;
      }
      const heading = linha.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        fecharParagrafo();
        fecharLista();
        const tag = `h${Math.min(heading[1].length + 2, 6)}`;
        blocos.push(el(tag, {}, ...Markdown.inline(heading[2].trim())));
        i++;
        continue;
      }
      const itemLista = linha.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
      if (itemLista) {
        fecharParagrafo();
        const ordenada = /\d+\./.test(itemLista[1]);
        const tag = ordenada ? 'ol' : 'ul';
        if (!listaAtual || listaAtual.tag !== tag) {
          fecharLista();
          listaAtual = { tag, elemento: el(tag, {}) };
        }
        listaAtual.elemento.append(el('li', {}, ...Markdown.inline(itemLista[2])));
        i++;
        continue;
      }
      if (!linha.trim()) {
        fecharParagrafo();
        fecharLista();
        i++;
        continue;
      }
      paragrafo.push(linha.trim());
      i++;
    }
    fecharParagrafo();
    fecharLista();
    return blocos;
  }
}

Markdown.RE_INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]*)\]\(([^)]*)\)/g;

function formatar(texto) {
  return Markdown.formatar(texto);
}

function renderizarMarkdown(texto) {
  return Markdown.renderizar(texto);
}
