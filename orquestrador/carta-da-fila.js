// Julga uma carta já carregada: lease, proveniência do gate e a pré-checagem pedida.

import { avaliarCarta, avaliarProntidaoGate, avisosDoContrato } from './politica.js';
import { perfilAntigoDoCanal } from './consulta-perfil.js';
import { lerCanalPlane } from './canal-plane.js';
import { lerGatesDoCanal } from './gate-plane.js';
import { conferirInstanciaDoGate } from './recibo-gate.js';
import { dependenciasDaCarta } from './dependencias-carta.js';

const WEB = 'https://plane.vpn.astargne.com/astargne/browse';

export class CartaDaFila {
  constructor(servico) { this.s = servico; }

  async montar(c, { contratos, porId, consulta, preavaliarId, preavaliarGate, ignorarLeaseId, preavaliarSemGate, tuplasFrota = null, estadoFrota = null }) {
    const labels = (c.labels ?? []).map(l => l.name);
    const temGate = labels.includes('READY TO DEV') || labels.includes('READY TO TEST');
    let relacoes = {};
    if (temGate || c.id === preavaliarId) {
      try { relacoes = await consulta(`/projects/${c.projetoId}/work-items/${c.id}/relations/`); }
      catch { relacoes = null; }
    }
    const dependencias = (temGate || c.id === preavaliarId) ? dependenciasDaCarta(c, relacoes, porId) : [];
    const { contrato, erros } = contratos.get(c.projetoId) ?? { contrato: null, erros: [] };
    let lease;
    let historico;
    let erroEstado = null;
    try { [lease, historico] = await Promise.all([this.s.estado.lerLease(c.id), this.s.estado.lerHistorico(c.id)]); }
    catch { lease = null; historico = []; erroEstado = 'lease ou touchpoints'; }
    const avaliacao = avaliarCarta(c, { contrato, errosContrato: erros, dependencias,
      lease: c.id === ignorarLeaseId ? null : lease, historico, erroEstado, agora: this.s.agora(), tuplasFrota, estadoFrota });
    // Item 9 (J67): carta reservada por uma sessão viva fica fora do despacho; ilegível = ocupada.
    let reserva = null;
    if (temGate && this.s.cartaReservada) {
      reserva = await this.s.cartaReservada(c.id).catch(() => ({ motivo: 'reservas ilegíveis' }));
      if (reserva) { avaliacao.motivos.push(`carta reservada por outra sessão: ${reserva.motivo}`); avaliacao.elegivel = false; }
    }
    let provenienciaGate = null;
    let origemGate = null;
    let perfilAntigo = { estado: 'nao-lido' };
    if (avaliacao.gate) {
      const autorId = this.s.identidade(c.projetoId)?.autorEscrita;
      if (!autorId) {
        const desligada = this.s.situacaoIdentidade?.(c.projetoId);
        provenienciaGate = desligada?.motivo ? `identidade de escrita desligada: ${desligada.motivo}` : 'identidade de escrita não configurada';
        perfilAntigo = { estado: 'indisponivel', motivo: 'identidade técnica não configurada' };
      } else {
        try {
          const canal = await lerCanalPlane({ consultar: consulta, projetoId: c.projetoId, cartaId: c.id });
          const { gates, ignorados } = lerGatesDoCanal(canal.interacoes, { projetoId: c.projetoId, cartaId: c.id, autorId });
          const recibos = gates.filter(g => g.gate === avaliacao.gate);
          const nota = ignorados.length ? ` (${ignorados.length} recibo(s) ignorado(s): ${[...new Set(ignorados.map(x => x.motivo))].join(', ')})` : '';
          if (!recibos.length) provenienciaGate = `evidência GATE/v1 ausente ou sem autoria autorizada${nota}`;
          else {
            // J55: o recibo vale para a etiqueta que está na carta agora, não para uma recolocada depois.
            const instancia = await conferirInstanciaDoGate({ consultar: consulta, carta: c, gate: avaliacao.gate, recibos, autores: [autorId] });
            provenienciaGate = instancia.ok ? 'verificada' : `recibo GATE/v1 não amarrado à etiqueta atual: ${instancia.motivo}`;
            if (instancia.ok) origemGate = instancia.recibo.origemGate;
          }
          // Só exibição (J2): o PERFIL-IA/v1 não vincula nada e nunca derruba a carta.
          perfilAntigo = perfilAntigoDoCanal(canal.interacoes, { projetoId: c.projetoId, cartaId: c.id, autorId });
        } catch {
          provenienciaGate = 'evidência GATE/v1 indisponível ou ilegível';
          perfilAntigo = { estado: 'indisponivel', motivo: 'comentários do card não lidos' };
        }
      }
      if (provenienciaGate !== 'verificada') {
        avaliacao.motivos.push(`gate sem proveniência verificável: ${provenienciaGate}`);
        avaliacao.elegivel = false;
      }
    }
    const preavaliacao = c.id === preavaliarId ? avaliarCarta({
      ...c,
      labels: [...(c.labels ?? []).filter(l => !['READY TO DEV', 'READY TO TEST'].includes(l.name)), { name: preavaliarGate }],
    }, { contrato, errosContrato: erros, dependencias, lease, historico, erroEstado, agora: this.s.agora(), tuplasFrota, estadoFrota }) : null;
    const preavaliacaoGate = c.id === preavaliarId ? avaliarProntidaoGate(preavaliarSemGate
      ? { ...c, labels: (c.labels ?? []).filter(l => l.name !== preavaliarSemGate) } : c,
      { gate: preavaliarGate, dependencias, lease: c.id === ignorarLeaseId ? null : lease, erroEstado }) : null;
    return {
      id: c.id, identificador: `${c.sigla}-${c.sequence_id}`, titulo: c.name,
      projeto: c.projetoNome, projetoId: c.projetoId, estado: c.state?.name ?? '?', estadoGrupo: c.state?.group ?? null, url: `${WEB}/${c.sigla}-${c.sequence_id}/`,
      atualizadoEm: c.updated_at, labels, dependencias, provenienciaGate, origemGate, reservadaPor: reserva?.reserva?.quem ?? (reserva ? '?' : null), perfilAntigo,
      avisosContrato: contrato && !erros.length ? avisosDoContrato(contrato) : [], ...avaliacao,
      comandos: avaliacao.elegivel ? contrato.comandos.map(x => x.id) : [],
      ...(preavaliacao ? { preavaliacao: { gate: preavaliarGate, pendencias: preavaliacao.motivos, tecnicamentePronta: preavaliacao.elegivel } } : {}),
      ...(preavaliacaoGate ? { preavaliacaoGate } : {}),
    };
  }
}
