// Piloto PAINEL-34 (31/10/2026): o briefing dizia que os únicos comandos eram os do contrato e
// "não rode comando". No Codex ler arquivo É comando de shell, e os três papéis não leram nada.
// Os moldes separam ler (livre, só no worktree) de executar (só a lista do contrato).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BriefingPapel } from '../orquestrador/briefing-papel.js';

test('os três moldes liberam a leitura do worktree e só restringem a execução', async () => {
  const b = new BriefingPapel();
  for (const papel of ['orquestracao', 'codificacao_testes', 'validacao']) {
    const molde = await b.molde(papel);
    assert.match(molde, /Ler não é executar/, papel);
    assert.match(molde, /`cat`, `sed -n`, `head`, `rg`/, papel);
    assert.match(molde, /só dentro do worktree/, papel);
    assert.doesNotMatch(molde, /não rode comando/i, papel);
    assert.doesNotMatch(molde, /os ÚNICOS que você pode executar/, papel);
  }
  const dev = await b.molde('codificacao_testes');
  assert.match(dev, /os ÚNICOS que testam, compilam ou rodam algo, exatamente assim: \{\{comandos\}\}/);
  assert.match(dev, /sem instalar dependência, sem rede/);
});
