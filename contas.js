// Porta da aba Contas. A tabela, o ssh e a fronteira HTTP moram em contas/.

export { OPERACOES, ErroContas, montarComando } from './contas/tabela.js';
export { criarExecutorSsh, executarSsh, redigirSegredo, interpretarSaida } from './contas/ssh.js';
export { criarClienteContas, resolverRotaContas, criarManipuladorContas } from './contas/fronteira.js';
