import { ErroAcesso } from './sso.js';

// Tabela mínima: não há rota que aceite chave de idempotência, HTML ou ação
// de execução do browser. Autoriza de novo em cada requisição, inclusive a
// confirmação, e usa só o payload mantido pelo desafio no servidor.
export function criarApiPerfil({ autorizar, confirmacoes }) {
  return async function tratar(req, pathname, lerCorpo) {
    if (!['/api/orquestracao/modelos/preparar', '/api/orquestracao/modelos/confirmar'].includes(pathname) || req.method !== 'POST') {
      return { status: 405, corpo: { erro: 'operação indisponível' } };
    }
    let identidade;
    try { identidade = await autorizar(req); }
    catch (erro) {
      return { status: erro instanceof ErroAcesso ? erro.status : 502,
        corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível' } };
    }
    let corpo;
    try {
      corpo = JSON.parse(await lerCorpo(req));
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
    } catch { return { status: 400, corpo: { erro: 'corpo JSON inválido' } }; }
    try {
      if (pathname.endsWith('/preparar')) {
        const permitido = Object.keys(corpo).sort().join(',') === 'carta,selecoes,versaoCarta';
        if (!permitido) return { status: 422, corpo: { erro: 'campos de preparação inválidos' } };
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      if (Object.keys(corpo).sort().join(',') !== 'confirmacaoId') {
        return { status: 422, corpo: { erro: 'a confirmação aceita somente o identificador do desafio' } };
      }
      return { status: 200, corpo: await confirmacoes.confirmar(corpo.confirmacaoId, identidade) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      // Escrita incerta nunca é repetida automaticamente; não ecoar dados do
      // Plane, perfil, cookie ou chave de serviço em uma falha upstream.
      return { status: pathname.endsWith('/confirmar') ? 409 : 422,
        corpo: { erro: pathname.endsWith('/confirmar')
          ? 'resultado incerto; confira o card e os touchpoints antes de qualquer nova tentativa'
          : 'proposta recusada pelo contrato ou indisponível; revise a carta' } };
    }
  };
}
