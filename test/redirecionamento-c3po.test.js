// Redirecionamentos do chat: /c3po ganha a barra; /severino e /severino/ (nome antigo) vão para /c3po/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RedirecionamentoC3po } from '../http/redirecionamento-c3po.js';

const pedir = async (pathname, method = 'GET') => {
  const res = { cabecalhos: null, status: null, writeHead(s, h) { this.status = s; this.cabecalhos = h; }, end() {} };
  const tratou = await new RedirecionamentoC3po().tentar({ method }, res, new URL(`http://x${pathname}`));
  return { tratou, status: res.status, para: res.cabecalhos?.location };
};

test('/c3po, /severino e /severino/ redirecionam para /c3po/', async () => {
  for (const p of ['/c3po', '/severino', '/severino/']) assert.deepEqual(await pedir(p), { tratou: true, status: 301, para: '/c3po/' });
});

test('/c3po/ e a API não são deste grupo; POST também não', async () => {
  assert.equal((await pedir('/c3po/')).tratou, false);
  assert.equal((await pedir('/api/projetos')).tratou, false);
  assert.equal((await pedir('/severino', 'POST')).tratou, false);
});
