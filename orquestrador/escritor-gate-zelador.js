// Escritor do gate do zelador: grava o recibo GATE/v1 (fonte `zelador-gate-v1`) e a etiqueta READY TO DEV, com a sessão da chave do zelador. Não confere prontidão nem elegibilidade (zelador-gate.js).
//
// F4b (J59, J62, J72 do parecer de 31/10/2026):
// - só READY TO DEV e nasce SEM `remover`: o zelador nunca troca nem tira gate;
// - o HTML sai de `codificarGate` (dados estruturados; a prosa já passou pelo filtro do
//   veredito): cabeçalho `[ORQ/v1 papel=decisao] GATE/v1`, que é o que faz dele um recibo;
// - `external_id` = a chave determinística (UUIDv5 de carta + gate + digital): uma queda entre
//   o recibo e a etiqueta volta no 409, que só vale com o comentário do zelador, desta fonte e
//   com o mesmo `external_id`;
// - sob a trava de quem chama (`sobTrava`) vão só a releitura da carta (versão e etiquetas), o
//   POST, a releitura das etiquetas e o PATCH, com 6 s por chamada e 20 s no total (J72); o
//   catálogo de etiquetas e a verificação ficam fora.
import { FONTE_GATE_ZELADOR, GATES, codificarGate } from './protocolo-gate.js';
import { UUID } from './uuid.js';

const GATE = 'READY TO DEV';
const abortar = mensagem => Object.assign(new Error(mensagem), { abortar: true });
const autorDe = c => c?.actor?.id ?? c?.actor ?? c?.created_by?.id ?? c?.created_by ?? null;

export function criarMarcadorGateZelador({ sessao, escopoPermitido, foraDoEscopo, prazoSobTrava, ator }) {
  const exigir = (r, oque) => { if (!r.ok || !r.corpo) throw new Error(`Plane recusou ${oque} (HTTP ${r.status})`); return r.corpo; };

  return async function marcarGate({ projetoId, cartaId, chaveIdempotencia, versaoCarta, justificativa, evidencias, sobTrava = acao => acao(), ...resto }) {
    if (Object.keys(resto).length) throw new Error('o escritor de gate do zelador não aceita outros campos (nunca remover)');
    if (!UUID.test(cartaId ?? '') || !UUID.test(chaveIdempotencia ?? '')) throw new Error('gate do zelador fora da forma');
    const html = codificarGate({ projetoId, cartaId, chaveIdempotencia, versaoCarta, gate: GATE, justificativa, evidencias });
    const { pedir, base } = await sessao(projetoId);
    const catalogo = exigir(await pedir(`/workspaces/astargne/projects/${projetoId}/labels/?per_page=100`), 'as etiquetas');
    if (!Array.isArray(catalogo.results) || catalogo.next_page_results) throw new Error('catálogo de etiquetas incompleto');
    const alvos = catalogo.results.filter(x => x.name === GATE);
    if (alvos.length !== 1 || !UUID.test(alvos[0].id ?? '')) throw new Error('READY TO DEV não é etiqueta única do projeto');
    let idsExistentes;
    const comentarioId = await sobTrava(async () => {
      const resta = prazoSobTrava();
      if (!(await escopoPermitido(projetoId))) throw foraDoEscopo();
      const carta = exigir(await pedir(`${base}/${cartaId}/?expand=labels`, { timeoutMs: resta() }), 'a leitura da carta');
      if (carta.id !== cartaId || !Array.isArray(carta.labels)) throw new Error('carta ilegível para o zelador');
      if (carta.updated_at !== versaoCarta) throw abortar('a carta mudou desde a conferência');
      if (carta.labels.some(x => GATES.has(x?.name))) throw abortar('gate já presente; o zelador não troca gate');
      idsExistentes = carta.labels.map(x => x.id);
      if (idsExistentes.some(x => !UUID.test(x ?? ''))) throw new Error('etiquetas da carta ilegíveis');
      const r = await pedir(`${base}/${cartaId}/comments/`, { method: 'POST', timeoutMs: resta(),
        body: JSON.stringify({ comment_html: html, external_source: FONTE_GATE_ZELADOR, external_id: chaveIdempotencia }) });
      let comentario;
      if (r.status === 409 && UUID.test(r.corpo?.id ?? '')) {
        comentario = exigir(await pedir(`${base}/${cartaId}/comments/${r.corpo.id}/`, { timeoutMs: resta() }), 'a releitura do recibo');
        if (comentario.external_source !== FONTE_GATE_ZELADOR || comentario.external_id !== chaveIdempotencia) throw new Error('external_id do gate já usado por outro comentário; conferir a carta');
      } else comentario = exigir(r, 'o recibo do gate');
      if (!UUID.test(comentario.id ?? '') || autorDe(comentario) !== ator) throw new Error('Plane não confirmou a autoria do recibo do zelador');
      // O PATCH substitui o conjunto inteiro: etiqueta posta por outro no intervalo apareceria aqui.
      const releitura = exigir(await pedir(`${base}/${cartaId}/?expand=labels`, { timeoutMs: resta() }), 'a releitura das etiquetas');
      if (JSON.stringify((releitura.labels ?? []).map(x => x.id).sort()) !== JSON.stringify([...idsExistentes].sort())) {
        throw abortar('etiquetas mudaram durante a aplicação; recibo gravado sem etiqueta');
      }
      exigir(await pedir(`${base}/${cartaId}/`, { method: 'PATCH', timeoutMs: resta(), body: JSON.stringify({ labels: [...idsExistentes, alvos[0].id] }) }), 'a etiqueta');
      return comentario.id;
    });
    const verificada = exigir(await pedir(`${base}/${cartaId}/?expand=labels`), 'a releitura de verificação');
    const nomes = (verificada.labels ?? []).map(x => x.name);
    const conferiu = verificada.id === cartaId && nomes.filter(x => GATES.has(x)).length === 1 && nomes.includes(GATE)
      && idsExistentes.every(id => verificada.labels.some(x => x.id === id));
    return { comentarioId, conferiu, versaoCarta: verificada.updated_at ?? null };
  };
}
