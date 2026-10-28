// Lê o markdown de backlog. Não consulta o Plane.

const RE_FEATURE = /^##\s+(.*)$/;
const RE_TOKEN = /`?\[([ x])\]`?/;
const RE_ITEM = /^(\s*)-\s+`?\[([ x])\]`?\s*(.*)$/;
const RE_LISTA = /^\s*-\s+/;
const RE_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const RE_TAG = /\((ASTARGNE|DONO|EMPÍRICA|SEM ESCOPO|CONGELADA|BLOQUEADA|PÓS-PLAYTEST)(?![\p{L}])([^)]*)\)/gu;

export class ParserBacklog {
  extrairTags(texto) {
    const tags = [];
    for (const m of texto.matchAll(RE_TAG)) {
      const nome = m[1] === 'DONO' ? 'ASTARGNE' : m[1];
      if (tags.some((t) => t.tag === nome)) continue;
      const detalhe = m[2].replace(/^[\s:;,—–-]+/, '').trim();
      tags.push(detalhe ? { tag: nome, detalhe } : { tag: nome });
    }
    return tags;
  }

  parsear(texto) {
    const features = [];
    let feature = null;
    let pilha = [];
    let ultimo = null;
    let numeroLinha = 0;

    for (const linha of texto.split(/\r?\n/)) {
      numeroLinha++;
      if (!linha.trim()) {
        ultimo = null;
        continue;
      }

      const cabecalho = linha.match(RE_FEATURE);
      if (cabecalho) {
        const token = cabecalho[1].match(RE_TOKEN);
        feature = token
          ? {
              titulo: cabecalho[1].replace(RE_TOKEN, '').trim(),
              estado: token[1] === 'x' ? 'pronto' : 'aberto',
              itens: [],
            }
          : null;
        if (feature) features.push(feature);
        pilha = [];
        ultimo = null;
        continue;
      }
      if (!feature) continue;

      const item = linha.match(RE_ITEM);
      if (item && ['', '  ', '    '].includes(item[1])) {
        const nivel = item[1].length / 2;
        const nodo = {
          tipo: 'item',
          texto: item[3].trim(),
          estado: item[2] === 'x' ? 'pronto' : 'aberto',
          nivel,
          filhos: [],
          linha: numeroLinha,
        };
        while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
        (pilha.length ? pilha[pilha.length - 1].filhos : feature.itens).push(nodo);
        pilha.push(nodo);
        ultimo = nodo;
        continue;
      }

      if (/^\s/.test(linha) && ultimo && !RE_LISTA.test(linha)) {
        ultimo.texto += ` ${linha.trim()}`;
        continue;
      }

      if (ultimo?.tipo === 'cru' && !RE_LISTA.test(linha)) {
        ultimo.texto += ` ${linha.trim()}`;
      } else {
        const [, recuo, resto] = linha.match(/^(\s*)(?:-\s+)?(.*)$/);
        const nivel = Math.min(Math.floor(recuo.length / 2), 2);
        const nodo = { tipo: 'cru', texto: resto.trim(), nivel, filhos: [], linha: numeroLinha };
        while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();
        (pilha.length ? pilha[pilha.length - 1].filhos : feature.itens).push(nodo);
        pilha.push(nodo);
        ultimo = nodo;
      }
    }

    const finalizar = (nodo) => {
      nodo.texto = nodo.texto.replace(RE_LINK, '$1');
      nodo.tags = this.extrairTags(nodo.texto);
      nodo.filhos?.forEach(finalizar);
    };
    for (const f of features) f.itens.forEach(finalizar);
    return features;
  }
}

export function parsearBacklog(texto) {
  return new ParserBacklog().parsear(texto);
}
