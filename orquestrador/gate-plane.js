// Aplicação explícita de gate com evidência no card e identidade separada.
// O comentário precede o PATCH; uma falha posterior fica incerta e não gera
// retry automático. A própria etiqueta nunca inicia processo ou lease.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GATES = new Set(['READY TO DEV', 'READY TO TEST']);
const MARCADOR = 'GATE/v1 ';
const escapar = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function validarPropostaGate({ gate, justificativa, evidencias }) {
  if (!GATES.has(gate)) throw new Error('gate inválido');
  if (typeof justificativa !== 'string' || justificativa.trim().length < 10 || justificativa.length > 2000) {
    throw new Error('justificativa de gate inválida');
  }
  if (!Array.isArray(evidencias) || evidencias.length < 1 || evidencias.length > 10 || evidencias.some(x =>
    typeof x !== 'string' || x.trim().length < 5 || x.length > 500)) throw new Error('evidências do gate obrigatórias');
  return { gate, justificativa: justificativa.trim(), evidencias: evidencias.map(x => x.trim()) };
}

export function codificarGate({ projetoId, cartaId, chaveIdempotencia, versaoCarta, ...proposta }) {
  if (![projetoId, cartaId, chaveIdempotencia].every(x => UUID.test(x ?? '')) || !Number.isFinite(Date.parse(versaoCarta))) {
    throw new Error('alvo ou versão de gate inválidos');
  }
  const dados = { versao: 1, projetoId, cartaId, chaveIdempotencia, versaoCarta,
    ...validarPropostaGate(proposta) };
  return `<p>[ORQ/v1 papel=decisao] ${MARCADOR}${Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url')}</p>` +
    `<p>${escapar(dados.gate)}: ${escapar(dados.justificativa)}</p><ul>${dados.evidencias.map(x => `<li>${escapar(x)}</li>`).join('')}</ul>`;
}

export function gatesDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  return interacoes.filter(e => e.autorId === autorId && e.texto?.startsWith(MARCADOR)).map(e => {
    let dados;
    try { dados = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8')); }
    catch { throw new Error('evidência de gate ilegível'); }
    if (dados.versao !== 1 || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
        !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) {
      throw new Error('evidência de gate não confere');
    }
    validarPropostaGate(dados);
    return { ...dados, comentarioId: e.id, autorId: e.autorId, quando: e.quando };
  });
}

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
