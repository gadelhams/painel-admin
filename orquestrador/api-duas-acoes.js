// Fronteira HTTP das duas ações: sessão antes do corpo, campos fechados, falha upstream sem eco. Não guarda desafio.
import { ErroAcesso } from './sso.js';

const chaves = corpo => Object.keys(corpo).sort().join(',');

// `camposPreparar` e `camposConfirmar` são listas fechadas: nada além delas entra.
// A mensagem genérica de falha é por família, porque não pode ecoar dados do
// Plane, do perfil, do cookie nem da chave de serviço.
export function criarApiDuasAcoes({ autorizar, confirmacoes, base, camposPreparar, camposConfirmar = [['confirmacaoId']],
  argumentosConfirmar = (corpo, identidade) => [corpo.confirmacaoId, identidade],
  mensagemCamposConfirmar = 'confirmação aceita somente o identificador',
  falhaPreparar, falhaConfirmar }) {
  const rotas = [`${base}/preparar`, `${base}/confirmar`];
  const aceitosPreparar = [...camposPreparar].sort().join(',');
  const aceitosConfirmar = camposConfirmar.map(c => [...c].sort().join(','));
  return async (req, pathname, lerCorpo) => {
    if (req.method !== 'POST' || !rotas.includes(pathname)) return { status: 405, corpo: { erro: 'operação indisponível' } };
    let identidade;
    try { identidade = await autorizar(req); }
    catch (erro) {
      return { status: erro instanceof ErroAcesso ? erro.status : 502,
        corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível' } };
    }
    let corpo;
    try { corpo = JSON.parse(await lerCorpo(req)); if (!corpo || Array.isArray(corpo) || typeof corpo !== 'object') throw Error(); }
    catch { return { status: 400, corpo: { erro: 'corpo JSON inválido' } }; }
    const confirmando = pathname.endsWith('/confirmar');
    try {
      if (!confirmando) {
        if (chaves(corpo) !== aceitosPreparar) throw new ErroAcesso('campos de preparação inválidos', 422);
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      if (!aceitosConfirmar.includes(chaves(corpo))) throw new ErroAcesso(mensagemCamposConfirmar, 422);
      return { status: 200, corpo: await confirmacoes.confirmar(...argumentosConfirmar(corpo, identidade)) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      const falha = confirmando ? falhaConfirmar : falhaPreparar;
      return { status: falha.status ?? (confirmando ? 409 : 422), corpo: { erro: falha.mensagem } };
    }
  };
}
