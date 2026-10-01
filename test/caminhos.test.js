import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, AREAS, dirDoProjeto, resolverDentroDaRaiz, trechosDoNome } from '../coletores.js';
import { PROJETOS } from '../projetos.js';

// Por que estes testes existem: a reorganização de 30/09/2026 moveu os
// projetos para ProjetosPessoais/ e ProjetosCompartilhados/, e o painel passou
// a achar tudo "sem arquivo" sem nenhum erro. E ~/Work agora também guarda
// Exitlag/ (empresa), que o painel e o C-3PO nunca podem ler.

test('a raiz é ~/Work, dois níveis acima do painel', () => {
  assert.equal(path.basename(RAIZ), 'Work');
  assert.ok(existsSync(path.join(RAIZ, 'ProjetosPessoais', 'painel-admin')));
});

test('toda entrada do catálogo tem área válida e pasta que existe no disco', () => {
  for (const p of PROJETOS) {
    assert.ok(AREAS.includes(p.area), `${p.pasta}: área "${p.area}" fora de ${AREAS}`);
    assert.ok(existsSync(dirDoProjeto(p)), `${p.pasta}: ${dirDoProjeto(p)} não existe`);
  }
});

test('Exitlag e a raiz solta ficam fora do alcance, por nome direto ou por ..', () => {
  assert.equal(resolverDentroDaRaiz('Exitlag', 'x.md'), null);
  assert.equal(resolverDentroDaRaiz('CLAUDE.md'), null);
  assert.equal(resolverDentroDaRaiz('ProjetosPessoais', '..', 'Exitlag', 'x.md'), null);
  // Pelo nome, "Exitlag" cai dentro de uma área liberada (e não existe lá);
  // o que importa é nunca apontar para a Exitlag/ de verdade.
  const pedido = resolverDentroDaRaiz(...trechosDoNome('Exitlag'), 'x.md');
  assert.ok(!pedido?.startsWith(path.join(RAIZ, 'Exitlag') + path.sep), pedido);
});

test('as áreas liberadas continuam legíveis', () => {
  const alvo = resolverDentroDaRaiz('ProjetosPessoais', 'painel-admin', 'CLAUDE.md');
  assert.equal(alvo, path.join(RAIZ, 'ProjetosPessoais', 'painel-admin', 'CLAUDE.md'));
});

test('o C-3PO acha projeto do catálogo e de fora dele pelo nome da pasta', () => {
  assert.deepEqual(trechosDoNome('Anya'), ['ProjetosCompartilhados', 'Anya']);
  assert.deepEqual(trechosDoNome('painel-admin'), ['ProjetosPessoais', 'painel-admin']);
  assert.deepEqual(trechosDoNome('SupervisorHandoff'), ['ProjetosPessoais', 'SupervisorHandoff']);
});
