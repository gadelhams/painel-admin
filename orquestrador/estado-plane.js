// Mudança de estado do card pela vigília: Todo → In Progress ao começar a codar e
// In Progress → Done quando a tentativa de teste é aprovada. Só a identidade técnica do
// projeto escreve; a versão da carta é conferida antes e o resultado relido depois.
import { UUID } from './uuid.js';
const GRUPOS = new Set(['started', 'completed']);
// Quando o projeto tem mais de um estado no grupo, estes nomes desempatam (os padrões do Plane).
const PREFERIDOS = { started: ['In Progress', 'Em andamento'], completed: ['Done', 'Concluído', 'Concluido'] };

export function criarEscritorEstadoPlane({ chave, projetoPermitido, autorEsperado,
  apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch }) {
  if (!chave || !UUID.test(projetoPermitido ?? '') || !UUID.test(autorEsperado ?? '')) throw new Error('identidade de escrita restrita ausente');
  const prefixo = `${apiBase}/api/v1/workspaces/astargne/projects/${projetoPermitido}/`;
  async function pedir(caminho, opcoes = {}) {
    const r = await fetchImpl(`${prefixo}${caminho}`, { ...opcoes,
      headers: { 'X-API-Key': chave, ...(opcoes.body ? { 'content-type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Plane recusou a mudança de estado (HTTP ${r.status})`);
    return r.json();
  }
  return async ({ projetoId, cartaId, grupo, versaoCarta, removerEtiqueta = null }) => {
    if (projetoId !== projetoPermitido || !UUID.test(cartaId ?? '') || !GRUPOS.has(grupo)) throw new Error('mudança de estado fora do escopo da identidade de escrita');
    const estados = await pedir('states/?per_page=100');
    const candidatos = (estados.results ?? []).filter(e => e.group === grupo && UUID.test(e.id ?? ''));
    const alvo = candidatos.find(e => PREFERIDOS[grupo].includes(e.name)) ?? candidatos[0];
    if (!alvo) throw new Error(`projeto sem estado do grupo ${grupo}`);
    const carta = await pedir(`work-items/${cartaId}/?expand=labels`);
    if (carta.id !== cartaId || carta.updated_at !== versaoCarta) throw new Error('carta mudou; releia antes de mudar o estado');
    const corpo = { state: alvo.id };
    if (removerEtiqueta) {
      if (!Array.isArray(carta.labels)) throw new Error('etiquetas da carta ilegíveis');
      corpo.labels = carta.labels.filter(x => x.name !== removerEtiqueta).map(x => x.id);
    }
    await pedir(`work-items/${cartaId}/`, { method: 'PATCH', body: JSON.stringify(corpo) });
    const verificada = await pedir(`work-items/${cartaId}/?expand=labels`);
    const estadoAtual = typeof verificada.state === 'string' ? verificada.state : verificada.state?.id;
    if (verificada.id !== cartaId || estadoAtual !== alvo.id ||
        (removerEtiqueta && (verificada.labels ?? []).some(x => x.name === removerEtiqueta))) {
      throw new Error('estado aplicado com resultado divergente; intervenção necessária');
    }
    return { estadoId: alvo.id, estadoNome: alvo.name, versaoCarta: verificada.updated_at };
  };
}
