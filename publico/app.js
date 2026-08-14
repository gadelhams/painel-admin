const grade = document.getElementById('grade-projetos');
const listaProducao = document.getElementById('lista-producao');
const botaoAtualizar = document.getElementById('botao-atualizar');
const botaoSsh = document.getElementById('botao-ssh');
const saidaSsh = document.getElementById('saida-ssh');
const atualizadoEm = document.getElementById('atualizado-em');

function el(tag, atributos = {}, ...filhos) {
  const nodo = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') nodo.className = valor;
    else nodo.setAttribute(chave, valor);
  }
  nodo.append(...filhos);
  return nodo;
}

function tempoRelativo(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

function cartaoProjeto(p) {
  const etiquetas = [];

  if (p.git.repositorio) {
    etiquetas.push(el('span', { class: 'etiqueta' }, `⎇ ${p.git.branch}`));
    etiquetas.push(
      p.git.arquivosSujos > 0
        ? el('span', { class: 'etiqueta alerta' }, `${p.git.arquivosSujos} não commitado(s)`)
        : el('span', { class: 'etiqueta ok' }, 'limpo'),
    );
  } else if (p.existe) {
    etiquetas.push(el('span', { class: 'etiqueta falha' }, 'sem git'));
  }

  for (const porta of p.portas) {
    etiquetas.push(
      el(
        'span',
        { class: `etiqueta ${porta.ativa ? 'ok' : ''}`, title: porta.servico },
        `${porta.ativa ? '●' : '○'} :${porta.porta}`,
      ),
    );
  }

  const linhas = [
    el('h3', {}, p.titulo),
    el('p', { class: 'descricao' }, p.descricao),
    el('div', { class: 'stack' }, p.stack),
  ];

  if (p.git.repositorio) {
    linhas.push(
      el(
        'div',
        { class: 'git-linha', title: p.git.ultimoCommit.assunto },
        `último commit ${tempoRelativo(p.git.ultimoCommit.data)} — ${p.git.ultimoCommit.assunto}`,
      ),
    );
  }
  if (!p.existe) linhas.push(el('div', { class: 'git-linha' }, 'pasta não sincronizada nesta máquina'));

  linhas.push(el('div', { class: 'etiquetas' }, ...etiquetas));
  return el('div', { class: `cartao${p.existe ? '' : ' inexistente'}` }, ...linhas);
}

async function carregarProjetos() {
  const resposta = await fetch('/api/projetos');
  const { projetos } = await resposta.json();
  grade.replaceChildren(...projetos.map(cartaoProjeto));
}

function linhaSonda(s) {
  const detalhe = s.ok ? `HTTP ${s.status} · ${s.ms} ms` : (s.erro ?? `HTTP ${s.status}`);
  return el(
    'div',
    { class: 'sonda' },
    el('span', { class: `luz ${s.ok ? 'ok' : 'falha'}` }),
    el('span', {}, s.rotulo, ' — '),
    el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.url),
    el('span', { class: 'detalhe' }, detalhe),
  );
}

async function carregarProducao() {
  const resposta = await fetch('/api/producao');
  const { sondas } = await resposta.json();
  listaProducao.replaceChildren(...sondas.map(linhaSonda));
}

async function atualizarTudo() {
  botaoAtualizar.disabled = true;
  try {
    await Promise.all([carregarProjetos(), carregarProducao()]);
    atualizadoEm.textContent = `atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
  } finally {
    botaoAtualizar.disabled = false;
  }
}

botaoAtualizar.addEventListener('click', atualizarTudo);

botaoSsh.addEventListener('click', async () => {
  botaoSsh.disabled = true;
  saidaSsh.hidden = false;
  saidaSsh.textContent = 'Consultando linuxuser@astargne.com…';
  try {
    const resposta = await fetch('/api/producao/ssh');
    const resultado = await resposta.json();
    saidaSsh.textContent = resultado.ok ? resultado.saida : `Falhou: ${resultado.erro}`;
  } catch (erro) {
    saidaSsh.textContent = `Falhou: ${erro.message}`;
  } finally {
    botaoSsh.disabled = false;
  }
});

atualizarTudo();
setInterval(atualizarTudo, 60_000);
