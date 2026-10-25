// Aba Docs (decisão do dono, 25/10/2026): documentação funcional,
// arquitetural e técnica de cada projeto — separada dos cards do Plane, que
// ficam só para desenvolvimento — e, no topo, a dívida de alinhamento
// código ⇄ Plane ⇄ painel medida pela rotina do servidor (alinhamento.js).
// Só leitura: a correção é do orquestrador no fecho.
const abaDocsEl = document.getElementById('aba-docs');
let dadosAlinhamento = null;
let statusDocs = null;

const ROTULO = { funcional: 'funcional', arquitetural: 'arquitetural', tecnica: 'técnica', contrato: 'contrato' };
const ROTULO_SINAL = {
  fio_longo: 'fio longo', selado_sem_compactar: 'selado sem compactar', current_atras: 'current.md atrasado',
  cita_fechado: 'doc cita card fechado', sem_push: 'sem push', atras_remoto: 'atrás do remoto',
  check_docs: 'portão de docs', sem_current: 'sem current.md', catalogo: 'catálogo', erro: 'erro',
};

async function carregarDocs({ agora = false } = {}) {
  statusDocs = { tipo: 'andamento', texto: agora ? 'varrendo agora (git, Plane, portões)…' : 'lendo a última varredura…' };
  desenharDocs();
  try {
    const r = await fetch(`/api/alinhamento${agora ? '?agora=1' : ''}`);
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro ?? `HTTP ${r.status}`);
    dadosAlinhamento = dados;
    statusDocs = null;
  } catch (erro) { statusDocs = { tipo: 'erro', texto: `não consegui ler o alinhamento: ${erro.message}` }; }
  desenharDocs();
}
window.carregarDocs = carregarDocs;

function linhaSinal(s) {
  return el('li', { class: `docs-sinal gravidade-${s.gravidade}` },
    el('span', { class: 'chip-app' }, ROTULO_SINAL[s.tipo] ?? s.tipo), ' ',
    s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'id-rastreador' }, s.carta ?? 'card') : '', s.url ? ' ' : '',
    s.texto);
}

function linksDocs(p) {
  const itens = Object.entries(ROTULO).map(([tipo, rotulo]) => {
    const arquivo = p.docs?.[tipo];
    return arquivo
      ? el('a', { href: `#/projeto/${encodeURIComponent(p.pasta)}?arquivo=${encodeURIComponent(arquivo)}`, class: 'docs-link', title: arquivo }, `${rotulo}: ${arquivo}`)
      : el('span', { class: 'discreto' }, `${rotulo}: —`);
  });
  return el('div', { class: 'docs-links' }, ...itens.flatMap((i, k) => (k ? [' · ', i] : [i])));
}

function desenharDocs() {
  const blocos = [];
  const d = dadosAlinhamento;
  blocos.push(el('div', { class: 'decisoes-cabecalho' },
    el('div', {}, el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 07 / DOCS E ALINHAMENTO'),
      el('h2', { class: 'titulo-secao' }, d ? `${d.total} sinal(is) de desalinhamento` : 'Docs'),
      el('p', { class: 'kicker' }, d ? `varrido ${new Date(d.varridoEm).toLocaleString('pt-BR')} em ${Math.round(d.duracaoMs / 1000)} s · ${d.cartasMedidas} carta(s) remedidas · fio longo = ${d.limiarFio}+ comentários sem COMPACTADO/v1${d.erroPlane ? ` · Plane: ${d.erroPlane}` : ''}` : 'o Plane é só desenvolvimento; a documentação mora nos docs do projeto')),
    (() => { const b = el('button', { type: 'button', class: 'orq-acao' }, 'Varrer agora'); b.addEventListener('click', () => carregarDocs({ agora: true })); return b; })()));
  if (statusDocs) blocos.push(el('p', { class: statusDocs.tipo === 'erro' ? 'erro' : 'discreto' }, statusDocs.texto));
  if (d) {
    const ordenados = [...d.projetos].sort((a, b) => b.sinais.length - a.sinais.length || a.titulo.localeCompare(b.titulo));
    for (const p of ordenados) {
      blocos.push(el('details', { class: 'grupo-projeto-decisoes', ...(p.sinais.length ? { open: '' } : {}) },
        el('summary', { class: 'grupo-projeto-cab' }, el('span', { class: 'chev' }, '›'),
          el('span', { class: 'grupo-projeto-titulo' }, p.titulo),
          el('span', { class: 'kicker grupo-projeto-arquivo' }, p.sinais.length ? p.sinais.map((s) => ROTULO_SINAL[s.tipo] ?? s.tipo).join(' · ') : 'alinhado'),
          el('span', { class: 'selo-contagem' }, String(p.sinais.length))),
        linksDocs(p),
        p.sinais.length ? el('ul', { class: 'docs-sinais' }, ...p.sinais.map(linhaSinal)) : el('p', { class: 'discreto' }, 'nada desalinhado nesta varredura.')));
    }
  }
  abaDocsEl.replaceChildren(el('div', { class: 'docs-painel' }, ...blocos));
  const selo = document.getElementById('selo-docs');
  if (selo && d) selo.textContent = String(d.total);
}
