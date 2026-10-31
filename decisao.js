// Porta da mesa de decisão para quem só LÊ (o motor do C-3PO e o zelador): a leitura da carta, a forma de texto dela e a marca do DECISAO/v1. O escritor, a aplicação e as duas ações ficam fora daqui de propósito — só a montagem os liga.

export { criarLeitorCarta, cartaParaLeitura } from './decisao/leitor-carta.js';
// Leitura pura (correção da F3, B2/B20): o zelador reconhece o DECISAO/v1 e compara HTML do Plane como texto, como a mesa.
export { FONTE as FONTE_DECISAO, CABECALHO as CABECALHO_DECISAO } from './decisao/protocolo-decisao.js';
export { textoDeHtml } from './decisao/texto-html.js';
