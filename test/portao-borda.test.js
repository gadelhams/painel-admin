// Portão de entrada da borda (PAINEL-64): pela borda só a sessão do dono lê ou aciona o painel; o loopback segue sem login. Painel MONTADO, HTTP real em porta efêmera, SSO falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { servirComFalsos, cabecalhosDaBorda, BORDA, DONO, TOKEN_DONO } from './painel-falso.js';
import { ErroAcesso } from '../orquestrador/sso.js';
import { ReservaServico } from '../orquestrador/reserva-servico.js';

const OUTRA = 'o'.repeat(43);
const FORA = 'f'.repeat(43);
const QUEBRA = 'q'.repeat(43);
// Central falso com os quatro desfechos: dono, outra conta, fora do ar e bug no verificador.
const identificar = async token => {
  if (token === TOKEN_DONO) return { id: DONO, nome: '<b>Dono</b>', email: 'dono@exemplo' };
  if (token === OUTRA) return { id: '4', nome: '<script>x</script>', email: 'outra@exemplo' };
  if (token === FORA) throw new ErroAcesso('verificação de sessão indisponível', 502);
  if (token === QUEBRA) throw new TypeError('bug');
  throw new ErroAcesso('sessão inválida ou expirada', 401);
};
const borda = (token, extra = {}) => ({ host: BORDA, ...(token ? { cookie: `astargne_session=${token}` } : {}), ...extra });
const comPainel = async (fn, opcoes = {}) => {
  const s = await servirComFalsos({ externos: { sso: { identificar, verificar: async t => (await identificar(t)).id } }, ...opcoes });
  try { await fn(s); } finally { await s.fechar(); }
};
const destino = r => new URL(new URL(r.cabecalhos.location).searchParams.get('next'));

test('página pela borda sem sessão vai ao login do Cadastro Único com a volta para a borda; a API recebe 401 do portão', () => comPainel(async ({ pedir, chamadas }) => {
  const pagina = await pedir('GET', '/c3po/?x=1', { cabecalhos: borda() });
  assert.equal(pagina.status, 302);
  assert.ok(pagina.cabecalhos.location.startsWith('https://astargne.com/login?next='));
  assert.equal(destino(pagina).href, `https://${BORDA}/c3po/?x=1&volta=1`);
  assert.equal(pagina.cabecalhos['cache-control'], 'no-store');
  for (const metodo of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const api = await pedir(metodo, '/api/projetos', { cabecalhos: cabecalhosDaBorda({ sessao: 'nenhuma' }) });
    assert.equal(api.status, 401, metodo);
    if (metodo !== 'HEAD') assert.equal(api.corpo.portao, 'sem-sessao', metodo);
  }
  // Escrita fora de /api/ também não é redirecionada: 401 em JSON.
  assert.equal((await pedir('POST', '/', { cabecalhos: cabecalhosDaBorda({ sessao: 'nenhuma' }) })).corpo.portao, 'sem-sessao');
  assert.deepEqual(chamadas, [], 'nenhuma porta externa, nem o SSO, sem cookie');
}));

test('com a sessão do dono a borda serve página e API; sessão que o central recusa volta ao login', () => comPainel(async ({ pedir }) => {
  assert.equal((await pedir('GET', '/', { cabecalhos: borda(TOKEN_DONO) })).status, 200);
  assert.equal((await pedir('GET', '/api/hangar/encomendas', { cabecalhos: borda(TOKEN_DONO) })).status, 200);
  const vencida = await pedir('GET', '/', { cabecalhos: borda('v'.repeat(43)) });
  assert.equal(vencida.status, 302);
  assert.deepEqual([(await pedir('GET', '/api/projetos', { cabecalhos: borda('v'.repeat(43)) })).corpo.portao], ['expirada']);
}));

test('outra conta, central fora, bug no verificador e painel sem dono: página com o motivo, nunca o login nem dado do central', async () => {
  await comPainel(async ({ pedir }) => {
    const outra = await pedir('GET', '/', { cabecalhos: borda(OUTRA) });
    assert.equal(outra.status, 403);
    assert.equal(outra.cabecalhos.location, undefined, 'mandar ao login entraria em laço: o central a devolveria logada');
    assert.ok(!outra.texto.includes('script') && !outra.texto.includes('outra@exemplo'), 'nome e e-mail do central não entram na página');
    assert.equal((await pedir('GET', '/api/projetos', { cabecalhos: borda(OUTRA) })).corpo.portao, 'outra-conta');
    for (const token of [FORA, QUEBRA]) {
      const r = await pedir('GET', '/', { cabecalhos: borda(token) });
      assert.deepEqual([r.status, r.cabecalhos.location], [503, undefined], token);
      assert.equal((await pedir('POST', '/api/conversa', { cabecalhos: { ...cabecalhosDaBorda({ sessao: 'nenhuma' }), cookie: `astargne_session=${token}` }, corpo: '{}' })).status, 503);
    }
    // O processo segue de pé depois do TypeError: o loopback responde.
    assert.equal((await pedir('GET', '/api/sessao')).status, 200);
  });
  await comPainel(async ({ pedir, chamadas }) => {
    for (const token of [null, TOKEN_DONO]) {
      const r = await pedir('GET', '/api/projetos', { cabecalhos: borda(token) });
      assert.deepEqual([r.status, r.corpo.portao], [503, 'sem-dono']);
    }
    assert.deepEqual(chamadas, []);
  }, { ambiente: {}, externos: {} });
});

test('quebra-laço: quem volta do login ainda sem sessão vê a página com o motivo; cookie duplicado nunca vai ao login', () => comPainel(async ({ pedir }) => {
  const volta = await pedir('GET', '/?volta=1', { cabecalhos: borda() });
  assert.deepEqual([volta.status, volta.cabecalhos.location], [401, undefined]);
  assert.match(volta.texto, /Entrar no Cadastro Único/);
  const duplicado = await pedir('GET', '/', { cabecalhos: { host: BORDA, cookie: `astargne_session=${TOKEN_DONO}; astargne_session=${OUTRA}` } });
  assert.deepEqual([duplicado.status, duplicado.cabecalhos.location], [401, undefined]);
  assert.match(duplicado.texto, /mais de um cookie/);
  assert.equal((await pedir('HEAD', '/?volta=1', { cabecalhos: borda() })).texto, '');
}));

test('a única rota fora do portão é GET/HEAD /api/sessao, decidida sobre o mesmo caminho que o roteador despacha', () => comPainel(async ({ pedir }) => {
  for (const alvo of ['/api/sessao', '/api/sessao?x=1', `http://x/api/sessao`]) {
    const r = await pedir('GET', alvo, { cabecalhos: borda() });
    assert.deepEqual([r.status, r.corpo], [200, { estado: 'sem-sessao' }], alvo);
  }
  assert.equal((await pedir('HEAD', '/api/sessao', { cabecalhos: borda() })).status, 200);
  assert.equal((await pedir('POST', '/api/sessao', { cabecalhos: cabecalhosDaBorda({ sessao: 'nenhuma' }) })).corpo.portao, 'sem-sessao');
  for (const alvo of ['/api/%73essao', '//api/sessao', '/api/sessao/', '/API/sessao', '/api/sessao/../hangar', '/api/sessao/%2e%2e/hangar', '/api/sessao;x', '/api/sessao%00']) {
    const r = await pedir('GET', alvo, { cabecalhos: borda() });
    assert.ok(r.corpo?.portao === 'sem-sessao' || r.status === 302, `${alvo} passou do portão: ${r.status}`);
  }
}));

test('o endereço de volta nunca sai da borda nem duplica o next, venha o que vier no caminho e na consulta', () => comPainel(async ({ pedir }) => {
  for (const alvo of ['/?a=1&next=https://evil.com', '/.//evil.com/x', '//evil.com/x', '/x%0d%0aSet-Cookie:%20a=b', '/a%C3%A7%C3%A3o?q=%C3%B1', '/@evil.com', '/?next=//evil.com&next=x']) {
    const r = await pedir('GET', alvo, { cabecalhos: borda() });
    assert.equal(r.status, 302, alvo);
    const login = new URL(r.cabecalhos.location);
    assert.deepEqual([login.origin, login.pathname, login.searchParams.getAll('next').length], ['https://astargne.com', '/login', 1], alvo);
    assert.equal(destino(r).origin, `https://${BORDA}`, alvo);
    assert.equal(r.cabecalhos['set-cookie'], undefined, alvo);
  }
}));

test('loopback segue sem login; Host de loopback com cabeçalho de proxy passa pelo portão', () => comPainel(async ({ pedir, chamadas }) => {
  assert.equal((await pedir('GET', '/')).status, 200);
  assert.equal((await pedir('GET', '/api/hangar/encomendas')).status, 200);
  for (const cabecalho of ['x-forwarded-for', 'x-forwarded-host', 'forwarded']) {
    const r = await pedir('GET', '/api/hangar/encomendas', { cabecalhos: { [cabecalho]: '100.87.142.59' } });
    assert.deepEqual([r.status, r.corpo.portao], [401, 'sem-sessao'], cabecalho);
  }
  assert.deepEqual(chamadas.filter(c => c.startsWith('sso.')), []);
}));

test('o veredito não fica preso à conexão: no mesmo socket, o pedido sem cookie depois do pedido do dono leva 401', () => comPainel(async ({ porta }) => {
  const pedido = cookie => `GET /api/hangar/encomendas HTTP/1.1\r\nHost: ${BORDA}\r\n${cookie ? `Cookie: astargne_session=${cookie}\r\n` : ''}\r\n`;
  const soquete = net.connect(porta, '127.0.0.1');
  let recebido = '';
  soquete.on('data', d => { recebido += d; });
  await new Promise(r => soquete.once('connect', r));
  const esperar = async n => { while ((recebido.match(/HTTP\/1\.1 /g) ?? []).length < n) await new Promise(r => setTimeout(r, 5)); };
  soquete.write(pedido(TOKEN_DONO));
  await esperar(1);
  soquete.write(pedido(null));
  await esperar(2);
  soquete.destroy();
  assert.deepEqual(recebido.match(/HTTP\/1\.1 \d+/g), ['HTTP/1.1 200', 'HTTP/1.1 401']);
}));

test('alvo de pedido que não é URL responde 400 e o processo segue de pé', () => comPainel(async ({ porta, pedir }) => {
  const soquete = net.connect(porta, '127.0.0.1');
  let recebido = '';
  soquete.on('data', d => { recebido += d; });
  await new Promise(r => soquete.once('connect', r));
  soquete.write(`GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${porta}\r\nConnection: close\r\n\r\n`);
  await new Promise(r => soquete.once('close', r));
  assert.match(recebido, /^HTTP\/1\.1 400 /);
  assert.equal((await pedir('GET', '/api/sessao')).status, 200);
}));

// Pelo painel montado a borda sem cookie para no portão, e com cookie cai no ramo "cookie" da
// reserva: o ramo do Host só se prova aqui, na unidade.
test('reserva: Host da borda sem cookie é recusado pela própria rota (ramo do Host)', () => {
  const servico = new ReservaServico({ porta: 7777 });
  const req = { headers: { host: BORDA, 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(servico.recusar(req)?.status, 403);
  assert.equal(servico.recusar({ ...req, headers: { ...req.headers, host: '127.0.0.1:7777' } }), null);
});
