// Pode marcar este gate. Não autoriza despacho.

import { BLOQUEIOS, DECISAO_HUMANA_NA_DESCRICAO, GATES, MarcasCarta } from './marcas-carta.js';

export class ProntidaoGate {
  avaliar(carta, { gate, dependencias = [], lease = null, erroEstado = null } = {}) {
    const motivos = [];
    const nomes = MarcasCarta.nomes(carta);
    const grupos = carta.state?.group ?? carta.state?.type;
    if (!GATES.includes(gate)) motivos.push('gate inválido');
    if (carta.filhos?.length) motivos.push('não é folha executável');
    if (carta.is_draft) motivos.push('rascunho');
    if (gate === 'READY TO DEV' && !['unstarted', 'started'].includes(grupos)) motivos.push('estado inadequado para desenvolvimento');
    if (gate === 'READY TO TEST' && grupos !== 'started') motivos.push('estado inadequado para teste');
    const gatesAtuais = GATES.filter(g => nomes.includes(g));
    if (gatesAtuais.length > 1) motivos.push('dois gates de prontidão');
    if (gatesAtuais.length === 1 && gatesAtuais[0] !== gate) motivos.push('troca de gate exige decisão humana registrada');
    for (const marca of BLOQUEIOS) if (nomes.includes(marca)) motivos.push(`marcador ${marca} exige decisão humana`);
    if (DECISAO_HUMANA_NA_DESCRICAO.test(carta.description_html ?? '')) motivos.push('decisão ou bloqueio humano descrito na carta');
    if (/bloquead|blocked|em espera|aguardando/i.test(carta.state?.name ?? '')) motivos.push('estado bloqueado');
    for (const d of dependencias) if (d.estado !== 'concluida') motivos.push(`dependência ${d.id ?? '?'}: ${d.motivo ?? d.estado}`);
    if (lease) motivos.push('tentativa ou lease existente exige revisão antes de alterar gate');
    if (erroEstado) motivos.push(`estado operacional ilegível: ${erroEstado}`);
    return { pronta: motivos.length === 0, motivos, gate, gatesAtuais };
  }
}
