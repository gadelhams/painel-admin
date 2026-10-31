// Lê UMA carta do Plane sem cache, pelo caminho do projeto (carta, comentários, labels, estados e atividades), com a chave Guest. Não escreve nem decide.
//
// Não passa pelas vagas de plane/cliente.js de propósito: o confirmar da mesa lê sob a trava
// global da orquestração, e lá o prazo de cada GET precisa contar desde já (a espera numa
// rajada do backlog não tem teto). São poucas leituras em sequência, longe de rajada.
import { cartaDaMesa, RecusaMesa } from './permissao.js';
import { textoDeHtml } from './texto-html.js';
import { lerDecisao, FONTE, CABECALHO_RECIBO } from './protocolo-decisao.js';

const WEB = 'https://plane.vpn.astargne.com/astargne';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGINAS = 20;
const idDe = x => (x && typeof x === 'object' ? x.id : x);

export function criarLeitorCarta({ chave, apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095',
  fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const raiz = `${apiBase}/api/v1/workspaces/astargne`;

  async function pedir(caminho, sinal) {
    if (!chave) throw new RecusaMesa('sem PLANE_API_KEY: a mesa não lê o Plane', 503);
    const sinais = [AbortSignal.timeout(timeoutMs), ...(sinal ? [sinal] : [])];
    const r = await fetchImpl(`${raiz}${caminho}`, { redirect: 'error', headers: { 'X-API-Key': chave }, signal: AbortSignal.any(sinais) });
    if (r.status === 404) throw new RecusaMesa('carta não encontrada no Plane', 404);
    const corpo = await r.json().catch(() => null);
    if (!r.ok || !corpo) throw new Error(`Plane recusou a leitura (HTTP ${r.status})`);
    return corpo;
  }

  async function todas(caminho, sinal) {
    const itens = [];
    let cursor = null;
    for (let i = 0; i < MAX_PAGINAS; i += 1) {
      const sep = caminho.includes('?') ? '&' : '?';
      const pagina = await pedir(`${caminho}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, sinal);
      if (Array.isArray(pagina)) return pagina;
      if (!Array.isArray(pagina.results)) throw new Error('Plane devolveu lista ilegível');
      itens.push(...pagina.results);
      if (!pagina.next_page_results) return itens;
      cursor = pagina.next_cursor;
    }
    throw new Error('lista do Plane longa demais');
  }

  // A carta inteira, como está AGORA. O projeto vem da sigla (catálogo), e a carta lida
  // tem de pertencer a ele: o POST de comentário do Plane não confere isso sozinho.
  async function retrato(identificador, { sinal } = {}) {
    const alvo = cartaDaMesa(identificador);
    const p = alvo.projeto.projetoId;
    const achada = await pedir(`/work-items/${alvo.sigla}-${alvo.numero}/`, sinal);
    if (!UUID.test(achada?.id ?? '') || idDe(achada.project) !== p) throw new RecusaMesa('carta fora do projeto da sigla');
    return reler(alvo, achada.id, { sinal });
  }

  async function reler(alvo, cartaId, { sinal } = {}) {
    const p = alvo.projeto.projetoId;
    const base = `/projects/${p}/work-items/${cartaId}`;
    const carta = await pedir(`${base}/?expand=labels,state`, sinal);
    if (carta.id !== cartaId || idDe(carta.project) !== p || Number(carta.sequence_id) !== alvo.numero ||
        !Array.isArray(carta.labels) || carta.labels.some(l => !UUID.test(idDe(l) ?? '') || typeof l.name !== 'string')) {
      throw new Error('leitura da carta incoerente');
    }
    const [comentarios, labels, estados] = await Promise.all([
      todas(`${base}/comments/`, sinal), todas(`/projects/${p}/labels/`, sinal), todas(`/projects/${p}/states/`, sinal)]);
    return { alvo, cartaId, carta, comentarios, labels, estados };
  }

  const atividades = (alvo, cartaId, { sinal } = {}) =>
    todas(`/projects/${alvo.projeto.projetoId}/work-items/${cartaId}/activities/`, sinal);

  return { retrato, reler, atividades };
}

// O que a gaveta e o C-3PO veem: texto, nunca o HTML do Plane. `autorMesa` marca os comentários da própria mesa.
export function cartaParaLeitura(r, { autorMesa = null, maxComentarios = 30 } = {}) {
  const c = r.carta;
  const ordenados = [...r.comentarios].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    identificador: r.alvo.identificador,
    projeto: r.alvo.projeto.pasta,
    titulo: String(c.name ?? ''),
    url: `${WEB}/browse/${r.alvo.identificador}/`,
    estado: c.state?.name ?? null,
    labels: c.labels.map(l => l.name).sort(),
    descricao: textoDeHtml(c.description_html),
    estados: r.estados.map(e => e.name).filter(Boolean),
    temProduto: r.labels.some(l => l.name === 'PRODUTO'),
    comentarios: ordenados.slice(-maxComentarios).map(x => ({
      quando: x.created_at ?? null,
      texto: textoDeHtml(x.comment_html, 1_500),
      // Só conta como da mesa o que o protocolo reconhece (ator, fonte, sem edição, cabeçalho).
      mesa: lerDecisao(x, { autorEsperado: autorMesa }) ? 'decisao'
        : autorMesa && x.external_source === FONTE && idDe(x.actor ?? x.created_by) === autorMesa && !x.edited_at &&
          String(x.comment_html ?? '').startsWith(`<p><strong>${CABECALHO_RECIBO}</strong>`) ? 'recibo' : null,
    })),
    comentariosOmitidos: Math.max(0, ordenados.length - maxComentarios),
  };
}
