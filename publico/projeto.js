// Página de projeto (20/08/2026): aberta pelo clique num card da Visão
// geral (ou direto por #/projeto/<pasta>). Reaproveita `dadosProjetos`
// (app.js) e `dadosBacklog`/`desenharNodo`/`placar` (backlog.js) — sem
// buscar de novo o que já está em cache; só os docs do projeto são
// buscados aqui, sob demanda.

const conteudoProjeto = document.getElementById('projeto-conteudo');

function secaoCabecalho(projeto) {
  const linhas = [
    el('h2', {}, projeto.titulo),
    el('p', { class: 'descricao' }, projeto.descricao),
    el('div', { class: 'stack' }, projeto.stack),
    el('div', { class: 'discreto' }, `porta de entrada: ${projeto.entrada}`),
  ];
  if (projeto.producao) {
    linhas.push(el('div', {}, el('a', { href: projeto.producao, target: '_blank', rel: 'noopener' }, `${projeto.producao} ↗`)));
  }
  if (!projeto.existe) linhas.push(el('div', { class: 'git-linha' }, 'pasta não sincronizada nesta máquina'));
  return el('section', {}, ...linhas);
}

function secaoStats(projeto, prBacklog) {
  const linhas = [];
  if (projeto.git.repositorio) {
    linhas.push(el('div', { class: 'stat-linha' }, `⎇ ${projeto.git.branch}`));
    linhas.push(el('div', { class: 'stat-linha' },
      projeto.git.arquivosSujos > 0 ? `${projeto.git.arquivosSujos} arquivo(s) não commitado(s)` : 'working tree limpo'));
    linhas.push(el('div', { class: 'stat-linha' },
      `último commit ${tempoRelativo(projeto.git.ultimoCommit.data)} — ${projeto.git.ultimoCommit.assunto}`));
  } else {
    linhas.push(el('div', { class: 'stat-linha' }, 'sem repositório git nesta pasta'));
  }
  for (const porta of projeto.portas) {
    linhas.push(el('div', { class: 'stat-linha' }, `${porta.ativa ? '● ativa' : '○ inativa'} — :${porta.porta} (${porta.servico})`));
  }
  if (prBacklog?.estado === 'ok') {
    const totalFeatures = prBacklog.features.length;
    const prontas = prBacklog.features.filter((f) => f.estado === 'pronto').length;
    const p = placar(prBacklog.features.flatMap((f) => f.itens));
    linhas.push(el('div', { class: 'stat-linha' }, `backlog: ${prontas}/${totalFeatures} features prontas · ${p.prontos}/${p.total} itens prontos`));
  }
  return el('section', {}, el('h2', {}, 'Stats de dev'), ...linhas);
}

// "O que está feito e falta subir" (pedido do dono, 20/08/2026): dois fatos
// git DISTINTOS — commits já feitos mas nunca enviados ao remoto (não é a
// mesma coisa que "não commitado"; o SistemaLoreEngine tinha 21 disso sem o
// dono saber) e o diff --stat do working tree (arquivos modificados +
// novos). Só buscado ao abrir a página — mais pesado que o resumo que os
// cards da Visão Geral já usam (coletores.js, `gitDetalhado`).
function secaoTrabalhoLocal(git) {
  if (git.erro) {
    return el('section', {}, el('h2', {}, 'O que está feito e falta subir'), el('p', { class: 'discreto' }, git.erro));
  }

  const partes = [];

  if (git.naoEnviados.rastreado) {
    partes.push(git.naoEnviados.commits.length
      ? el(
          'div', { class: 'trabalho-grupo' },
          el('h3', {}, `${git.naoEnviados.commits.length} commit(s) à frente de ${git.naoEnviados.upstream}`),
          el('ul', {}, ...git.naoEnviados.commits.map((msg) => el('li', {}, msg))),
        )
      : el('p', { class: 'discreto' }, `em dia com ${git.naoEnviados.upstream} — nada pra enviar.`));
  } else {
    partes.push(el('p', { class: 'discreto' }, 'sem branch upstream configurado — não dá pra saber se está à frente do remoto.'));
  }

  if (git.modificados.length) {
    partes.push(el(
      'div', { class: 'trabalho-grupo' },
      el('h3', {}, `${git.modificados.length} arquivo(s) modificado(s)`),
      el('ul', { class: 'diff-lista' }, ...git.modificados.map((m) =>
        el('li', {}, el('code', {}, m.caminho), ' ', el('span', { class: 'discreto' }, m.resumo)))),
    ));
  }

  if (git.novos.length) {
    partes.push(el(
      'div', { class: 'trabalho-grupo' },
      el('h3', {}, `${git.novos.length} arquivo(s) novo(s), não rastreado(s)`),
      el('ul', { class: 'diff-lista' }, ...git.novos.map((caminho) => el('li', {}, el('code', {}, caminho)))),
    ));
  }

  if (!git.modificados.length && !git.novos.length) {
    partes.push(el('p', { class: 'discreto' }, 'working tree limpo — nada pra commitar.'));
  }

  return el('section', {}, el('h2', {}, 'O que está feito e falta subir'), ...partes);
}

function secaoDocGrupo(titulo, entradas, aberto) {
  if (!entradas.length) return null;
  return el(
    'details',
    { class: 'doc-grupo', ...(aberto ? { open: '' } : {}) },
    el('summary', {}, `${titulo} (${entradas.length})`),
    ...entradas.flatMap((doc) => (
      doc.erro
        ? [el('p', { class: 'discreto' }, `${doc.caminho} — ${doc.erro}`)]
        : [el('h5', { class: 'doc-caminho' }, doc.caminho), ...renderizarMarkdown(doc.conteudo)]
    )),
  );
}

// Lista de modeladores (CLAUDE.md/AGENTS.md/README.md/docs/*.md): clicável,
// busca o conteúdo sob demanda (?arquivo=) e some no segundo clique — não
// baixa tudo de cara (o LoreEngine sozinho tem 53 arquivos em docs/).
function secaoModeladores(pasta, modeladores) {
  if (!modeladores.length) return el('p', { class: 'discreto' }, 'nenhum documento modelador (.md) visível.');
  const linhas = modeladores.map((caminho) => {
    const botao = el('button', { class: 'link-doc', type: 'button' }, caminho);
    const corpo = el('div', { class: 'doc-conteudo', hidden: '' });
    botao.addEventListener('click', async () => {
      if (!corpo.hidden) {
        corpo.hidden = true;
        return;
      }
      corpo.hidden = false;
      if (corpo.dataset.carregado) return; // já buscado antes neste view: não busca de novo
      corpo.replaceChildren(el('p', { class: 'discreto' }, 'Carregando…'));
      const resposta = await fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs?arquivo=${encodeURIComponent(caminho)}`);
      const dados = await resposta.json();
      corpo.dataset.carregado = '1';
      corpo.replaceChildren(dados.erro
        ? el('p', { class: 'discreto' }, dados.erro)
        : el('div', {}, ...renderizarMarkdown(dados.conteudo)));
      if (window.mermaid) mermaid.run();
    });
    return el('div', { class: 'doc-item' }, botao, corpo);
  });
  return el('div', { class: 'doc-lista' }, ...linhas);
}

function secaoDocumentacao(projeto, docs) {
  if (docs.erro) return el('section', {}, el('h2', {}, 'Documentação'), el('p', { class: 'discreto' }, docs.erro));

  const grupos = [
    secaoDocGrupo('Arquitetura', docs.curados?.arquitetura ?? [], true),
    secaoDocGrupo('Modelo de objetos', docs.curados?.objetos ?? [], false),
    secaoDocGrupo('Fluxo de dados', docs.curados?.dataFlow ?? [], false),
  ].filter(Boolean);

  return el(
    'section',
    {},
    el('h2', {}, 'Documentação'),
    grupos.length
      ? el('div', { class: 'doc-grupos' }, ...grupos)
      : el('p', { class: 'discreto' }, 'sem diagrama de arquitetura, objetos ou fluxo de dados catalogado ainda.'),
    el('h3', {}, 'Todos os documentos'),
    secaoModeladores(projeto.pasta, docs.modeladores ?? []),
  );
}

// "Pendente" e "Brainstorm" (SEM ESCOPO — brainstorm registrado, conforme
// PADROES-BACKLOG.md) particionam os itens de TOPO de cada feature — mesma
// granularidade que a aba Backlog já usa pra card (evita um item aparecer
// nas duas seções). Item já pronto não aparece em nenhuma: o placar de
// stats (acima) já conta isso melhor que uma terceira lista listaria.
function secaoBacklogDoProjeto(pasta) {
  if (!dadosBacklog) return el('p', { class: 'discreto' }, 'backlog ainda carregando…');
  const pr = dadosBacklog.projetos.find((p) => p.pasta === pasta);
  if (!pr) return el('p', { class: 'discreto' }, 'este projeto não tem o campo backlog no catálogo.');
  if (pr.estado !== 'ok') {
    const mensagem = pr.estado === 'sem_arquivo'
      ? `sem arquivo — ${pr.pasta}/${pr.backlog} não existe no disco`
      : `falha ao ler ${pr.pasta}/${pr.backlog} — ${pr.erro ?? pr.estado}`;
    return el('div', { class: 'sonda' }, el('span', { class: 'luz falha' }), el('span', {}, mensagem));
  }

  const topo = pr.features.flatMap((f) => f.itens);
  const brainstorm = topo.filter((nodo) => nodo.tags.some((t) => t.tag === 'SEM ESCOPO'));
  const pendentes = topo.filter((nodo) => (
    !nodo.tags.some((t) => t.tag === 'SEM ESCOPO') && (nodo.tipo === 'cru' || nodo.estado === 'aberto')
  ));

  return el(
    'div',
    {},
    el('h3', {}, `Pendente (${pendentes.length})`),
    pendentes.length
      ? el('div', { class: 'backlog-projeto-lista' }, ...pendentes.map((n) => desenharNodo(n)))
      : el('p', { class: 'discreto' }, 'nada pendente — tudo pronto ou em brainstorm.'),
    el('h3', { class: 'tag-sem-escopo-titulo' }, `Brainstorm (${brainstorm.length})`),
    brainstorm.length
      ? el('div', { class: 'backlog-projeto-lista' }, ...brainstorm.map((n) => desenharNodo(n)))
      : el('p', { class: 'discreto' }, 'nenhuma ideia registrada (SEM ESCOPO) ainda.'),
  );
}

async function abrirProjeto(pasta) {
  conteudoProjeto.replaceChildren(el('p', { class: 'discreto' }, 'Carregando…'));

  const projeto = dadosProjetos.find((p) => p.pasta === pasta);
  if (!projeto) {
    conteudoProjeto.replaceChildren(el('p', { class: 'discreto' }, `Projeto "${pasta}" não encontrado no catálogo.`));
    return;
  }

  const [docs, gitDetalhe] = await Promise.all([
    fetch(`/api/projetos/${encodeURIComponent(pasta)}/docs`).then((r) => r.json())
      .catch(() => ({ erro: 'falha ao buscar a documentação do projeto' })),
    fetch(`/api/projetos/${encodeURIComponent(pasta)}/git`).then((r) => r.json())
      .catch(() => ({ erro: 'falha ao buscar o estado git do projeto' })),
  ]);

  const prBacklog = dadosBacklog?.projetos.find((p) => p.pasta === pasta);
  conteudoProjeto.replaceChildren(
    secaoCabecalho(projeto),
    secaoStats(projeto, prBacklog),
    secaoTrabalhoLocal(gitDetalhe),
    secaoDocumentacao(projeto, docs),
    el('section', {}, el('h2', {}, 'Backlog deste projeto'), secaoBacklogDoProjeto(pasta)),
  );

  if (window.mermaid) mermaid.run();
}

// Bootstrap inicial: só aqui, no fim do ÚLTIMO script carregado, é seguro
// chamar atualizarTudo/rotear — as funções dos três arquivos já existem
// todas em escopo global neste ponto.
atualizarTudo();
setInterval(atualizarTudo, 60_000);
