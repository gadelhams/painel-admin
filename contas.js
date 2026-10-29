// Porta da aba Contas. A tabela, o ssh e a fronteira HTTP moram em contas/.

export { OPERACOES, ErroContas, montarComando } from './contas/tabela.js';
export { criarExecutorSsh, executarSsh, redigirSegredo, interpretarSaida } from './contas/ssh.js';
export { criarClienteContas, resolverRotaContas, criarManipuladorContas, ROTAS_HTTP as ROTAS_CONTAS } from './contas/fronteira.js';
