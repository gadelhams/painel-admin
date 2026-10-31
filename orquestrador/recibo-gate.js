// Amarra o recibo GATE/v1 à instância ATUAL da etiqueta pelas atividades da carta (J55). Só leitura; não decide elegibilidade além do recibo.
//
// Sem isto, um recibo antigo "verifica" qualquer etiqueta igual posta depois: o gate sai pelo
// dono e alguém o recoloca à mão no Plane. Regra: a última atividade que ADICIONOU a etiqueta
// (`field: labels`, `new_identifier` = id dela) tem de ser de um autor aceito e posterior a um
// recibo válido do mesmo gate. Atividades ilegíveis ou ausentes = inelegível (falha fechada).

const idDe = v => (typeof v === 'string' ? v : v?.id ?? null);
const atorDe = a => idDe(a?.actor) ?? idDe(a?.actor_detail) ?? null;

// O Plane devolve a lista crua ou paginada, conforme a versão.
async function atividadesDa(consultar, projetoId, cartaId) {
  const base = `/projects/${projetoId}/work-items/${cartaId}/activities/`;
  const itens = [];
  let cursor = null;
  do {
    const pagina = await consultar(`${base}?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (Array.isArray(pagina)) return pagina;
    if (!Array.isArray(pagina?.results)) throw new Error('atividades fora da forma');
    itens.push(...pagina.results);
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return itens;
}

/**
 * carta: a carta da fila com `labels` expandidas ({ id, name }); recibos: os GATE/v1 válidos
 * (lerGatesDoCanal) do gate em questão; autores: ids aceitos como autores da etiqueta.
 * Devolve { ok: true, recibo } ou { ok: false, motivo }.
 */
export async function conferirInstanciaDoGate({ consultar, carta, gate, recibos, autores }) {
  const etiqueta = (carta.labels ?? []).find(l => l?.name === gate);
  if (!etiqueta?.id) return { ok: false, motivo: 'etiqueta do gate sem id legível' };
  let atividades;
  try { atividades = await atividadesDa(consultar, carta.projetoId, carta.id); }
  catch { return { ok: false, motivo: 'atividades da carta ilegíveis' }; }
  const adicoes = atividades.filter(a => a?.field === 'labels' && a.new_identifier === etiqueta.id);
  if (adicoes.some(a => !Number.isFinite(Date.parse(a.created_at)))) return { ok: false, motivo: 'atividade da etiqueta sem data legível' };
  const ultima = adicoes.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).at(-1);
  if (!ultima) return { ok: false, motivo: 'atividade que pôs a etiqueta não encontrada' };
  if (!autores.includes(atorDe(ultima))) return { ok: false, motivo: 'etiqueta atual posta por autor não aceito' };
  const quando = Date.parse(ultima.created_at);
  const recibo = recibos.filter(r => r.gate === gate && Date.parse(r.quando) <= quando)
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando)).at(-1);
  if (!recibo) return { ok: false, motivo: 'etiqueta atual posta antes de qualquer recibo válido' };
  return { ok: true, recibo };
}
