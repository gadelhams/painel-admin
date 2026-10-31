// Varre as rotas do próprio app (regra 6 do padrão geral) pelo painel MONTADO de produção
// (montagem.js, PAINEL-17): guarda, famílias, autorizador SSO e APIs de duas ações de verdade;
// só as portas externas (ssh, Plane, SSO, LLM, voz, CLI, coletores) são espiões. Todo caminho
// /api/ citado em http/, em montagem.js e na tabela da aba Contas recebe POST, PUT, PATCH e
// DELETE pela borda, de mesma origem e sem sessão. Rota que muda estado responde 401 sem ler o
// corpo, sem tocar porta externa e sem gravar no estado; rota que não aceita o método responde
// 405 no próprio handler. O que foge disso está na lista abaixo, rota a rota e com o motivo.
// Rota nova entra sozinha. Mutação nomeada: registrar na montagem uma rota POST sem autorizador
// deixa vermelho "todo método de escrita…".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ROTAS_CONTAS } from '../contas.js';
import { montarComFalsos, cabecalhosDaBorda } from './painel-falso.js';

const RAIZ = path.join(import.meta.dirname, '..');
const HTTP = path.join(RAIZ, 'http');
const METODOS = ['POST', 'PUT', 'PATCH', 'DELETE'];
// Exceções, "MÉTODO caminho" → motivo. Desde a N5 (29/10/2026) as escritas da aba Contas
// exigem SSO e não são mais exceção.
const EXCECOES = new Map([
  ['POST /api/orquestracao/simular', 'prévia sem lease, processo ou escrita no Plane'],
  ['POST /api/conversa', 'roda pelo login da CLI (assinatura) com ferramentas só de leitura; aberto por decisão do dono (29/10/2026)'],
  ['POST /api/diagnostico/voz', 'telemetria do microfone no log local; não muda estado nem gasta API'],
  // F4 item 9 (31/10/2026): sem SSO por decisão do contrato — quem reserva é o agente local, sem
  // cookie. Fecha por Host/endereço de loopback, sem cabeçalho de navegador, e pelo processo do
  // socket conferido no /proc como descendente de claude/codex; a prova própria está em
  // test/reservas.test.js (a borda é recusada com 403 sem ler o corpo nem gravar estado).
  ['POST /api/orquestracao/reservas', 'reserva de carta pelo agente local (scripts/reservar.mjs): loopback + processo conferido no /proc, sem SSO por decisão do contrato da F4'],
]);

const exemplo = padrao => padrao.source.replace(/^\^\\\//, '/').replace(/\$$/, '').replaceAll('\\/', '/').replaceAll('([^/]+)', '1');

async function caminhosDoCodigo() {
  const caminhos = new Set();
  const arquivos = [...(await fs.readdir(HTTP)).filter(n => n.endsWith('.js')).map(n => path.join(HTTP, n)),
    path.join(RAIZ, 'montagem.js'), path.join(RAIZ, 'servidor.js')];
  for (const arquivo of arquivos) {
    const texto = await fs.readFile(arquivo, 'utf8');
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

// Um diretório vazio no começo; a recusa não pode deixar nada gravado nele.
async function arvore(dir) {
  const saida = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) saida.push(path.join(e.parentPath, e.name));
  return saida.sort();
}

// O pior caso que passa pela guarda e pela origem privilegiada: borda, mesma origem, tipo
// certo (áudio na transcrição) e sem cookie. O corpo é um gerador: lê-lo deixa marca.
async function pedir(painel, metodo, caminho, { sessao = false } = {}) {
  let lido = false;
  const tipo = caminho.endsWith('/voz/transcrever') ? 'audio/webm' : 'application/json';
  const req = Object.assign(Readable.from((function* () { lido = true; yield Buffer.from('{}'); })()),
    { method: metodo, url: caminho, headers: cabecalhosDaBorda({ tipo, sessao }) });
  const res = { status: null, cabecalhos: {}, headersSent: false, setHeader(k, v) { this.cabecalhos[k.toLowerCase()] = v; },
    writeHead(s) { this.status = s; this.headersSent = true; }, end() {} };
  await painel.atender(req, res);
  return { status: res.status, allow: res.cabecalhos.allow ?? null, lido };
}

test('todo método de escrita em toda rota do app recusa sem sessão, sem ler corpo, tocar porta externa nem gravar estado', async () => {
  const caminhos = await caminhosDoCodigo();
  for (const esperado of ['/api/orquestracao/frota/preparar', '/api/orquestracao/frota/confirmar', '/api/chaves/confirmar', '/api/hangar',
    '/api/orquestracao/despacho/confirmar', '/api/orquestracao/play/preparar', '/api/orquestracao/play/confirmar', '/api/orquestracao/play', '/api/orquestracao/zelador', '/api/orquestracao/nativo/preparar', '/api/orquestracao/nativo/confirmar', '/api/orquestracao/voz/transcrever', '/api/contas/convites', '/api/acoes/preparar', '/api/acoes/confirmar',
    '/api/hangar/encomendas', '/api/hangar/encomendas/preparar', '/api/hangar/encomendas/confirmar',
    '/api/decisao/preparar', '/api/decisao/confirmar', '/api/decisao/retomada/preparar', '/api/decisao/retomada/confirmar', '/api/decisao/carta', '/api/decisao/pendentes',
    '/api/c3po/memoria', '/api/c3po/memoria/preparar', '/api/c3po/memoria/confirmar', '/api/orquestracao/reservas']) {
    assert.ok(caminhos.includes(esperado), `a varredura precisa achar ${esperado}`);
  }
  assert.ok(!caminhos.some(c => c.startsWith('/api/orquestracao/modelos')), 'o perfil por carta saiu na F2');
  assert.ok(!caminhos.some(c => c.includes('vigilia')), 'o toggle da vigília saiu na F3: o play da nave o substitui');
  for (const esperado of ['/api/projetos/x/docs', '/api/projetos/x/git']) assert.ok(caminhos.includes(esperado), `prefixo não expandido: ${esperado}`);
  const privilegiadas = [];
  const { painel, chamadas, diretorio, limpar } = await montarComFalsos();
  const estadoInicial = await arvore(diretorio);
  try {
  for (const caminho of caminhos) {
    for (const metodo of METODOS) {
      if (EXCECOES.has(`${metodo} ${caminho}`)) continue;
      chamadas.length = 0;
      const { status, allow, lido } = await pedir(painel, metodo, caminho);
      const ok = caminho.startsWith('/api/contas/') ? [401, 404] : [401, 405];
      assert.ok(ok.includes(status), `${metodo} ${caminho} respondeu ${status} sem sessão`);
      if (status === 405) assert.ok(allow, `${metodo} ${caminho}: 405 sem cabeçalho Allow`);
      assert.deepEqual(chamadas, [], `${metodo} ${caminho} tocou porta externa antes da sessão`);
      assert.equal(lido, false, `${metodo} ${caminho} leu o corpo antes da sessão`);
      if (status === 401) privilegiadas.push(`${metodo} ${caminho}`);
    }
  }
  assert.deepEqual(await arvore(diretorio), estadoInicial, 'a varredura sem sessão gravou no estado');
  } finally { await limpar(); }
  // N5: toda escrita da aba Contas pede sessão (401), uma a uma, gerada da tabela fechada.
  for (const r of ROTAS_CONTAS.filter(x => x.metodo !== 'GET')) {
    assert.ok(privilegiadas.includes(`${r.metodo} ${exemplo(r.padrao)}`), `escrita de Contas sem SSO: ${r.metodo} ${exemplo(r.padrao)}`);
  }
  assert.ok(privilegiadas.length >= 20, `rotas privilegiadas varridas: ${privilegiadas.join(', ')}`);
  assert.ok(privilegiadas.filter(p => !p.includes('/api/contas/')).every(p => p.startsWith('POST ')), 'fora de Contas só POST chega à sessão');
  for (const p of ['POST /api/orquestracao/play/preparar', 'POST /api/orquestracao/play/confirmar']) assert.ok(privilegiadas.includes(p), `${p} sem SSO`);
});

test('HEAD continua 200 nos handlers só-leitura (a guarda trata HEAD como seguro)', async () => {
  // A varredura de alinhamento é real: a semente do cache evita git e check-docs de verdade.
  const { painel, limpar } = await montarComFalsos({ sementes: { 'alinhamento.json': { resultado: { projetos: [] }, fios: {} } } });
  try {
    for (const caminho of ['/api/hangar', '/api/hangar/sessoes', '/api/hangar/encomendas', '/api/projetos', '/api/projetos/x/docs', '/api/producao', '/api/backlog', '/api/decisoes', '/api/relacoes', '/api/alinhamento', '/api/decisao/pendentes']) {
      assert.equal((await pedir(painel, 'HEAD', caminho)).status, 200, caminho);
    }
  } finally { await limpar(); }
});

test('N5: com sessão SSO a escrita de Contas segue para o CadastroUnico; sem ela, nem o corpo é lido; sem dono configurado, 503', async () => {
  const ssh = [];
  const executarSsh = async (args, stdin) => { ssh.push({ comando: args.at(-1), stdin }); return { codigo: 0, stdout: '{"ok":true}\n200', stderr: '' }; };
  const montado = await montarComFalsos({ externos: { executarSsh } });
  const semDono = await montarComFalsos({ ambiente: {}, externos: { executarSsh } });
  try {
    const semSessao = await pedir(montado.painel, 'POST', '/api/contas/usuarios/5/reativar');
    assert.deepEqual({ status: semSessao.status, lido: semSessao.lido }, { status: 401, lido: false });
    assert.deepEqual(ssh, []);
    const comSessao = await pedir(montado.painel, 'POST', '/api/contas/usuarios/5/reativar', { sessao: true });
    assert.deepEqual({ status: comSessao.status, lido: comSessao.lido }, { status: 200, lido: true });
    assert.equal(ssh.length, 1);
    assert.match(ssh[0].comando, / -X POST http:\/\/127\.0\.0\.1:8790\/interno\/usuarios\/5\/reativar /);
    const fechado = await pedir(semDono.painel, 'POST', '/api/contas/usuarios/5/reativar', { sessao: true });
    assert.deepEqual({ status: fechado.status, lido: fechado.lido }, { status: 503, lido: false }, 'sem ORQ_OWNER_USER_ID falha fechada');
    assert.equal(ssh.length, 1);
  } finally { await montado.limpar(); await semDono.limpar(); }
});
