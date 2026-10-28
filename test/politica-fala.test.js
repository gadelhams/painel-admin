import test from 'node:test';
import assert from 'node:assert/strict';
import '../publico/severino/politica-fala.js';

const { Fala, Eco, CorretorDeNomes, GatilhoC3po, RetentativaEleven } = globalThis.PoliticaFala;

test('limpeza tira marcação e o corte respeita parágrafo, sentença e número', () => {
  assert.equal(Fala.limpar('veja [o plano](docs/x.md) e **não** leia `código`'), 'veja o plano e não leia código');
  assert.equal(Fala.corte('curto.\n\nsegue', 160), 6);
  assert.equal(Fala.corte('3.5 continua', 1), -1);
  const frase = 'Uma frase longa o bastante para passar do mínimo de corte natural da fala. Outra.';
  assert.equal(Fala.corte(frase, 40), frase.indexOf('.'));
});

test('eco da própria fala não vira turno; frase diferente vira', () => {
  const dito = 'os projetos estão parados mestre e a fila espera';
  assert.equal(Eco.parece('mestre os projetos', dito), true);
  assert.equal(Eco.parece('projetos estão parados mestre', dito), true);
  assert.equal(Eco.parece('abre a porta do servidor', dito), false);
  assert.equal(Eco.parece('', dito), false);
  assert.equal(Eco.parece('mestre', ''), false);
});

test('nome de projeto em camelCase e termo técnico torto são corrigidos; palavra igual não', () => {
  assert.deepEqual(CorretorDeNomes.palavras('SistemaLoreEngine'), ['sistema', 'lore', 'engine']);
  const corretor = CorretorDeNomes.doCatalogo([
    { pasta: 'SistemaLoreEngine', titulo: 'Lore Engine' },
  ]);
  const nome = corretor.corrigir('olha o sistema lory endine agora');
  assert.match(nome.texto, /SistemaLoreEngine/);
  assert.equal(nome.trocas.length, 1);
  const termo = corretor.corrigir('sobe no doker');
  assert.match(termo.texto, /Docker/);
  const igual = corretor.corrigir('Docker');
  assert.deepEqual(igual, { texto: 'Docker', trocas: [] });
  assert.deepEqual(new CorretorDeNomes([]).corrigir('cru'), { texto: 'cru', trocas: [] });
});

test('gatilho C3PO devolve o resto e palavra comum não dispara', () => {
  assert.deepEqual(GatilhoC3po.detectar('cetrepo como estão os projetos'), { encontrado: true, resto: 'como estão os projetos' });
  assert.deepEqual(GatilhoC3po.detectar('projeto parado'), { encontrado: false, resto: '' });
});

test('retentativa: uma falha isolada, fila no 429, desiste na quarta ocupada', () => {
  assert.deepEqual(RetentativaEleven.decidir({ ocupada: false, tentativa: 0 }), { agir: 'de-novo' });
  assert.deepEqual(RetentativaEleven.decidir({ ocupada: false, tentativa: 1 }), { agir: 'desistir' });
  assert.deepEqual(RetentativaEleven.decidir({ ocupada: true, tentativa: 0 }), { agir: 'esperar', ms: 350 });
  assert.deepEqual(RetentativaEleven.decidir({ ocupada: true, tentativa: 2 }), { agir: 'esperar', ms: 1050 });
  assert.deepEqual(RetentativaEleven.decidir({ ocupada: true, tentativa: 3 }), { agir: 'desistir' });
});
