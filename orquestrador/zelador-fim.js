// Fim do job do zelador: o que sobrou no projeto, do Plane atual e sem cache, por uma tabela fechada de quem destrava cada etiqueta. Não escreve.
//
// J41–J44 do plano e J70 do parecer: "feita" = zero abertas e zero em andamento (nunca 100%
// arredondado); "espera integração" = ramos `orq/*` fora do ramo principal. O destaque do
// bloqueio no Hangar só acende quando a nave não está feita e nada mais é da frota: nem
// carta a puxar (F4) nem ramo a integrar — só decisão e tarefa do dono.

// Quem destrava cada etiqueta. A primeira que casar decide; carta sem nenhuma é da frota.
const DESTRAVA = Object.freeze([
  ['ASTARGNE', 'decisao'], ['PRODUTO', 'decisao'], ['CONGELADA', 'decisao'], ['SEM ESCOPO', 'decisao'],
  ['TAREFA DONO', 'tarefaDono'], ['PÓS-PLAYTEST', 'tarefaDono'], ['EMPÍRICA', 'tarefaDono'],
  ['BLOQUEADA', 'esperaOutraCarta'],
]);
const MAX_LISTA = 30;

export function nadaFazivel({ cartas, sigla, ramosNaoIntegrados = [] }) {
  const abertas = cartas.filter(c => !['completed', 'cancelled', 'canceled'].includes(c.state?.group));
  const emAndamento = abertas.filter(c => c.state?.group === 'started').length;
  const categorias = { esperaPuxar: [], tarefaDono: [], decisao: [], esperaOutraCarta: [], esperaIntegracao: ramosNaoIntegrados.slice(0, MAX_LISTA) };
  for (const c of abertas) {
    if (c.filhos?.length) continue;
    const nomes = (c.labels ?? []).map(l => (typeof l === 'string' ? l : l.name));
    const regra = DESTRAVA.find(([etiqueta]) => nomes.includes(etiqueta));
    const lista = categorias[regra ? regra[1] : 'esperaPuxar'];
    if (lista.length < MAX_LISTA) lista.push(`${sigla}-${c.sequence_id}`);
  }
  const feita = abertas.length === 0;
  const soDono = !feita && !categorias.esperaPuxar.length && !categorias.esperaIntegracao.length
    && (categorias.decisao.length + categorias.tarefaDono.length) > 0;
  return { feita, abertas: abertas.length, emAndamento, categorias, soDono };
}
