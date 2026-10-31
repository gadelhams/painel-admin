// Porta das encomendas de nave, só o lado de leitura. O registro e as duas ações moram em encomendas/ e só a montagem os liga.
//
// A porta não reexporta o escritor de propósito: o C-3PO lê as pendentes por aqui e o
// fecho dos imports do motor não alcança quem grava (test/fronteiras-modulos.test.js).

export { lerEncomendas, ARQUIVO_ENCOMENDAS } from './encomendas/leitura-encomendas.js';
