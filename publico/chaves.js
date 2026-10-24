// Aba Chaves (24/10/2026) — inventário dos segredos por projeto e a troca de valor em
// duas ações. Nada aqui recebe valor do servidor: só nomes, presença, modo do arquivo
// e a rotação pendente (card, motivo, o que fazer depois). O valor novo sai deste
// formulário uma única vez, no POST de confirmação, e não fica em lugar nenhum da tela.
// Reaproveita `el` (app.js); só texto e nós, nunca marcação crua.

const abaChavesEl = document.getElementById('aba-chaves');
let dadosChaves = null;
let statusChaves = null;
let preparoChaves = null; // { confirmacaoId, projeto, nome, alvo, ... }

async function pedirChaves(metodo, caminho, corpo) {
  const resposta = await fetch(caminho, { method: metodo, headers: corpo !== undefined ? { 'content-type': 'application/json' } : {}, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  let dados = {};
  try { dados = await resposta.json(); } catch { /* corpo vazio */ }
  return { ok: resposta.ok, status: resposta.status, dados };
}

async function carregarChaves({ servidor = false } = {}) {
  statusChaves = { tipo: 'andamento', texto: servidor ? 'lendo o servidor por ssh (só nomes)…' : 'lendo os .env desta máquina (só nomes)…' };
  desenharChaves();
  const r = await pedirChaves('GET', servidor ? '/api/chaves/servidor' : '/api/chaves').catch(e => ({ ok: false, status: 0, dados: { erro: e.message } }));
  if (r.ok) { dadosChaves = r.dados; statusChaves = null; }
  else statusChaves = { tipo: 'erro', texto: r.dados?.erro ? `${r.dados.erro} (HTTP ${r.status})` : `falha HTTP ${r.status}` };
  desenharChaves();
  const selo = document.getElementById('selo-chaves');
  if (selo) selo.textContent = dadosChaves ? String(dadosChaves.pendentes.length) : '—';
}
window.carregarChaves = carregarChaves;

function linhaChave(projeto, c, alvoPadrao) {
  const rot = c.rotacao;
  const estados = [];
  if (c.local !== null && c.local !== undefined) estados.push(`local: ${c.local}`);
  if (c.servidor !== null && c.servidor !== undefined) estados.push(`servidor: ${c.servidor}`);
  const acoes = el('div', { class: 'chaves-acoes' });
  for (const alvo of ['local', 'servidor']) {
    if (c[alvo] === null || c[alvo] === undefined || c.bloqueado) continue;
    const b = el('button', { type: 'button', class: 'orq-acao' }, alvo === 'local' ? 'Trocar aqui' : 'Trocar no servidor');
    b.addEventListener('click', () => abrirTroca(projeto, c.nome, alvo, acoes));
    acoes.append(b);
  }
  if (alvoPadrao === 'fora') {
    const b = el('button', { type: 'button', class: 'orq-acao' }, 'Marcar como rotacionada');
    b.addEventListener('click', () => abrirTroca(projeto, c.nome, 'fora', acoes));
    acoes.append(b);
  }
  return el('div', { class: `chaves-linha${rot ? ' chaves-pendente' : ''}` },
    el('div', { class: 'chaves-nome' }, el('code', {}, c.nome), c.descricao ? el('span', { class: 'kicker' }, ` ${c.descricao}`) : ''),
    el('div', { class: 'chaves-estado' }, estados.join(' · ') || '—', c.ultimaTroca ? ` · trocada em ${new Date(c.ultimaTroca).toLocaleString('pt-BR')}` : ''),
    rot ? el('div', { class: 'chaves-rotacao' }, el('strong', {}, 'ROTAÇÃO PENDENTE'), ` — ${rot.motivo} (${rot.card}, desde ${rot.desde})`, rot.depois ? el('div', { class: 'kicker' }, `depois: ${rot.depois}`) : '') : '',
    c.bloqueado ? el('div', { class: 'kicker chaves-bloqueado' }, `troca fora do painel: ${c.bloqueado}`) : '',
    c.depois ? el('div', { class: 'kicker' }, `toda troca exige depois: ${c.depois}`) : '',
    acoes);
}

async function abrirTroca(projeto, nome, alvo, alvoEl) {
  alvoEl.querySelectorAll('.chaves-form').forEach(n => n.remove());
  const form = el('div', { class: 'chaves-form' });
  const status = el('p', { class: 'kicker' }, 'verificando sessão…');
  form.append(status);
  alvoEl.append(form);
  const r = await pedirChaves('POST', '/api/chaves/preparar', { projeto, nome, alvo });
  if (!r.ok) { status.textContent = r.status === 401 ? `${r.dados.erro} Abra https://astargne.com/login e volte a esta aba.` : (r.dados.erro ?? `falha HTTP ${r.status}`); return; }
  preparoChaves = r.dados;
  status.textContent = r.dados.depois ? `${r.dados.aviso} Depois: ${r.dados.depois}` : r.dados.aviso;
  const entrada = alvo === 'fora' ? null : el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': `novo valor de ${nome}`, placeholder: 'novo valor (não é exibido nem guardado na tela)', maxlength: '4096' });
  const confirmar = el('button', { type: 'button', class: 'orq-acao' }, alvo === 'fora' ? 'Confirmar: já rotacionei no provedor' : 'Confirmar troca');
  confirmar.addEventListener('click', async () => {
    const valor = entrada ? entrada.value : undefined;
    if (entrada && !valor) { status.textContent = 'informe o novo valor.'; return; }
    confirmar.disabled = true;
    status.textContent = 'gravando…';
    const c = await pedirChaves('POST', '/api/chaves/confirmar', valor === undefined ? { confirmacaoId: r.dados.confirmacaoId } : { confirmacaoId: r.dados.confirmacaoId, valor });
    if (entrada) entrada.value = '';
    if (!c.ok) { status.textContent = c.dados.erro ?? `falha HTTP ${c.status}`; confirmar.disabled = false; return; }
    status.textContent = c.dados.alvo === 'fora' ? 'registrado: rotação feita fora do painel.' : `gravado em ${c.dados.arquivo}${c.dados.reinicia ? ` · ${c.dados.reinicia} reinicia em 1 s` : c.dados.reiniciou ? ' · serviço reiniciado' : ''}.`;
    setTimeout(() => carregarChaves(), 1500);
  });
  form.append(...(entrada ? [entrada] : []), confirmar);
}

function desenharChaves() {
  const cabecalho = el('div', { class: 'decisoes-cabecalho' },
    el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 06 / CHAVES'),
      el('h2', { class: 'titulo-secao' }, dadosChaves ? `${dadosChaves.pendentes.length} rotações pendentes` : 'Chaves e segredos'),
      el('p', { class: 'kicker' }, dadosChaves ? `só nomes circulam · servidor ${dadosChaves.servidorLidoEm ? `lido às ${new Date(dadosChaves.servidorLidoEm).toLocaleTimeString('pt-BR')}` : 'não lido'} · troca no servidor ${dadosChaves.escritaServidorHabilitada ? 'ligada' : 'desligada (aguarda validador-deploy)'}` : '')),
    el('div', {}, botaoChaves('Reler desta máquina', () => carregarChaves()), ' ', botaoChaves('Ler inventário do servidor (ssh)', () => carregarChaves({ servidor: true }))));
  const blocos = [cabecalho];
  if (statusChaves) blocos.push(el('p', { class: statusChaves.tipo === 'erro' ? 'discreto erro' : 'discreto' }, statusChaves.texto));
  if (dadosChaves) {
    for (const p of dadosChaves.projetos) {
      const onde = [];
      if (p.local) onde.push(`local ${p.local.arquivo} ${p.local.existe ? `(modo ${p.local.modo}${p.local.permissaoFrouxa ? ' — FROUXO' : ''})` : `(${p.local.motivo})`}`);
      if (p.servidor) onde.push(`servidor ${p.servidor.lido ? `${p.servidor.arquivo} (modo ${p.servidor.modo}${p.servidor.permissaoFrouxa ? ' — FROUXO' : ''})` : 'não lido'} · unit ${p.servidor.unit}`);
      blocos.push(el('details', { class: 'grupo-projeto-decisoes', ...(p.chaves.some(c => c.rotacao) || p.foraDoEnv.some(c => c.rotacao) ? { open: '' } : {}) },
        el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'grupo-projeto-titulo' }, p.projeto), el('span', { class: 'kicker grupo-projeto-arquivo' }, onde.join(' · ')), el('span', { class: 'selo-contagem' }, String(p.chaves.length + p.foraDoEnv.length))),
        el('div', { class: 'lista-decisoes-tab' }, ...p.chaves.map(c => linhaChave(p.projeto, c)), ...p.foraDoEnv.map(c => linhaChave(p.projeto, c, 'fora')),
          ...(p.extras.length ? [el('p', { class: 'kicker' }, `outras variáveis no arquivo (não catalogadas): ${p.extras.join(', ')}`)] : []))));
    }
    const eventos = el('ul', { class: 'chaves-eventos' }, ...dadosChaves.eventos.map(e => el('li', {}, `${new Date(e.quando).toLocaleString('pt-BR')} · ${e.tipo} · ${e.projeto} · ${e.nome} · ${e.alvo}${e.reiniciado ? ' · reiniciado' : ''}`)));
    blocos.push(el('details', { class: 'grupo-projeto-decisoes' }, el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'), el('span', { class: 'grupo-projeto-titulo' }, 'Últimas trocas (sem valores)'), el('span', { class: 'selo-contagem' }, String(dadosChaves.eventos.length))), dadosChaves.eventos.length ? eventos : el('p', { class: 'discreto' }, 'nenhuma troca registrada.')));
  }
  abaChavesEl.replaceChildren(...blocos);
}

function botaoChaves(texto, acao) {
  const b = el('button', { type: 'button', class: 'orq-acao' }, texto);
  b.addEventListener('click', acao);
  return b;
}
