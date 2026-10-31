// Porta das ações privilegiadas. A leitura do Painel não usa esta sessão.
// Cookie, origem, verificação remota e autorização moram nos módulos ao lado.

export { ErroAcesso } from './erro-acesso.js';
export { extrairSessao } from './sessao-cookie.js';
export { recusaOrigemPrivilegiada } from './origem-privilegiada.js';
export { criarVerificadorCadastro, criarIdentificadorCadastro } from './verificador-cadastro.js';
export { criarAutorizador } from './autorizador.js';
