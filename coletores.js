// Porta única dos coletores. Rotas e ferramentas do C-3PO importam daqui.

export {
  RAIZ, AREAS, dirDoProjeto, trechosDoNome, resolverDentroDaRaiz,
} from './coletores/caminhos.js';
export { gitDetalhado } from './coletores/git-local.js';
export { estadoProjetos } from './coletores/estado-local.js';
export { MAX_CHARS_ARQUIVO, lerArquivoMd } from './coletores/leitura-md.js';
export { listarModeladores } from './coletores/modeladores.js';
export { docsProjeto, lerModeladorProjeto } from './coletores/docs.js';
export { estadoProducao } from './coletores/sondas.js';
export { parsearBacklog } from './coletores/parser-backlog.js';
export { lerBacklog } from './coletores/backlog.js';
export { decisoesDoBacklog } from './coletores/decisoes.js';
export { catalogoRelacoes } from './coletores/catalogo.js';
export { lerHangar } from './coletores/hangar.js';
export { lerSessoes } from './coletores/sessoes.js';
