// Varre as rotas do próprio app (regra 6 do padrão geral) pelo roteador REAL: guarda,
// famílias e APIs de duas ações de verdade; só os serviços no fim da linha são espiões.
// Todo caminho /api/ citado em http/ e na tabela da aba Contas recebe POST, PUT, PATCH e
// DELETE de mesma origem e sem sessão. Rota que muda estado responde 401 sem ler o corpo
// nem chamar serviço; rota que não aceita o método responde 405 no próprio handler. O que
// foge disso está na lista abaixo, rota a rota e com o motivo. Rota nova entra sozinha.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { RoteadorPainel } from '../http/roteador.js';
import { RespostaHttp } from '../http/resposta.js';
import { ConversaHttp } from '../http/conversa.js';
import { RotasPainel } from '../http/rotas-painel.js';
import { RotasOrquestracao } from '../http/rotas-orquestracao.js';
import { RotasChaves } from '../http/rotas-chaves.js';
import { RotasVoz } from '../http/rotas-voz.js';
import { RotasAlinhamento } from '../http/rotas-alinhamento.js';
import { criarGuarda } from '../guarda.js';
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarApiFrota, criarConfirmacoesFrota } from '../orquestrador/api-frota.js';
import { criarApiHandoff, criarConfirmacoesHandoff } from '../orquestrador/api-handoff.js';
import { criarApiGate, criarConfirmacoesGate } from '../orquestrador/api-gate.js';
import { criarApiDespacho, criarConfirmacoesDespacho } from '../orquestrador/api-despacho.js';
import { criarApiVigilia, criarConfirmacoesVigilia } from '../orquestrador/api-vigilia.js';
import { criarApiVoz } from '../orquestrador/voz-xai.js';
import { criarApiChaves, criarConfirmacoesChaves } from '../chaves.js';
import { criarManipuladorContas, ROTAS_CONTAS } from '../contas.js';

const HTTP = path.join(import.meta.dirname, '..', 'http');
const METODOS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const PAGO = 'não muda estado, mas gasta API paga sem SSO; a guarda é a borda do tailnet (invariante 1)';
// Exceções, "MÉTODO caminho" → motivo. Desde a N5 (29/10/2026) as escritas da aba Contas
// exigem SSO e não são mais exceção.
const EXCECOES = new Map([
  ['POST /api/orquestracao/simular', 'prévia sem lease, processo ou escrita no Plane'],
  ['POST /api/conversa', PAGO],
  ['POST /api/tts', PAGO],
  ['POST /api/diagnostico/voz', 'telemetria do microfone no log local; não muda estado nem gasta API'],
]);

const exemplo = padrao => padrao.source.replace(/^\^\\\//, '/').replace(/\$$/, '').replaceAll('\\/', '/').replaceAll('([^/]+)', '1');

async function caminhosDoCodigo() {
  const caminhos = new Set();
  for (const nome of await fs.readdir(HTTP)) {
    if (!nome.endsWith('.js')) continue;
    const texto = await fs.readFile(path.join(HTTP, nome), 'utf8');
    // Literal que termina em '/' é prefixo (ex.: '/api/projetos/'): entra com um segmento
    // de exemplo e com cada sufixo `endsWith('/x')` do mesmo arquivo (…/<x>/docs, …/<x>/git).
    const sufixos = [...texto.matchAll(/endsWith\('(\/[a-z0-9-]+)'\)/g)].map(m => m[1]);
    for (const [, c] of texto.matchAll(/'(\/api\/[a-z0-9/-]*)'/g)) {
      if (!c.endsWith('/')) { caminhos.add(c); continue; }
      caminhos.add(c);
      caminhos.add(`${c}x`);
      for (const sufixo of sufixos) caminhos.add(`${c}x${sufixo}`);
    }
  }
  for (const r of ROTAS_CONTAS) caminhos.add(exemplo(r.padrao));
  return [...caminhos].sort();
}

function montar() {
  const chamadas = [];
  // Qualquer acesso a um serviço é registrado: a recusa tem de vir antes dele.
  const espiao = nome => new Proxy({}, { get: (_, prop) => (prop === 'then' ? undefined : (...a) => { chamadas.push(`${nome}.${String(prop)}`); return Promise.resolve({}); }) });
  const negar = async () => { throw new ErroAcesso('entre no Cadastro Único para confirmar esta ação', 401); };
  const orquestracao = espiao('orquestracao');
  const resposta = new RespostaHttp({ publico: path.join(import.meta.dirname, '..', 'publico'), maxCorpo: 64 * 1024 });
  let leituras = 0;
  const corpoOriginal = resposta.corpo.bind(resposta);
  resposta.corpo = req => { leituras++; return corpoOriginal(req); };
  const roteador = new RoteadorPainel({
    porta: 7777, recusa: criarGuarda(7777), resposta,
    conversa: new ConversaHttp({ resposta, conversar: async () => { chamadas.push('conversar'); }, maxMensagem: 8000 }),
    voz: new RotasVoz({ resposta, proxyEleven: espiao('eleven') }),
    painel: new RotasPainel({ resposta, coletores: espiao('coletores'), ssh: espiao('ssh'), autorizarContas: negar,
      contas: criarManipuladorContas({ cliente: espiao('contas') }) }),
    orquestracao: new RotasOrquestracao({ resposta, orquestracao, triagemDev: espiao('triagem'), lerConsumo: espiao('consumo'),
      lerDiarioFrota: espiao('diario'), vigilia: espiao('vigilia'),
      apiFrota: criarApiFrota({ autorizar: negar, confirmacoes: criarConfirmacoesFrota({ servico: orquestracao }) }),
      apiHandoff: criarApiHandoff({ autorizar: negar, confirmacoes: criarConfirmacoesHandoff({ servico: orquestracao }) }),
      apiGate: criarApiGate({ autorizar: negar, confirmacoes: criarConfirmacoesGate({ servico: orquestracao }) }),
      apiDespacho: criarApiDespacho({ autorizar: negar, confirmacoes: criarConfirmacoesDespacho({ servico: orquestracao }) }),
      apiVigilia: criarApiVigilia({ autorizar: negar, confirmacoes: criarConfirmacoesVigilia({ vigilia: espiao('vigilia') }) }),
      apiVoz: criarApiVoz({ autorizar: negar, transcrever: async () => { chamadas.push('transcrever'); return {}; } }),
      xai: () => false }),
    alinhamento: new RotasAlinhamento({ resposta, alinhamento: espiao('alinhamento') }),
    chaves: new RotasChaves({ resposta, chaves: espiao('chaves'), apiChaves: criarApiChaves({ autorizar: negar, confirmacoes: criarConfirmacoesChaves({ servico: espiao('chaves') }) }) }),
  });
  return { roteador, chamadas, leituras: () => leituras };
}

// Mesma origem e sem cookie: o pior caso que passa pela guarda.
async function pedir(roteador, metodo, caminho) {
  const req = Object.assign(Readable.from([Buffer.from('{}')]), { method: metodo, url: caminho,
    headers: { host: '127.0.0.1:7777', origin: 'http://127.0.0.1:7777', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } });
  const res = { status: null, cabecalhos: {}, headersSent: false, setHeader(k, v) { this.cabecalhos[k.toLowerCase()] = v; },
    writeHead(s) { this.status = s; this.headersSent = true; }, end() {} };
  await roteador.atender(req, res);
  return { status: res.status, allow: res.cabecalhos.allow ?? null };
}

test('todo método de escrita em toda rota do app recusa sem sessão, sem ler corpo nem chamar serviço', async () => {
  const caminhos = await caminhosDoCodigo();
  for (const esperado of ['/api/orquestracao/frota/preparar', '/api/orquestracao/frota/confirmar', '/api/chaves/confirmar', '/api/hangar',
    '/api/orquestracao/despacho/confirmar', '/api/orquestracao/vigilia/confirmar', '/api/orquestracao/voz/transcrever', '/api/contas/convites']) {
    assert.ok(caminhos.includes(esperado), `a varredura precisa achar ${esperado}`);
  }
  assert.ok(!caminhos.some(c => c.startsWith('/api/orquestracao/modelos')), 'o perfil por carta saiu na F2');
  for (const esperado of ['/api/projetos/x/docs', '/api/projetos/x/git']) assert.ok(caminhos.includes(esperado), `prefixo não expandido: ${esperado}`);
  const privilegiadas = [];
  for (const caminho of caminhos) {
    for (const metodo of METODOS) {
      if (EXCECOES.has(`${metodo} ${caminho}`)) continue;
      const { roteador, chamadas, leituras } = montar();
      const { status, allow } = await pedir(roteador, metodo, caminho);
      const ok = caminho.startsWith('/api/contas/') ? [401, 404] : [401, 405];
      assert.ok(ok.includes(status), `${metodo} ${caminho} respondeu ${status} sem sessão`);
      if (status === 405) assert.ok(allow, `${metodo} ${caminho}: 405 sem cabeçalho Allow`);
      assert.deepEqual(chamadas, [], `${metodo} ${caminho} chamou serviço antes da sessão`);
      assert.equal(leituras(), 0, `${metodo} ${caminho} leu o corpo antes da sessão`);
      if (status === 401) privilegiadas.push(`${metodo} ${caminho}`);
    }
  }
  // N5: toda escrita da aba Contas pede sessão (401), uma a uma, gerada da tabela fechada.
  for (const r of ROTAS_CONTAS.filter(x => x.metodo !== 'GET')) {
    assert.ok(privilegiadas.includes(`${r.metodo} ${exemplo(r.padrao)}`), `escrita de Contas sem SSO: ${r.metodo} ${exemplo(r.padrao)}`);
  }
  assert.ok(privilegiadas.length >= 20, `rotas privilegiadas varridas: ${privilegiadas.join(', ')}`);
  assert.ok(privilegiadas.filter(p => !p.includes('/api/contas/')).every(p => p.startsWith('POST ')), 'fora de Contas só POST chega à sessão');
});

test('HEAD continua 200 nos handlers só-leitura (a guarda trata HEAD como seguro)', async () => {
  for (const caminho of ['/api/hangar', '/api/hangar/sessoes', '/api/projetos', '/api/projetos/x/docs', '/api/producao', '/api/backlog', '/api/decisoes', '/api/relacoes', '/api/alinhamento']) {
    const { roteador } = montar();
    assert.equal((await pedir(roteador, 'HEAD', caminho)).status, 200, caminho);
  }
});

test('N5: com sessão SSO a escrita de Contas segue para o CadastroUnico; sem ela, nem o corpo é lido', async () => {
  const chamadas = [];
  const resposta = new RespostaHttp({ publico: path.join(import.meta.dirname, '..', 'publico'), maxCorpo: 64 * 1024 });
  const contas = criarManipuladorContas({ cliente: { chamar: async (operacao) => { chamadas.push(operacao); return { status: 200, corpo: { ok: true } }; } } });
  const painel = (autorizarContas) => new RoteadorPainel({ porta: 7777, recusa: criarGuarda(7777), resposta,
    conversa: { atender: async () => {} }, voz: { tentar: async () => false }, orquestracao: { tentar: async () => false },
    alinhamento: { tentar: async () => false }, chaves: { tentar: async () => false },
    painel: new RotasPainel({ resposta, coletores: {}, ssh: {}, contas, autorizarContas }) });
  assert.equal((await pedir(painel(async () => ({ usuarioId: '1', sessaoHash: 'a'.repeat(64) })), 'POST', '/api/contas/usuarios/5/reativar')).status, 200);
  assert.deepEqual(chamadas, ['reativarUsuario']);
  assert.equal((await pedir(painel(undefined), 'POST', '/api/contas/usuarios/5/reativar')).status, 503, 'sem autorizador configurado falha fechada');
  assert.deepEqual(chamadas, ['reativarUsuario']);
});
