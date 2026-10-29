// Julga uma carta já carregada: lease, proveniência do gate e a pré-checagem pedida.

import { avaliarCarta, avaliarProntidaoGate, avisosDoContrato } from './politica.js';
import { perfilAntigoDoCanal } from './consulta-perfil.js';
import { lerCanalPlane } from './canal-plane.js';
import { gatesDoCanal } from './gate-plane.js';
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
    let provenienciaGate = null;
    let perfilAntigo = { estado: 'nao-lido' };
    if (avaliacao.gate) {
      const autorId = this.s.identidade(c.projetoId)?.autorEscrita;
      if (!autorId) {
        provenienciaGate = 'identidade de escrita não configurada';
        perfilAntigo = { estado: 'indisponivel', motivo: 'identidade técnica não configurada' };
      } else {
        try {
          const canal = await lerCanalPlane({ consultar: consulta, projetoId: c.projetoId, cartaId: c.id });
          const comprovado = gatesDoCanal(canal.interacoes, { projetoId: c.projetoId, cartaId: c.id, autorId })
            .some(g => g.gate === avaliacao.gate);
          provenienciaGate = comprovado ? 'verificada' : 'evidência GATE/v1 ausente ou sem autoria autorizada';
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
      atualizadoEm: c.updated_at, labels, dependencias, provenienciaGate, perfilAntigo,
      avisosContrato: contrato && !erros.length ? avisosDoContrato(contrato) : [], ...avaliacao,
      comandos: avaliacao.elegivel ? contrato.comandos.map(x => x.id) : [],
      ...(preavaliacao ? { preavaliacao: { gate: preavaliarGate, pendencias: preavaliacao.motivos, tecnicamentePronta: preavaliacao.elegivel } } : {}),
      ...(preavaliacaoGate ? { preavaliacaoGate } : {}),
    };
  }
}
