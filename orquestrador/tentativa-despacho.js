// Tentativa real: lease, handoff e executor. A checagem mora em checagem-despacho.js.
//
// A frota é congelada na reserva (J3): a segunda checagem, o executor e os dois HANDOFF
// usam a mesma versão e as mesmas tuplas, mesmo que o dono troque a frota no meio.
// A reserva relê a frota sob a trava global (J-A): troca antes dela recusa sem lease;
// troca depois roda a congelada. `conferirSobTrava` e `aposReservar` são da vigília:
// pausas conferidas sob a trava e a mudança de estado no Plane só depois do lease.

import { randomUUID } from 'node:crypto';
import { recusa } from './contrato-local.js';

export class TentativaDespacho {
  constructor(servico, checagem) {
    this.s = servico;
    this.checagem = checagem;
  }

  async iniciar({ cartaId, comandoId, versaoCarta, frotaVersao, frotaHash, chaveIdempotencia, usuarioId, conferirSobTrava = null, aposReservar = null }) {
    if (!this.s.execucaoHabilitada || !this.s.executor || ![...this.s.identidades.keys()].some(id => this.s.podeDespachar(id))) {
      throw new Error('portão de execução desligado');
    }
    const contexto = { comandoId, versaoCarta, frotaVersao, frotaHash, usuarioId };
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
    if (primeiro.frota.versao !== frotaVersao || primeiro.frota.hash !== frotaHash) throw recusa('frota mudou; recarregue antes de despachar');
    const congelada = primeiro.frota;
    const origemModelos = { fonte: 'frota', versao: congelada.versao, hash: congelada.hash,
      tuplas: Object.fromEntries(Object.entries(congelada.tuplas).map(([p, t]) => [p, { ...t }])) };
    const conferir = async () => {
      const agora = await this.s.lerFrota();
      if (agora.estado !== 'ok' || agora.versao !== congelada.versao || agora.hash !== congelada.hash) {
        throw recusa('frota mudou antes da reserva; nada foi reservado, recarregue antes de despachar');
      }
      if (conferirSobTrava) await conferirSobTrava(congelada);
    };
    const reserva = await this.s.estado.reservar({ cartaId, agente: primeiro.plano.papeis.codificacao_testes.agenteId,
      chaveIdempotencia, modoReal: true, contexto, frota: origemModelos, conferir });
    if (reserva.duplicada) return { carta: primeiro.carta, duplicada: true,
      tentativaId: reserva.tentativa.tentativaId, observacao: 'tentativa já registrada; não reexecutada' };
    const tentativaId = reserva.lease.tentativaId;
    let lancada = false;
    let batimento;
    let falhaBatimento = false;
    try {
      let versaoAtual = versaoCarta;
      if (aposReservar) versaoAtual = (await aposReservar({ tentativaId }))?.versaoCarta ?? versaoCarta;
      const segunda = await this.checagem.validar(cartaId, comandoId, versaoAtual, cartaId, congelada);
      if (JSON.stringify(segunda.plano) !== JSON.stringify(primeiro.plano)) throw new Error('plano mudou após a reserva');
      await this.s.registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId, resultado: 'em_andamento',
        resumo: `Despacho confirmado pelo usuário ${usuarioId} para ${primeiro.carta}.`,
        evidencia: [`Comando ${comandoId} do contrato`, `Frota v${congelada.versao} congelada na reserva, sem fallback`], origemModelos },
      versaoAtual, `${chaveIdempotencia.slice(0, 24)}${tentativaId.slice(24)}`);
      await this.s.estado.registrarEvento({ tipo: 'EXECUCAO_PREPARADA', cartaId, tentativaId, comandoId, frotaVersao: congelada.versao, usuarioId });
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
      const causa = resultado.resultado === 'impedido' ? (resultado.causa ?? { tipo: 'infra', provedor: null }) : null;
      await this.s.estado.registrarEvento({ tipo: 'RESULTADO_EXECUTOR', cartaId, tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia, causa, frotaVersao: congelada.versao });
      const cartaAtual = await this.s.cliente()(`/projects/${segunda.projetoId}/work-items/${cartaId}/`);
      await this.s.registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia, origemModelos },
      cartaAtual.updated_at, randomUUID());
      await this.s.estado.concluir({ cartaId, tentativaId, resultado: resultado.resultado });
      return { carta: primeiro.carta, tentativaId, resultado: resultado.resultado, causa, frotaVersao: congelada.versao, duplicada: false };
    } catch (erro) {
      if (!lancada) {
        await this.s.estado.concluir({ cartaId, tentativaId, resultado: 'SEM_INICIO' });
        // Sem início (ex.: o PATCH de estado no Plane falhou): quem chama anota e não conta tentativa (N3).
        erro.semInicio = { tentativaId };
      }
      else await this.s.estado.registrarEvento({ tipo: 'EXECUCAO_INCONCLUSA', cartaId, tentativaId,
        motivo: 'executor ou handoff de resultado não confirmado; revisar lease e o evento RESULTADO_EXECUTOR, se houver' });
      throw erro;
    } finally { if (batimento) clearInterval(batimento); }
  }
}
