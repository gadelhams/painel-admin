// Tentativa real: lease, handoff e executor. A checagem mora em checagem-despacho.js.

import { randomUUID } from 'node:crypto';
import { recusa } from './contrato-local.js';

export class TentativaDespacho {
  constructor(servico, checagem) {
    this.s = servico;
    this.checagem = checagem;
  }

  async iniciar({ cartaId, comandoId, versaoCarta, perfilComentarioId, chaveIdempotencia, usuarioId }) {
    if (!this.s.execucaoHabilitada || !this.s.executor || ![...this.s.identidades.keys()].some(id => this.s.podeDespachar(id))) {
      throw new Error('portão de execução desligado');
    }
    const contexto = { comandoId, versaoCarta, perfilComentarioId, usuarioId };
    const anterior = await this.s.estado.consultarTentativa(cartaId, chaveIdempotencia);
    if (anterior) {
      if (anterior.modoReal !== true || JSON.stringify(anterior.contexto) !== JSON.stringify(contexto)) {
        throw new Error('chave de idempotência reutilizada com outra execução');
      }
      return { cartaId, duplicada: true, tentativaId: anterior.tentativaId,
        observacao: 'tentativa já registrada; não reexecutada. Confira lease, touchpoints e card.' };
    }
    await this.s.estado.reconciliar(cartaId);
    const primeiro = await this.checagem.validar(cartaId, comandoId, versaoCarta).catch(e => { throw recusa(e.message); });
    if (primeiro.perfilComentarioId !== perfilComentarioId) throw recusa('perfil mudou; recarregue antes de despachar');
    const reserva = await this.s.estado.reservar({ cartaId, agente: primeiro.plano.papeis.codificacao_testes.agenteId,
      chaveIdempotencia, modoReal: true, contexto });
    if (reserva.duplicada) return { carta: primeiro.carta, duplicada: true,
      tentativaId: reserva.tentativa.tentativaId, observacao: 'tentativa já registrada; não reexecutada' };
    const tentativaId = reserva.lease.tentativaId;
    let lancada = false;
    let batimento;
    let falhaBatimento = false;
    try {
      const segunda = await this.checagem.validar(cartaId, comandoId, versaoCarta, cartaId);
      if (segunda.perfilComentarioId !== perfilComentarioId || JSON.stringify(segunda.plano) !== JSON.stringify(primeiro.plano)) {
        throw new Error('perfil mudou após a reserva');
      }
      await this.s.registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId, resultado: 'em_andamento',
        resumo: `Despacho confirmado pelo usuário ${usuarioId} para ${primeiro.carta}.`,
        evidencia: [`Comando ${comandoId} do contrato`, `Perfil ${perfilComentarioId} sem fallback`] },
      versaoCarta, `${chaveIdempotencia.slice(0, 24)}${tentativaId.slice(24)}`);
      await this.s.estado.registrarEvento({ tipo: 'EXECUCAO_PREPARADA', cartaId, tentativaId, comandoId, perfilComentarioId, usuarioId });
      batimento = setInterval(() => { this.s.estado.renovar({ cartaId, tentativaId })
        .then(() => { falhaBatimento = false; })
        .catch(() => {
          falhaBatimento = true;
          this.s.estado.registrarEvento({ tipo: 'LEASE_RENOVACAO_FALHOU', cartaId, tentativaId }).catch(() => {});
        }); }, 5 * 60_000);
      batimento.unref?.();
      lancada = true;
      const resultado = await this.s.executor.executar({ ...segunda, tentativaId });
      if (falhaBatimento) throw new Error('renovação de lease falhou; resultado exige revisão');
      if (!resultado || !['concluido', 'impedido', 'rejeitado'].includes(resultado.resultado) ||
          typeof resultado.resumo !== 'string' || !Array.isArray(resultado.evidencia)) {
        throw new Error('executor não devolveu resultado verificável');
      }
      await this.s.estado.registrarEvento({ tipo: 'RESULTADO_EXECUTOR', cartaId, tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia });
      const cartaAtual = await this.s.cliente()(`/projects/${segunda.projetoId}/work-items/${cartaId}/`);
      await this.s.registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia },
      cartaAtual.updated_at, randomUUID());
      await this.s.estado.concluir({ cartaId, tentativaId, resultado: resultado.resultado });
      return { carta: primeiro.carta, tentativaId, resultado: resultado.resultado, duplicada: false };
    } catch (erro) {
      if (!lancada) await this.s.estado.concluir({ cartaId, tentativaId, resultado: 'SEM_INICIO' });
      else await this.s.estado.registrarEvento({ tipo: 'EXECUCAO_INCONCLUSA', cartaId, tentativaId,
        motivo: 'executor ou handoff de resultado não confirmado; revisar lease e o evento RESULTADO_EXECUTOR, se houver' });
      throw erro;
    } finally { if (batimento) clearInterval(batimento); }
  }
}
