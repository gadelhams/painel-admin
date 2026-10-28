// Agrupamento das decisões paradas. A página só escolhe o que mostrar.

class GruposDecisao {
  static titulo(pasta) {
    return dadosProjetos.find((p) => p.pasta === pasta)?.titulo ?? pasta;
  }

  static congelado(pasta) {
    return dadosProjetos.find((p) => p.pasta === pasta)?.congelado === true;
  }

  static arquivo(pasta) {
    return dadosBacklog?.projetos.find((p) => p.pasta === pasta)?.backlog ?? '';
  }

  static porProjeto(decisoes) {
    const porProjeto = new Map();
    for (const d of decisoes) {
      if (!porProjeto.has(d.projeto)) porProjeto.set(d.projeto, []);
      porProjeto.get(d.projeto).push(d);
    }
    for (const lista of porProjeto.values()) {
      lista.sort((a, b) => {
        if (a.desde === null) return 1;
        if (b.desde === null) return -1;
        return new Date(a.desde) - new Date(b.desde);
      });
    }
    return [...porProjeto.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  static maisVelha(visiveis) {
    return [...visiveis].sort((a, b) => {
      if (a.desde === null) return 1;
      if (b.desde === null) return -1;
      return new Date(a.desde) - new Date(b.desde);
    })[0];
  }
}

function tituloDoProjeto(pasta) { return GruposDecisao.titulo(pasta); }
function projetoCongelado(pasta) { return GruposDecisao.congelado(pasta); }
function arquivoDoProjeto(pasta) { return GruposDecisao.arquivo(pasta); }

globalThis.GruposDecisao = GruposDecisao;
