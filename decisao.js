// Porta da mesa de decisão para quem só LÊ ou PROPÕE (o motor do C-3PO e o zelador): a leitura da carta, a forma de texto dela, a marca do DECISAO/v1 e o registro de propostas de decisão, que não toca o Plane. O escritor, a aplicação e as duas ações ficam fora daqui de propósito — só a montagem os liga.

export { criarLeitorCarta, cartaParaLeitura } from './decisao/leitor-carta.js';
// Leitura pura (correção da F3, B2/B20): o zelador reconhece o DECISAO/v1 e compara HTML do Plane como texto, como a mesa.
export { FONTE as FONTE_DECISAO, CABECALHO as CABECALHO_DECISAO } from './decisao/protocolo-decisao.js';
export { textoDeHtml } from './decisao/texto-html.js';
// PAINEL-65: o C-3PO propõe a decisão definida em conversa; gravar é do dono, pelo cartão.
export { propostasDecisao, criarRegistroPropostasDecisao, RecusaPropostaDecisao } from './decisao/propostas-decisao.js';
