// Fronteira HTTP de /api/chaves/preparar e /api/chaves/confirmar. A sessão vem antes do corpo.

import { ErroAcesso } from '../orquestrador/sso.js';

export function criarApiChaves({ autorizar, confirmacoes }) {
  return async (req, pathname, lerCorpo) => {
    if (req.method !== 'POST' || !['/api/chaves/preparar', '/api/chaves/confirmar'].includes(pathname)) return { status: 405, corpo: { erro: 'operação indisponível' } };
    let identidade;
    try { identidade = await autorizar(req); }
    catch (erro) { return { status: erro instanceof ErroAcesso ? erro.status : 502, corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível' } }; }
    let corpo;
    try { corpo = JSON.parse(await lerCorpo(req)); if (!corpo || Array.isArray(corpo) || typeof corpo !== 'object') throw Error(); }
    catch { return { status: 400, corpo: { erro: 'corpo JSON inválido' } }; }
    try {
      if (pathname.endsWith('/preparar')) {
        if (Object.keys(corpo).sort().join(',') !== 'alvo,nome,projeto') throw new ErroAcesso('campos de preparação inválidos', 422);
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      const campos = Object.keys(corpo).sort().join(',');
      if (campos !== 'confirmacaoId' && campos !== 'confirmacaoId,valor') throw new ErroAcesso('confirmação aceita só o identificador e o valor', 422);
      if (!/^[0-9a-f-]{36}$/i.test(corpo.confirmacaoId ?? '')) throw new ErroAcesso('confirmação inválida', 422);
      return { status: 200, corpo: await confirmacoes.confirmar(corpo.confirmacaoId, corpo.valor, identidade) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      return { status: 409, corpo: { erro: 'resultado incerto; confira o arquivo e o serviço antes de repetir' } };
    }
  };
}
