import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { criarAutorizador, criarVerificadorCadastro, ErroAcesso, extrairSessao, recusaOrigemPrivilegiada } from '../orquestrador/sso.js';
import { criarConfirmacoesFrota, criarApiFrota } from '../orquestrador/api-frota.js';
import { montarComando } from '../contas.js';

const TOKEN = 'x'.repeat(43);
const IDENTIDADE = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };
const CARTA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
// Desde a F2 (29/10/2026) o esqueleto das duas ações é provado pela troca da frota; o
// perfil por carta, que fazia esse papel, saiu por decisão do dono.
const TUPLA = { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' };
const FROTA = { executor: { orquestracao: TUPLA, codificacao_testes: TUPLA, validacao: TUPLA }, zelador: { zelador: TUPLA } };

const req = (cabecalhos = {}) => ({ method: 'POST', headers: {
  host: 'painel.vpn.astargne.com', origin: 'https://painel.vpn.astargne.com',
  'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
  cookie: `astargne_session=${TOKEN}`, ...cabecalhos,
} });

test('cookie único e guarda de origem estrita; localhost/curl e subdomínio irmão não escrevem', () => {
  assert.equal(extrairSessao(`a=b; astargne_session=${TOKEN}`), TOKEN);
  assert.equal(extrairSessao(`astargne_session=${TOKEN}; astargne_session=${TOKEN}`), null);
  assert.equal(extrairSessao('astargne_session=curto'), null);
  for (const cabecalhos of [
    { host: 'localhost:7777' }, { origin: 'https://outro.astargne.com' },
    { 'sec-fetch-site': 'same-site' }, { origin: undefined },
    { 'sec-fetch-site': undefined }, { 'content-type': 'text/plain' },
  ]) assert.ok(recusaOrigemPrivilegiada(req(cabecalhos)) instanceof ErroAcesso);
  assert.equal(recusaOrigemPrivilegiada(req()), null);
});

test('SSO remoto: cookie só no stdin, script fixo, sessão inválida e falha fechada', async () => {
  const chamadas = [];
  let saida = { codigo: 0, stdout: '{"ok":true,"usuario":{"id":7}}\n200' };
  const verificar = criarVerificadorCadastro({ executar: async (args, stdin) => { chamadas.push({ args, stdin }); return saida; } });
  assert.equal(await verificar(TOKEN), '7');
  assert.equal(chamadas[0].stdin, JSON.stringify({ token: TOKEN, app: null }));
  assert.ok(chamadas[0].args.every(a => !a.includes(TOKEN)));
  assert.match(chamadas[0].args.at(-1), /\/interno\/sessao\/verificar/);
  execFileSync('sh', ['-n', '-c', chamadas[0].args.at(-1)]);
  const trechoToken = texto => texto.slice(texto.indexOf('sudo grep'), texto.indexOf(' > "$f"') + ' > "$f"'.length);
  assert.equal(trechoToken(chamadas[0].args.at(-1)), trechoToken(montarComando('listarApps').args.at(-1)));
  saida = { codigo: 0, stdout: '{"ok":false,"motivo":"sessao"}\n401' };
  await assert.rejects(verificar(TOKEN), e => e.status === 401);
  saida = { codigo: 97, stdout: '', stderr: `Bearer ${TOKEN}` };
  await assert.rejects(verificar(TOKEN), e => e.status === 502 && !e.message.includes(TOKEN));
});

test('autorização local usa ID estável e revalida toda requisição', async () => {
  let chamadas = 0;
  const autorizar = criarAutorizador({ proprietarioId: '7', verificar: async () => { chamadas++; return '7'; } });
  const a = await autorizar(req());
  await autorizar(req());
  assert.equal(chamadas, 2);
  assert.equal(a.usuarioId, '7');
  assert.equal(a.sessaoHash.length, 64);
  assert.ok(!JSON.stringify(a).includes(TOKEN));
  await assert.rejects(criarAutorizador({ proprietarioId: '8', verificar: async () => '7' })(req()), e => e.status === 403);
  await assert.rejects(criarAutorizador({ proprietarioId: '', verificar: async () => { throw Error('não chamar'); } })(req()), e => e.status === 503);
  await assert.rejects(autorizar(req({ cookie: undefined })), e => e.status === 401);
});

test('preparação não escreve; confirmação usa a frota armazenada e bloqueia concorrência/replay indevido', async () => {
  let agora = 1000;
  let chamadas = 0;
  let liberar;
  const servico = {
    validarFrota: async (conteudo) => ({ conteudo, base: 'ok:1:x', atual: { estado: 'ok', versao: 1 } }),
    trocarFrota: async (conteudo, base, usuarioId) => { chamadas++; await new Promise(r => { liberar = r; }); return { versao: 2, base, usuarioId }; },
  };
  const confirmar = criarConfirmacoesFrota({ servico, agora: () => agora });
  const preparado = await confirmar.preparar(FROTA, IDENTIDADE);
  assert.equal(chamadas, 0);
  assert.deepEqual(preparado.conteudo, FROTA);
  const primeira = confirmar.confirmar(preparado.confirmacaoId, IDENTIDADE);
  await assert.rejects(confirmar.confirmar(preparado.confirmacaoId, IDENTIDADE), e => e.status === 409);
  assert.equal(chamadas, 1);
  liberar();
  const resultado = await primeira;
  assert.equal(resultado.base, 'ok:1:x');
  assert.deepEqual(await confirmar.confirmar(preparado.confirmacaoId, IDENTIDADE), resultado);
  assert.equal(chamadas, 1);
  const p2 = await confirmar.preparar(FROTA, IDENTIDADE);
  await assert.rejects(confirmar.confirmar(p2.confirmacaoId, { ...IDENTIDADE, sessaoHash: 'b'.repeat(64) }), e => e.status === 403);
  agora += 120_001;
  await assert.rejects(confirmar.confirmar(p2.confirmacaoId, IDENTIDADE), e => [404, 410].includes(e.status));
  assert.equal(chamadas, 1);
});

test('frota recusada no preparar e falha incerta não gravam duas vezes', async () => {
  let chamadas = 0;
  const servico = {
    validarFrota: async () => { throw new Error('modelo ou esforço fora do catálogo para validacao'); },
    trocarFrota: async () => { chamadas++; throw new Error('disco incerto'); },
  };
  await assert.rejects(criarConfirmacoesFrota({ servico }).preparar(FROTA, IDENTIDADE), e => e.status === 422);
  const confirmacoes = criarConfirmacoesFrota({ servico: { ...servico, validarFrota: async (c) => ({ conteudo: c, base: 'ausente', atual: {} }) } });
  const preparado = await confirmacoes.preparar(FROTA, IDENTIDADE);
  await assert.rejects(confirmacoes.confirmar(preparado.confirmacaoId, IDENTIDADE), /disco incerto/);
  await assert.rejects(confirmacoes.confirmar(preparado.confirmacaoId, IDENTIDADE), e => e.status === 409);
  assert.equal(chamadas, 1);
});

test('API exige autenticação antes de ler corpo e confirmação não aceita payload trocado', async () => {
  let leituras = 0;
  let chamadas = 0;
  const apiNegada = criarApiFrota({ autorizar: async () => { throw new ErroAcesso('sessão ausente', 401); }, confirmacoes: {} });
  const ler = async () => { leituras++; return '{}'; };
  assert.equal((await apiNegada(req(), '/api/orquestracao/frota/preparar', ler)).status, 401);
  assert.equal(leituras, 0);
  const api = criarApiFrota({ autorizar: async () => IDENTIDADE, confirmacoes: {
    preparar: async corpo => { chamadas++; return corpo; },
    confirmar: async id => { chamadas++; return { id }; },
  } });
  const preparar = await api(req(), '/api/orquestracao/frota/preparar', async () => JSON.stringify({ ...FROTA, base: 'ok:9:x' }));
  assert.equal(preparar.status, 422);
  const confirmar = await api(req(), '/api/orquestracao/frota/confirmar', async () => JSON.stringify({ confirmacaoId: CARTA, ...FROTA }));
  assert.equal(confirmar.status, 422);
  assert.equal(chamadas, 0);
});
