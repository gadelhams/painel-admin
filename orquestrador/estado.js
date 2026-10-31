// Recupera lease e diário depois de uma queda; uma tentativa por vez no Hangar inteiro (J51). Cada formato mora no módulo ao lado.

import { randomUUID } from 'node:crypto';
import { TravaDisco } from './trava.js';
import { ArquivoLease } from './arquivo-lease.js';
import { DiarioTouchpoints } from './diario-touchpoints.js';

// Grupo de processos ainda vivo? EPERM = existe, de outro dono: vivo para efeito da trava.
export function grupoVivo(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 1) return false;
  try { process.kill(-pgid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

// Recusa sem reserva: nada foi gravado (a vigília anota o motivo e segue; a API devolve 422).
const ocupado = mensagem => Object.assign(new Error(mensagem), { semReserva: true, semEscrita: true });

// `cartaReservada(cartaId)` (porta reservas.js, PAINEL-54 item 9): reserva viva de uma sessão
// interativa na carta; consultada sob a trava, junto com os leases da frota.
export function criarEstadoOrquestracao({ diretorio, agora = () => Date.now(), duracaoLeaseMs = 15 * 60_000,
  vivo = grupoVivo, cartaReservada = null } = {}) {
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

  // J51: "uma por vez" mora no disco, não na memória da vigília. Sob a trava, todo outro lease
  // é reconciliado: ativo ocupa; em revisão ocupa enquanto o grupo de processos gravado nele
  // (o filho `detached` que sobrevive a uma queda do painel) estiver vivo; ilegível ocupa.
  async function outraEmCurso(cartaId) {
    const propria = leases.nome(cartaId);
    for (const id of await leases.ids()) {
      if (id.toLowerCase() === propria) continue;
      let r;
      try { r = await reconciliarSobTrava(id); }
      catch { return `lease ilegível em ${id}; uma tentativa pode estar em curso`; }
      if (r.situacao === 'ativo') return `tentativa em curso em ${r.lease.carta ?? id}`;
      if (r.situacao === 'revisao' && vivo(r.lease.pgid)) return `tentativa em curso em ${r.lease.carta ?? id} (processo ${r.lease.pgid} vivo, lease em revisão)`;
    }
    return null;
  }

  // `conferir` roda sob a trava, antes de gravar o lease: é ali que a tentativa relê a
  // frota (e a vigília, as pausas) para nada mudar entre a checagem e a reserva (J-A).
  async function reservar({ cartaId, carta = null, agente, chaveIdempotencia, modoReal = false, contexto = null, frota = null, conferir = null }) {
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
      const emCurso = await outraEmCurso(cartaId);
      if (emCurso) throw ocupado(emCurso);
      const reserva = cartaReservada ? await cartaReservada(cartaId).catch(() => ({ motivo: 'reservas ilegíveis' })) : null;
      if (reserva) throw ocupado(`carta reservada por outra sessão: ${reserva.motivo}`);
      if (conferir) await conferir();
      const tentativaId = randomUUID();
      // A frota congelada (J3) viaja no lease e no TENTATIVA: trocar a frota depois não muda esta tentativa.
      const lease = { cartaId, ...(carta ? { carta } : {}), tentativaId, agente, chaveIdempotencia, modoReal, ...(frota ? { frota } : {}),
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

  // O grupo do processo filho que roda agora (ProcessoCli `detached`: pgid = pid). Gravado no
  // lease para a reserva seguinte saber se uma tentativa em revisão ainda tem processo vivo.
  async function marcarProcesso({ cartaId, tentativaId, pgid }) {
    if (!Number.isInteger(pgid) || pgid <= 1) throw new Error('grupo de processo inválido');
    return comTrava(async () => {
      const lease = await leases.ler(cartaId);
      if (!lease || lease.tentativaId !== tentativaId) throw new Error('lease não pertence à tentativa ativa');
      lease.pgid = pgid;
      await leases.gravar(cartaId, lease, randomUUID());
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

  return { diretorio, lerLease: (id) => leases.ler(id), lerHistorico: (id) => diario.daCarta(id), consultarTentativa, reservar, renovar, concluir, marcarProcesso,
    reconciliar, recuperarInterrupcoes, comTrava, registrarEvento: (evento) => diario.anotar(evento) };
}
