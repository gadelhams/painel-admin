// Recupera lease e diário depois de uma queda. Cada formato mora no módulo ao lado.

import { randomUUID } from 'node:crypto';
import { TravaDisco } from './trava.js';
import { ArquivoLease } from './arquivo-lease.js';
import { DiarioTouchpoints } from './diario-touchpoints.js';

export function criarEstadoOrquestracao({ diretorio, agora = () => Date.now(), duracaoLeaseMs = 15 * 60_000 } = {}) {
  if (!diretorio) throw new Error('diretório de estado obrigatório');
  const trava = new TravaDisco(diretorio);
  const comTrava = (acao) => trava.segurar(acao);
  const leases = new ArquivoLease(diretorio);
  const diario = new DiarioTouchpoints({ diretorio, agora });

  async function reconciliarSobTrava(cartaId) {
    const lease = await leases.ler(cartaId);
    if (!lease) return { situacao: 'livre' };
    const expiraEm = Date.parse(lease.expiraEm);
    if (!Number.isFinite(expiraEm) || !lease.tentativaId || !lease.chaveIdempotencia) throw new Error('lease ilegível');
    const historico = await diario.daCarta(cartaId);
    const resultado = historico.find(x => x.tipo === 'RESULTADO' && x.tentativaId === lease.tentativaId);
    if (resultado) {
      if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'RESULTADO_CONFIRMADO')) {
        await diario.anotar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'RESULTADO_CONFIRMADO' });
      }
      await leases.apagar(cartaId);
      return { situacao: 'concluida', tentativaId: lease.tentativaId, resultado };
    }
    if (expiraEm > agora()) return { situacao: 'ativo', lease };
    if (!historico.some(x => x.tipo === 'TENTATIVA' && x.tentativaId === lease.tentativaId)) {
      await diario.anotar({ tipo: 'TENTATIVA', cartaId, tentativaId: lease.tentativaId,
        agente: lease.agente, chaveIdempotencia: lease.chaveIdempotencia, resultado: 'RECUPERADA_SEM_TOUCHPOINT' });
      await diario.anotar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'LEASE_EXPIRADO' });
      await leases.apagar(cartaId);
      return { situacao: 'expirado', tentativaId: lease.tentativaId };
    }
    if (lease.modoReal === true) {
      if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'EXECUCAO_INCONCLUSA')) {
        await diario.anotar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId,
          resultado: 'EXECUCAO_INCONCLUSA' });
      }
      return { situacao: 'revisao', lease };
    }
    if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'LEASE_EXPIRADO')) {
      await diario.anotar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'LEASE_EXPIRADO' });
    }
    await leases.apagar(cartaId);
    return { situacao: 'expirado', tentativaId: lease.tentativaId };
  }

  async function reconciliar(cartaId) {
    leases.nome(cartaId);
    return comTrava(() => reconciliarSobTrava(cartaId));
  }

  async function recuperarInterrupcoes() {
    return Promise.all((await leases.ids()).map(reconciliar));
  }

  async function consultarTentativa(cartaId, chaveIdempotencia) {
    leases.nome(cartaId);
    return comTrava(async () => (await diario.daCarta(cartaId))
      .find(x => x.tipo === 'TENTATIVA' && x.chaveIdempotencia === chaveIdempotencia) ?? null);
  }

  // `conferir` roda sob a trava, antes de gravar o lease: é ali que a tentativa relê a
  // frota (e a vigília, as pausas) para nada mudar entre a checagem e a reserva (J-A).
  async function reservar({ cartaId, agente, chaveIdempotencia, modoReal = false, contexto = null, frota = null, conferir = null }) {
    leases.nome(cartaId);
    if (!agente || !chaveIdempotencia) throw new Error('agente e chave de idempotência obrigatórios');
    return comTrava(async () => {
      const reconciliacao = await reconciliarSobTrava(cartaId);
      const historico = await diario.daCarta(cartaId);
      const repetida = historico.find(x => x.tipo === 'TENTATIVA' && x.chaveIdempotencia === chaveIdempotencia);
      if (repetida) {
        if (repetida.agente !== agente || (repetida.modoReal ?? false) !== modoReal ||
            JSON.stringify(repetida.contexto ?? null) !== JSON.stringify(contexto)) {
          throw new Error('chave de idempotência reutilizada com outra execução');
        }
        return { duplicada: true, tentativa: repetida };
      }
      if (reconciliacao.situacao === 'ativo') throw new Error('lease ativo');
      if (reconciliacao.situacao === 'revisao') throw new Error('execução inconclusa exige revisão humana antes de novo despacho');
      if (conferir) await conferir();
      const tentativaId = randomUUID();
      // A frota congelada (J3) viaja no lease e no TENTATIVA: trocar a frota depois não muda esta tentativa.
      const lease = { cartaId, tentativaId, agente, chaveIdempotencia, modoReal, ...(frota ? { frota } : {}),
        adquiridoEm: new Date(agora()).toISOString(), expiraEm: new Date(agora() + duracaoLeaseMs).toISOString() };
      await leases.gravar(cartaId, lease, tentativaId);
      const tentativa = { tipo: 'TENTATIVA', cartaId, tentativaId, agente, chaveIdempotencia,
        modoReal, contexto, ...(frota ? { frota } : {}), resultado: 'RESERVADA' };
      await diario.anotar(tentativa);
      return { duplicada: false, lease, tentativa };
    });
  }

  async function renovar({ cartaId, tentativaId }) {
    return comTrava(async () => {
      const reconciliacao = await reconciliarSobTrava(cartaId);
      if (reconciliacao.situacao !== 'ativo') throw new Error('lease não pertence à tentativa ativa');
      const lease = await leases.ler(cartaId);
      if (lease.tentativaId !== tentativaId) throw new Error('lease não pertence à tentativa ativa');
      lease.expiraEm = new Date(agora() + duracaoLeaseMs).toISOString();
      await leases.gravar(cartaId, lease, randomUUID());
      await diario.anotar({ tipo: 'LEASE_RENOVADO', cartaId, tentativaId, expiraEm: lease.expiraEm });
      return lease;
    });
  }

  async function concluir({ cartaId, tentativaId, resultado }) {
    return comTrava(async () => {
      const historico = await diario.daCarta(cartaId);
      const existente = historico.find(x => x.tipo === 'RESULTADO' && x.tentativaId === tentativaId);
      if (existente) {
        const pendente = await leases.ler(cartaId);
        if (pendente?.tentativaId === tentativaId) await leases.apagar(cartaId);
        return existente;
      }
      const lease = await leases.ler(cartaId);
      if (!lease || lease.tentativaId !== tentativaId) throw new Error('tentativa não possui o lease');
      const evento = { tipo: 'RESULTADO', cartaId, tentativaId, resultado };
      await diario.anotar(evento);
      await leases.apagar(cartaId);
      return evento;
    });
  }

  return { diretorio, lerLease: (id) => leases.ler(id), lerHistorico: (id) => diario.daCarta(id), consultarTentativa, reservar, renovar, concluir,
    reconciliar, recuperarInterrupcoes, comTrava, registrarEvento: (evento) => diario.anotar(evento) };
}
