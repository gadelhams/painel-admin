// Aba Grafo — relações entre projetos, desenhadas via Mermaid (já vendorizado
// para os diagramas dos docs de projeto) em vez de SVG à mão: zero precedente
// de desenho manual no projeto, e o tamanho do catálogo (~10 nós) é
// exatamente o que o layout automático do Mermaid resolve bem.
// Clique em nó de projeto navega via `click <slug> href "#/projeto/<pasta>"`
// — funciona em securityLevel 'strict' (o padrão herdado de app.js); `click
// ... call` NÃO dispara nesse modo, por isso o desenho usa href, não call.

const grafoContainer = document.getElementById('grafo-mermaid');
const abaGrafo = document.getElementById('aba-grafo');

// Texto já montado, aguardando a aba ficar visível pra desenhar de verdade
// (ver renderizarGrafoSeVisivel abaixo).
let textoGrafoPendente = null;

// Mermaid exige token de nó sem espaço; o rótulo entre aspas pode ter
// qualquer texto. `pasta`/`id` têm espaço ("Mapa Khorvaire", "alexa
// youtube") — desce pra um slug e guarda o mapa de volta pro clique.
function slugificar(bruto) {
  const limpo = bruto
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-zA-Z]/.test(limpo) ? limpo : `n_${limpo}`;
}

// Texto entra entre aspas na sintaxe do Mermaid — aspas dupla dentro do
// rótulo quebraria o parser; troca por simples em vez de escapar (raro
// aparecer, e o resultado continua legível).
function textoSeguro(s) {
  return String(s).replace(/"/g, "'");
}

async function carregarGrafo() {
  if (!grafoContainer) return;
  const [respRelacoes, respProjetos] = await Promise.all([
    fetch('/api/relacoes'),
    fetch('/api/projetos'),
  ]);
  const { relacoes, nosExtra } = await respRelacoes.json();
  const { projetos } = await respProjetos.json();

  const slugDoAlvo = new Map();
  const linhas = ['flowchart TD'];

  for (const p of projetos) {
    const slug = slugificar(p.pasta);
    slugDoAlvo.set(p.pasta, slug);
    linhas.push(`  ${slug}["${textoSeguro(p.titulo)}"]`);
    linhas.push(`  click ${slug} href "#/projeto/${encodeURIComponent(p.pasta)}" "${textoSeguro(p.titulo)}"`);
  }
  // Nó de infra (hexágono, pra diferenciar de projeto à primeira vista) —
  // sem `click`: não existe página de projeto pra abrir.
  for (const n of nosExtra) {
    const slug = slugificar(n.id);
    slugDoAlvo.set(n.id, slug);
    linhas.push(`  ${slug}{{"${textoSeguro(n.titulo)}"}}`);
  }
  for (const r of relacoes) {
    const slugDe = slugDoAlvo.get(r.de);
    const slugPara = slugDoAlvo.get(r.para);
    if (!slugDe || !slugPara) continue; // relação aponta pra pasta/id que saiu do catálogo
    // Aspas ao redor do rótulo: sem elas, parêntese/vírgula dentro do texto
    // entre pipes quebra o parser do Mermaid (ex.: "(SPATIAL_DATABASE_URL)").
    linhas.push(`  ${slugDe} -->|"${textoSeguro(r.rotulo)}"| ${slugPara}`);
  }

  textoGrafoPendente = linhas.join('\n');
  await renderizarGrafoSeVisivel();
}

// Mermaid precisa MEDIR texto/nó no DOM pra calcular o layout das setas
// (getBBox e afins) — num container escondido por `hidden` (display:none),
// essas medidas voltam zeradas e o dagre quebra ("Could not find a suitable
// point for the given distance"), de forma intermitente (depende de timing,
// não é sempre). `carregarGrafo` roda sempre (bootstrap + a cada 60s), mas
// SÓ desenha quando a aba Grafo está de fato visível — o texto fica
// guardado em `textoGrafoPendente` e este é chamado de novo quando o
// roteador troca pra ela (`mostrarView` em app.js).
async function renderizarGrafoSeVisivel() {
  if (!grafoContainer || !abaGrafo || abaGrafo.hidden || textoGrafoPendente === null) return;
  grafoContainer.textContent = textoGrafoPendente;
  // Mermaid marca o elemento como processado após renderizar uma vez — sem
  // remover o atributo, uma segunda visita à aba não re-desenha.
  grafoContainer.removeAttribute('data-processed');
  if (window.mermaid) {
    try {
      await mermaid.run();
    } catch (erro) {
      console.error('[grafo] mermaid.run falhou:', erro);
    }
  }
}
