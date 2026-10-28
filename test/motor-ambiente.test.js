// Prova que o processo do modelo do C-3PO não recebe segredo do .env nem config do disco (PAINEL-52).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../chaves/catalogo.js';
import { AMBIENTE_PERMITIDO, opcoesDaConversa } from '../motor.js';

// Por que existe: o .env do painel vive em process.env e o SDK repassaria tudo ao
// CLI do modelo; com uma regra de permissão a mais, chave de escrita viraria ferramenta.
const nomesDoCatalogo = CATALOGO.flatMap((p) => (p.chaves ?? []).map((c) => c.nome));

test('motor: ambiente do modelo só com a lista branca; nenhum nome do catálogo de chaves', () => {
  const ambiente = { HOME: '/home/x', PATH: '/bin', LANG: 'pt_BR.UTF-8', ALGO_TOKEN: 'segredo', ORQ_OWNER_USER_ID: 'u' };
  for (const nome of nomesDoCatalogo) ambiente[nome] = `valor-de-${nome}`;
  const { env } = opcoesDaConversa(undefined, ambiente);
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH']);
  assert.ok(!JSON.stringify(env).includes('valor-de-'), 'segredo do catálogo chegou ao modelo');
  for (const nome of nomesDoCatalogo) assert.ok(!AMBIENTE_PERMITIDO.includes(nome), `${nome} na lista branca`);
});

test('motor: sem settings, hooks, MCPs nem CLAUDE.md do disco; ferramentas só as do c3po', () => {
  const o = opcoesDaConversa('sessao-1', { HOME: '/h' });
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.strictMcpConfig, true);
  assert.deepEqual(Object.keys(o.mcpServers), ['c3po']);
  assert.deepEqual(o.tools, []);
  assert.ok(o.allowedTools.every((t) => t.startsWith('mcp__c3po__')));
  assert.equal(o.resume, 'sessao-1');
});
