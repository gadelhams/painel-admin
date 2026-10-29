// Cliente e rotas /api/contas/*. O corpo JSON vai só pelo stdin do ssh.

import { OPERACOES, ErroContas, montarComando } from './tabela.js';
import { executarSsh, redigirSegredo, interpretarSaida } from './ssh.js';

export function criarClienteContas({ executar = executarSsh, log = console.error } = {}) {
  async function chamar(nome, { id, corpo } = {}) {
    const { args, precisaCorpo } = montarComando(nome, { id });
    const stdin = precisaCorpo ? JSON.stringify(corpo ?? {}) : '';
    let saida;
    try {
      saida = await executar(args, stdin);
    } catch (erro) {
      log(`[contas] ssh não pôde ser iniciado: ${redigirSegredo(erro.message)}`);
      throw new ErroContas('sem acesso ao servidor', 502);
    }
    return interpretarSaida(saida, log);
  }
  return { chamar };
}

// Exportada para a varredura de rotas (test/rotas-privilegiadas.test.js) listar as de escrita uma a uma.
export const ROTAS_HTTP = Object.freeze([
  { metodo: 'GET', padrao: /^\/api\/contas\/apps$/, operacao: 'listarApps' },
  { metodo: 'GET', padrao: /^\/api\/contas\/usuarios$/, operacao: 'listarUsuarios' },
  { metodo: 'GET', padrao: /^\/api\/contas\/convites$/, operacao: 'listarConvites' },
  { metodo: 'POST', padrao: /^\/api\/contas\/convites$/, operacao: 'criarConvite' },
  { metodo: 'POST', padrao: /^\/api\/contas\/convites\/([^/]+)\/reenviar$/, operacao: 'reenviarConvite' },
  { metodo: 'DELETE', padrao: /^\/api\/contas\/convites\/([^/]+)$/, operacao: 'revogarConvite' },
  { metodo: 'PUT', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/permissoes$/, operacao: 'definirPermissoes' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/desativar$/, operacao: 'desativarUsuario' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/reativar$/, operacao: 'reativarUsuario' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/redefinir$/, operacao: 'redefinirSenha' },
]);

export function resolverRotaContas(metodo, pathname) {
  for (const rota of ROTAS_HTTP) {
    const m = pathname.match(rota.padrao);
    if (m && rota.metodo === metodo) return { operacao: rota.operacao, id: m[1] };
  }
  return null;
}

export function criarManipuladorContas({ cliente }) {
  return async function manipular(metodo, pathname, corpoTexto = '') {
    const rota = resolverRotaContas(metodo, pathname);
    if (!rota) return { status: 404, corpo: { erro: 'não encontrado' } };
    let corpo = {};
    if (OPERACOES[rota.operacao].corpo) {
      try {
        corpo = JSON.parse(corpoTexto);
      } catch {
        return { status: 400, corpo: { erro: 'corpo inválido: mande JSON' } };
      }
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
        return { status: 400, corpo: { erro: 'corpo inválido: mande um objeto JSON' } };
      }
    }
    try {
      return await cliente.chamar(rota.operacao, { id: rota.id, corpo });
    } catch (erro) {
      if (erro instanceof ErroContas) return { status: erro.status, corpo: { erro: erro.message } };
      throw erro;
    }
  };
}
