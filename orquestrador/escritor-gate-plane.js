// Grava a etiqueta depois do comentário. O texto GATE/v1 mora em protocolo-gate.js.
// Uma falha posterior fica incerta e não gera retry automático.

import { GATES } from './protocolo-gate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarEscritorGatePlane({ chave, projetoPermitido, autorEsperado,
  apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch }) {
  if (!chave || !UUID.test(projetoPermitido ?? '') || !UUID.test(autorEsperado ?? '')) throw new Error('identidade de escrita restrita ausente');
  const prefixo = `${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/`;
  async function pedir(caminho, opcoes = {}) {
    const r = await fetchImpl(`${prefixo}${caminho}`, { ...opcoes,
      headers: { 'X-API-Key': chave, ...(opcoes.body ? { 'content-type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(15_000) });
    if (r.status === 409 && opcoes.method === 'POST') {
      // O Plane responde 409 com o id quando external_source/external_id já existem no card:
      // é prova de idempotência (a escrita anterior chegou), não recusa.
      const corpo = await r.json().catch(() => ({}));
      if (UUID.test(corpo?.id ?? '')) return pedir(`${caminho}${corpo.id}/`);
    }
    if (!r.ok) throw new Error(`Plane recusou alteração do gate (HTTP ${r.status})`);
    return r.json();
  }
  // `remover` (vigília): troca READY TO DEV por READY TO TEST na mesma escrita, com recibo —
  // a única troca de gate sem decisão humana, e só depois de uma tentativa concluída.
  return async ({ projetoId, cartaId, gate, html, chaveIdempotencia, versaoCarta, remover = null }) => {
    if (projetoId !== projetoPermitido || !UUID.test(cartaId ?? '') || !UUID.test(chaveIdempotencia ?? '') || !GATES.has(gate) ||
        (remover !== null && (!GATES.has(remover) || remover === gate))) {
      throw new Error('gate fora do escopo da identidade de escrita');
    }
    const carta = await pedir(`work-items/${cartaId}/?expand=labels`);
    if (carta.id !== cartaId || carta.updated_at !== versaoCarta || !Array.isArray(carta.labels)) {
      throw new Error('carta mudou ou leitura de etiquetas inválida');
    }
    if (carta.labels.some(x => GATES.has(x.name) && x.name !== remover)) throw new Error('gate já presente; não alterar automaticamente');
    if (remover && !carta.labels.some(x => x.name === remover)) throw new Error(`gate ${remover} a trocar não está na carta`);
    const idsExistentes = carta.labels.filter(x => x.name !== remover).map(x => x.id);
    if (idsExistentes.some(x => !UUID.test(x ?? ''))) throw new Error('etiquetas da carta ilegíveis');
    const catalogo = await pedir('labels/?per_page=100');
    if (!Array.isArray(catalogo.results) || catalogo.next_page_results) throw new Error('catálogo de etiquetas incompleto');
    const alvos = catalogo.results.filter(x => x.name === gate);
    if (alvos.length !== 1 || !UUID.test(alvos[0].id ?? '')) throw new Error('gate não é etiqueta única do projeto');
    const comentario = await pedir(`work-items/${cartaId}/comments/`, { method: 'POST',
      body: JSON.stringify({ comment_html: html, external_source: 'orquestrador-gate-v1', external_id: chaveIdempotencia }) });
    const autor = comentario.actor?.id ?? comentario.actor ?? comentario.created_by?.id ?? comentario.created_by;
    if (!UUID.test(comentario.id ?? '') || autor !== autorEsperado) throw new Error('Plane não confirmou autoria da evidência');
    // O PATCH substitui o conjunto inteiro de etiquetas: uma etiqueta posta por editor
    // externo entre a leitura e agora seria apagada em silêncio. Releitura imediata; o
    // recibo já gravado faz deste um estado incerto para conferência humana.
    const releitura = await pedir(`work-items/${cartaId}/?expand=labels`);
    const idsAgora = (releitura.labels ?? []).filter(x => x.name !== remover).map(x => x.id).sort();
    if (JSON.stringify(idsAgora) !== JSON.stringify([...idsExistentes].sort())) {
      throw new Error('etiquetas mudaram durante a aplicação; recibo gravado sem etiqueta — conferir o card');
    }
    await pedir(`work-items/${cartaId}/`, { method: 'PATCH',
      body: JSON.stringify({ labels: [...idsExistentes, alvos[0].id] }) });
    const verificada = await pedir(`work-items/${cartaId}/?expand=labels`);
    const nomes = (verificada.labels ?? []).map(x => x.name);
    if (verificada.id !== cartaId || nomes.filter(x => GATES.has(x)).length !== 1 || !nomes.includes(gate) ||
        idsExistentes.some(id => !verificada.labels.some(x => x.id === id))) {
      throw new Error('gate aplicado com resultado divergente; intervenção necessária');
    }
    return { comentarioId: comentario.id, gate, versaoCarta: verificada.updated_at };
  };
}
