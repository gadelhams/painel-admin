import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ErroAcesso } from './sso.js';
import { pendentes } from './confirmacoes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarConfirmacoesDespacho({ servico, agora = () => Date.now() }) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id); };
  return {
    async preparar({ carta, comando, versaoCarta }, identidade) {
      limpar();
      if (pendentes(desafios) >= 100) throw new ErroAcesso('muitas confirmações pendentes', 429);
      if (!UUID.test(carta ?? '') || !/^[a-z][a-z0-9-]*$/.test(comando ?? '') ||
          !Number.isFinite(Date.parse(versaoCarta))) throw new ErroAcesso('carta, comando ou versão inválidos', 422);
      const validacao = await servico.validarDespacho(carta, comando, versaoCarta);
      const id = randomUUID();
      const expiraEm = agora() + 120_000;
      desafios.set(id, { estado: 'pendente', expiraEm, identidade, carta, comando,
        versaoCarta, perfilComentarioId: validacao.perfilComentarioId, chaveIdempotencia: randomUUID() });
      return { confirmacaoId: id, expiraEm: new Date(expiraEm).toISOString(),
        carta: validacao.carta, comando, plano: validacao.plano,
        perfilComentarioId: validacao.perfilComentarioId,
        aviso: 'Confirmar iniciará uma tentativa real somente se todos os portões ainda passarem. Não há fallback de modelo.' };
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
        d.resultado = await servico.iniciarDespacho({ cartaId: d.carta, comandoId: d.comando,
          versaoCarta: d.versaoCarta, perfilComentarioId: d.perfilComentarioId,
          chaveIdempotencia: d.chaveIdempotencia, usuarioId: identidade.usuarioId });
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

export function criarApiDespacho({ autorizar, confirmacoes }) {
  return async (req, pathname, lerCorpo) => {
    if (req.method !== 'POST' || !['/api/orquestracao/despacho/preparar', '/api/orquestracao/despacho/confirmar'].includes(pathname)) {
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
        if (Object.keys(corpo).sort().join(',') !== 'carta,comando,versaoCarta') throw new ErroAcesso('campos de preparação inválidos', 422);
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      if (Object.keys(corpo).join(',') !== 'confirmacaoId') throw new ErroAcesso('confirmação aceita somente o identificador', 422);
      return { status: 200, corpo: await confirmacoes.confirmar(corpo.confirmacaoId, identidade) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      return { status: pathname.endsWith('/confirmar') ? 409 : 422,
        corpo: { erro: pathname.endsWith('/confirmar')
          ? 'resultado incerto; confira tentativa, lease e card antes de qualquer repetição'
          : 'despacho impedido; confira gate, dependências, contrato, modelo e disponibilidade' } };
    }
  };
}
