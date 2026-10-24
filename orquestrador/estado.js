import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function nomeSeguro(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('id de carta inválido');
  return id.toLowerCase();
}

export function criarEstadoOrquestracao({ diretorio, agora = () => Date.now(), duracaoLeaseMs = 15 * 60_000 } = {}) {
  if (!diretorio) throw new Error('diretório de estado obrigatório');
  const trava = path.join(diretorio, '.trava');
  const log = path.join(diretorio, 'touchpoints.jsonl');
  const caminhoLease = id => path.join(diretorio, 'leases', `${nomeSeguro(id)}.json`);

  async function recuperarTravaExpirada() {
    let info;
    try { info = await fs.stat(trava); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (Date.now() - info.mtimeMs < 30_000) return;
    let dono;
    try { dono = JSON.parse(await fs.readFile(path.join(trava, 'dono.json'), 'utf8')); }
    catch { dono = null; }
    if (Number.isInteger(dono?.pid)) {
      try { process.kill(dono.pid, 0); return; }
      catch (e) { if (e.code !== 'ESRCH') return; }
    }
    // O processo antigo morreu; a troca de nome conserva evidência se o disco
    // falhar. A única operação sob esta trava é metadado local, nunca CLI.
    const orfa = `${trava}.orfa-${randomUUID()}`;
    try {
      await fs.rename(trava, orfa);
      await fs.rm(orfa, { recursive: true });
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  async function comTrava(acao) {
    await fs.mkdir(diretorio, { recursive: true });
    // Quem segura a trava pode estar escrevendo no Plane (segundos); quem espera só
    // desiste depois de 60 s, e antes disso recupera trava órfã de processo morto.
    const TENTATIVAS = 3000;
    for (let i = 0; i < TENTATIVAS; i++) {
      try {
        await fs.mkdir(trava);
        await fs.writeFile(path.join(trava, 'dono.json'), JSON.stringify({ pid: process.pid, quando: new Date().toISOString() }));
        break;
      }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        await recuperarTravaExpirada();
        if (i === TENTATIVAS - 1) throw new Error('trava da orquestração ocupada; intervenção necessária');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    try { return await acao(); }
    finally {
      await fs.unlink(path.join(trava, 'dono.json'));
      await fs.rmdir(trava);
    }
  }

  async function lerLease(id) {
    try { return JSON.parse(await fs.readFile(caminhoLease(id), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`lease de ${id} ilegível`); }
  }

  async function lerHistorico(id) {
    let texto;
    try { texto = await fs.readFile(log, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    try { return texto.split('\n').filter(Boolean).map(JSON.parse).filter(x => x.cartaId === id); }
    catch { throw new Error('touchpoints ilegíveis'); }
  }

  async function registrar(evento) {
    await fs.appendFile(log, `${JSON.stringify({ quando: new Date(agora()).toISOString(), ...evento })}\n`, 'utf8');
  }

  // Reconcilia o ponto em que um processo pode ter morrido entre gravar o
  // resultado e remover o lease (ou entre gravar o lease e o touchpoint).
  // Nunca toma um lease ainda válido de outro processo.
  async function reconciliarSobTrava(cartaId) {
    const lease = await lerLease(cartaId);
    if (!lease) return { situacao: 'livre' };
    const expiraEm = Date.parse(lease.expiraEm);
    if (!Number.isFinite(expiraEm) || !lease.tentativaId || !lease.chaveIdempotencia) throw new Error('lease ilegível');
    const historico = await lerHistorico(cartaId);
    const resultado = historico.find(x => x.tipo === 'RESULTADO' && x.tentativaId === lease.tentativaId);
    if (resultado) {
      if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'RESULTADO_CONFIRMADO')) {
        await registrar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'RESULTADO_CONFIRMADO' });
      }
      await fs.unlink(caminhoLease(cartaId));
      return { situacao: 'concluida', tentativaId: lease.tentativaId, resultado };
    }
    if (expiraEm > agora()) return { situacao: 'ativo', lease };
    // Lease vencido sem TENTATIVA só nasce de queda entre as duas gravações de
    // reservar(), antes de qualquer executor ser lançado: é órfão e expira como os
    // demais — mesmo em modoReal, que de outro modo o parquearia em revisão para sempre.
    if (!historico.some(x => x.tipo === 'TENTATIVA' && x.tentativaId === lease.tentativaId)) {
      await registrar({ tipo: 'TENTATIVA', cartaId, tentativaId: lease.tentativaId,
        agente: lease.agente, chaveIdempotencia: lease.chaveIdempotencia, resultado: 'RECUPERADA_SEM_TOUCHPOINT' });
      await registrar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'LEASE_EXPIRADO' });
      await fs.unlink(caminhoLease(cartaId));
      return { situacao: 'expirado', tentativaId: lease.tentativaId };
    }
    if (lease.modoReal === true) {
      // Um processo filho pode sobreviver ao servidor. TTL vencido não é
      // prova de morte nem licença para lançar a mesma tarefa outra vez.
      if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'EXECUCAO_INCONCLUSA')) {
        await registrar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId,
          resultado: 'EXECUCAO_INCONCLUSA' });
      }
      return { situacao: 'revisao', lease };
    }
    if (!historico.some(x => x.tipo === 'RECUPERACAO' && x.tentativaId === lease.tentativaId && x.resultado === 'LEASE_EXPIRADO')) {
      await registrar({ tipo: 'RECUPERACAO', cartaId, tentativaId: lease.tentativaId, resultado: 'LEASE_EXPIRADO' });
    }
    await fs.unlink(caminhoLease(cartaId));
    return { situacao: 'expirado', tentativaId: lease.tentativaId };
  }

  async function reconciliar(cartaId) {
    nomeSeguro(cartaId);
    return comTrava(() => reconciliarSobTrava(cartaId));
  }

  async function recuperarInterrupcoes() {
    let arquivos;
    try { arquivos = await fs.readdir(path.join(diretorio, 'leases')); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const ids = arquivos.filter(x => /^[0-9a-f-]{36}\.json$/i.test(x)).map(x => x.slice(0, -5));
    return Promise.all(ids.map(reconciliar));
  }

  async function consultarTentativa(cartaId, chaveIdempotencia) {
    nomeSeguro(cartaId);
    return comTrava(async () => (await lerHistorico(cartaId))
      .find(x => x.tipo === 'TENTATIVA' && x.chaveIdempotencia === chaveIdempotencia) ?? null);
  }

  async function reservar({ cartaId, agente, chaveIdempotencia, modoReal = false, contexto = null }) {
    nomeSeguro(cartaId);
    if (!agente || !chaveIdempotencia) throw new Error('agente e chave de idempotência obrigatórios');
    return comTrava(async () => {
      const reconciliacao = await reconciliarSobTrava(cartaId);
      const historico = await lerHistorico(cartaId);
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
      const tentativaId = randomUUID();
      const lease = { cartaId, tentativaId, agente, chaveIdempotencia, modoReal,
        adquiridoEm: new Date(agora()).toISOString(), expiraEm: new Date(agora() + duracaoLeaseMs).toISOString() };
      await fs.mkdir(path.dirname(caminhoLease(cartaId)), { recursive: true });
      const temporario = `${caminhoLease(cartaId)}.${tentativaId}.tmp`;
      await fs.writeFile(temporario, JSON.stringify(lease), { flag: 'wx' });
      await fs.rename(temporario, caminhoLease(cartaId));
      const tentativa = { tipo: 'TENTATIVA', cartaId, tentativaId, agente, chaveIdempotencia,
        modoReal, contexto, resultado: 'RESERVADA' };
      await registrar(tentativa);
      return { duplicada: false, lease, tentativa };
    });
  }

  async function renovar({ cartaId, tentativaId }) {
    return comTrava(async () => {
      const reconciliacao = await reconciliarSobTrava(cartaId);
      if (reconciliacao.situacao !== 'ativo') throw new Error('lease não pertence à tentativa ativa');
      const lease = await lerLease(cartaId);
      if (lease.tentativaId !== tentativaId) throw new Error('lease não pertence à tentativa ativa');
      lease.expiraEm = new Date(agora() + duracaoLeaseMs).toISOString();
      const temporario = `${caminhoLease(cartaId)}.${randomUUID()}.tmp`;
      await fs.writeFile(temporario, JSON.stringify(lease), { flag: 'wx' });
      await fs.rename(temporario, caminhoLease(cartaId));
      await registrar({ tipo: 'LEASE_RENOVADO', cartaId, tentativaId, expiraEm: lease.expiraEm });
      return lease;
    });
  }

  async function concluir({ cartaId, tentativaId, resultado }) {
    return comTrava(async () => {
      const historico = await lerHistorico(cartaId);
      const existente = historico.find(x => x.tipo === 'RESULTADO' && x.tentativaId === tentativaId);
      if (existente) {
        const pendente = await lerLease(cartaId);
        if (pendente?.tentativaId === tentativaId) await fs.unlink(caminhoLease(cartaId));
        return existente;
      }
      const lease = await lerLease(cartaId);
      if (!lease || lease.tentativaId !== tentativaId) throw new Error('tentativa não possui o lease');
      const evento = { tipo: 'RESULTADO', cartaId, tentativaId, resultado };
      await registrar(evento);
      await fs.unlink(caminhoLease(cartaId));
      return evento;
    });
  }

  return { lerLease, lerHistorico, consultarTentativa, reservar, renovar, concluir,
    reconciliar, recuperarInterrupcoes, comTrava, registrarEvento: registrar };
}
