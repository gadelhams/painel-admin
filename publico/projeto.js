// Estado do painel de projeto. As seções moram em projeto-secoes.js.

class PainelProjeto {
  constructor(principal, contexto) {
    this.principal = principal;
    this.contexto = contexto;
    this.tag = null;
    this.projeto = null;
    this.backlog = null;
    this.decisoes = null;
    this.docs = null;
  }

  desenharPrincipal() {
    this.principal.replaceChildren(
      SecoesProjeto.cabecalho(this, this.projeto, this.backlog, this.decisoes),
      SecoesProjeto.outline(this.backlog, this.tag),
    );
  }

  desenharContexto() {
    this.contexto.replaceChildren(
      this.docs
        ? SecoesProjeto.arquitetura(this.projeto, this.docs)
        : el('div', { class: 'bloco-contexto' }, el('p', { class: 'rotulo-bloco' }, 'Arquitetura'), el('p', { class: 'discreto' }, 'carregando…')),
      SecoesProjeto.decisoesParadas(this.projeto.pasta),
      SecoesProjeto.fila(),
      SecoesProjeto.producao(),
    );
    if (this.docs && window.mermaid) mermaid.run();
  }

  async abrir(pasta) {
    this.tag = null;
    this.docs = null;
    const projeto = dadosProjetos.find((p) => p.pasta === pasta);
    if (!projeto) {
      this.principal.replaceChildren(el('p', { class: 'discreto' }, `Projeto "${pasta}" não encontrado no catálogo.`));
      this.contexto.replaceChildren();
      return;
    }
    this.projeto = projeto;
    this.backlog = dadosBacklog?.projetos.find((p) => p.pasta === pasta);
    this.decisoes = decisoesDoProjeto(pasta);
    this.desenharPrincipal();
    this.desenharContexto();
    const docs = await fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs`).then((r) => r.json())
      .catch(() => ({ erro: 'falha ao buscar a documentação do projeto' }));
    if (projetoSelecionado !== pasta) return;
    this.docs = docs;
    this.desenharContexto();
  }
}

const painelProjeto = new PainelProjeto(
  document.getElementById('painel-projeto-principal'),
  document.getElementById('painel-projeto-contexto'),
);

function abrirProjeto(pasta) {
  return painelProjeto.abrir(pasta);
}

atualizarTudo();
setInterval(atualizarTudo, 60_000);
