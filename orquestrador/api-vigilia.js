// Ligar/desligar a vigília de um projeto: a confirmação que antes era por carta passa a ser
// por projeto, com a mesma fronteira (origem, sessão do Cadastro Único, duas ações).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ErroAcesso } from './sso.js';
import { pendentes } from './confirmacoes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarConfirmacoesVigilia({ vigilia, agora = () => Date.now() }) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id); };
  return {
    async preparar({ projeto, ligar }, identidade) {
      limpar();
      if (pendentes(desafios) >= 100) throw new ErroAcesso('muitas confirmações pendentes', 429);
      if (!UUID.test(projeto ?? '') || typeof ligar !== 'boolean') throw new ErroAcesso('projeto ou ação inválidos', 422);
      let validacao;
      try { validacao = await vigilia.validarAlternancia(projeto, ligar); }
      catch (erro) { throw new ErroAcesso(erro.message, 422); }
      const id = randomUUID();
      const expiraEm = agora() + 120_000;
      desafios.set(id, { estado: 'pendente', expiraEm, identidade, projeto, ligar });
      return { confirmacaoId: id, expiraEm: new Date(expiraEm).toISOString(), ...validacao };
    },
    async confirmar(id, identidade) {
      if (!UUID.test(id ?? '')) throw new ErroAcesso('confirmação inválida', 422);
      const d = desafios.get(id);
      if (!d) throw new ErroAcesso('confirmação ausente ou expirada', 404);
      const a = Buffer.from(identidade.sessaoHash ?? '', 'hex');
      const b = Buffer.from(d.identidade.sessaoHash ?? '', 'hex');
      if (identidade.usuarioId !== d.identidade.usuarioId || a.length !== 32 || b.length !== 32 || !timingSafeEqual(a, b)) {
        throw new ErroAcesso('confirmação pertence a outra sessão', 403);
      }
      if (d.estado === 'concluida') return d.resultado;
      if (d.estado !== 'pendente') throw new ErroAcesso('confirmação já usada ou resultado incerto', 409);
      if (d.expiraEm <= agora()) { desafios.delete(id); throw new ErroAcesso('confirmação expirada', 410); }
      d.estado = 'executando';
      try {
        d.resultado = await vigilia.alternar(d.projeto, d.ligar, identidade.usuarioId);
        d.estado = 'concluida';
        d.reterAte = agora() + 86_400_000;
        return d.resultado;
      } catch (erro) {
        if (erro.semEscrita) { desafios.delete(id); throw new ErroAcesso(`recusado; nada foi gravado: ${erro.message}`, 422); }
        d.estado = 'incerta';
        d.reterAte = agora() + 86_400_000;
        throw erro;
      }
    },
  };
}

export function criarApiVigilia({ autorizar, confirmacoes }) {
  return async (req, pathname, lerCorpo) => {
    if (req.method !== 'POST' || !['/api/orquestracao/vigilia/preparar', '/api/orquestracao/vigilia/confirmar'].includes(pathname)) {
      return { status: 405, corpo: { erro: 'operação indisponível' } };
    }
    let identidade;
    try { identidade = await autorizar(req); }
    catch (erro) { return { status: erro instanceof ErroAcesso ? erro.status : 502,
      corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível' } }; }
    let corpo;
    try { corpo = JSON.parse(await lerCorpo(req)); if (!corpo || Array.isArray(corpo) || typeof corpo !== 'object') throw Error(); }
    catch { return { status: 400, corpo: { erro: 'corpo JSON inválido' } }; }
    try {
      if (pathname.endsWith('/preparar')) {
        if (Object.keys(corpo).sort().join(',') !== 'ligar,projeto') throw new ErroAcesso('campos de preparação inválidos', 422);
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      if (Object.keys(corpo).join(',') !== 'confirmacaoId') throw new ErroAcesso('confirmação aceita somente o identificador', 422);
      return { status: 200, corpo: await confirmacoes.confirmar(corpo.confirmacaoId, identidade) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      return { status: pathname.endsWith('/confirmar') ? 409 : 422,
        corpo: { erro: pathname.endsWith('/confirmar') ? 'resultado incerto; confira o estado da vigília antes de repetir' : 'vigília recusada; confira contrato, executor e identidade' } };
    }
  };
}
