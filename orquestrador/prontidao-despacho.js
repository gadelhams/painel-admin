// Pode despachar esta carta. Marcar gate continua em prontidao-gate.js.

import { BLOQUEIOS, DECISAO_HUMANA_NA_DESCRICAO, GATES, MarcasCarta } from './marcas-carta.js';
import { incompatibilidadesFrota } from './modelos.js';

export class ProntidaoDespacho {
  // `agora` é um instante (número), não a função: com `Date.now` sem parênteses toda comparação
  // de prazo dava falso e um lease ativo aparecia como 'revisão' sem motivo (achado de 24/10/2026).
  avaliar(carta, { contrato, errosContrato = [], dependencias = [], lease = null, historico = [], erroEstado = null, agora = Date.now(), tuplasFrota = null, estadoFrota = null } = {}) {
    const motivos = [];
    const nomes = MarcasCarta.nomes(carta);
    const descricao = carta.description_html ?? '';
    const gates = GATES.filter(g => nomes.includes(g));
    if (carta.filhos?.length) motivos.push('não é folha executável');
    if (carta.is_draft) motivos.push('rascunho');
    if (gates.length !== 1) motivos.push(gates.length ? 'dois gates de prontidão' : 'sem gate de prontidão');
    const grupo = carta.state?.group ?? carta.state?.type;
    if (gates[0] === 'READY TO DEV' && !['unstarted', 'started'].includes(grupo)) motivos.push('estado inadequado para desenvolvimento');
    if (gates[0] === 'READY TO TEST' && grupo !== 'started') motivos.push('estado inadequado para teste');
    if (gates.length === 0 && !['unstarted', 'started'].includes(grupo)) motivos.push('estado não executável');
    for (const marca of BLOQUEIOS) if (nomes.includes(marca)) motivos.push(`marcador ${marca} exige decisão humana`);
    if (DECISAO_HUMANA_NA_DESCRICAO.test(descricao) && !nomes.some(x => x === 'ASTARGNE' || x === 'BLOQUEADA')) motivos.push('decisão ou bloqueio humano descrito na carta');
    if (/bloquead|blocked|em espera|aguardando/i.test(carta.state?.name ?? '')) motivos.push('estado bloqueado');
    if (!contrato) motivos.push('contrato local ausente');
    else motivos.push(...errosContrato.map(x => `contrato: ${x}`));
    for (const d of dependencias) if (d.estado !== 'concluida') motivos.push(`dependência ${d.id ?? '?'}: ${d.motivo ?? d.estado}`);
    if (lease && Date.parse(lease.expiraEm) > agora) motivos.push(`lease ativo de ${lease.agente ?? 'outro agente'}`);
    if (lease?.modoReal === true && Date.parse(lease.expiraEm) <= agora) motivos.push('execução inconclusa; lease vencido exige revisão humana');
    if (lease && !Number.isFinite(Date.parse(lease.expiraEm))) motivos.push('lease ilegível');
    if (erroEstado) motivos.push(`estado operacional ilegível: ${erroEstado}`);
    const agentesDisponiveis = contrato && !errosContrato.length && Array.isArray(contrato.agentes)
      ? contrato.agentes.filter(a => a.disponivel) : [];
    const agente = agentesDisponiveis[0] ?? null;
    if (!agente) motivos.push('nenhum agente elegível');
    else motivos.push(...incompatibilidadesFrota(contrato, tuplasFrota));
    // Sem frota válida nada despacha (N6): a fila diz isso em vez de "elegível".
    if (estadoFrota && estadoFrota !== 'ok') motivos.push(`frota ${estadoFrota}: nada despacha sem frota válida`);
    const tentativa = [...historico].reverse().find(x => x.tipo === 'TENTATIVA' || x.tipo === 'RESULTADO') ?? null;
    const leaseSituacao = !lease ? 'livre' : !Number.isFinite(Date.parse(lease.expiraEm)) ? 'ilegível' : Date.parse(lease.expiraEm) > agora ? 'ativo' : lease.modoReal === true ? 'revisão' : 'expirado';
    // Do contrato só sai o interruptor (id e provedor); modelo e esforço são da frota.
    return { elegivel: motivos.length === 0, motivos, gate: gates.length === 1 ? gates[0] : null,
      agente: agente ? { id: agente.id, provedor: agente.provedor } : null, agentesDisponiveis: agentesDisponiveis.map(a => ({ id: a.id, provedor: a.provedor })),
      tentativa, lease, leaseSituacao, historico };
  }
}
