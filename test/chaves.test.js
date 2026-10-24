// Tela Chaves: só nomes saem; valor só entra pela confirmação; escrita local atômica 0600;
// servidor por ssh falso com valor no stdin; portão SSO. Nada toca .env reais.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CATALOGO, validarCatalogo, criarServicoChaves, criarConfirmacoesChaves, criarApiChaves } from '../chaves.js';
import { ErroAcesso } from '../orquestrador/sso.js';

const identidade = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };
const catalogo = [
  { projeto: 'painel-admin', local: { arquivo: 'painel-admin/.env', unit: 'painel-admin', descobrir: true }, chaves: [
    { nome: 'ELEVENLABS_API_KEY', descricao: 'voz' },
    { nome: 'XAI_API_KEY', descricao: 'voz xAI', rotacao: { pendente: true, desde: '2026-10-01', card: 'PAINEL-99', motivo: 'teste', depois: 'nada' } } ] },
  { projeto: 'CadastroUnico', servidor: { candidatos: ['/opt/conta-astargne/.env', '/opt/conta-astargne/current/.env'], unit: 'conta-astargne', aviso: 'queda de 1 a 3 s', descobrir: true }, chaves: [
    { nome: 'BREVO_API_KEY', descricao: 'e-mail', rotacao: { pendente: true, desde: '2026-09-30', card: 'CAD-18', motivo: 'colada no chat' } },
    { nome: 'TOKEN_INTERNO', descricao: 'bearer', bloqueado: 'derruba player e fliperama' },
    { nome: 'DATABASE_URL', descricao: 'pg', depois: 'ALTER USER no Postgres' } ],
    foraDoEnv: [{ nome: 'senha do painel da Brevo', rotacao: { pendente: true, desde: '2026-09-30', card: 'CAD-18b', motivo: 'x' } }] },
];

async function ambiente({ ssh = null, escritaServidor = false } = {}) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'chaves-'));
  await fs.mkdir(path.join(raiz, 'painel-admin'));
  await fs.writeFile(path.join(raiz, 'painel-admin', '.env'), 'ELEVENLABS_API_KEY=antigo-123\nOUTRA=1\n', { mode: 0o600 });
  const spawns = [];
  const chamadasSsh = [];
  const executar = async (args, stdin) => { chamadasSsh.push({ args, stdin }); return ssh ? ssh(args, stdin) : { codigo: 255, stdout: '', stderr: 'sem ssh' }; };
  let tempo = Date.parse('2026-10-24T12:00:00Z');
  const servico = criarServicoChaves({ catalogo, raiz, diretorioEstado: path.join(raiz, 'estado'), executar, escritaServidorHabilitada: escritaServidor,
    agora: () => tempo, spawn: (cmd, args) => { spawns.push([cmd, ...args]); return { unref() {} }; }, log: () => {} });
  return { raiz, servico, spawns, chamadasSsh, avancar: ms => { tempo += ms; }, limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}

test('catálogo real é válido: caminhos relativos, units e nomes dentro do padrão, rotações com card e data', () => {
  assert.deepEqual(validarCatalogo(CATALOGO), []);
  assert.ok(CATALOGO.some(p => p.chaves.some(c => c.rotacao?.card === 'CAD-18')));
  assert.match(validarCatalogo([{ projeto: 'x', local: { arquivo: '/abs/.env' } }]).join(' '), /relativo/);
  assert.match(validarCatalogo([{ projeto: 'x', servidor: { candidatos: ['/etc/passwd'], unit: 'x' } }]).join(' '), /fora do padrão/);
});

test('inventário local só traz nomes, presença, modo e rotação pendente; nunca valores', async () => {
  const a = await ambiente();
  try {
    const inv = await a.servico.inventario();
    const painel = inv.projetos.find(p => p.projeto === 'painel-admin');
    assert.deepEqual(painel.local.nomes, ['ELEVENLABS_API_KEY', 'OUTRA']);
    assert.equal(painel.local.modo, '600');
    assert.equal(painel.chaves.find(c => c.nome === 'ELEVENLABS_API_KEY').local, 'presente');
    assert.equal(painel.chaves.find(c => c.nome === 'XAI_API_KEY').local, 'ausente');
    assert.deepEqual(painel.extras, ['OUTRA']);
    assert.equal(JSON.stringify(inv).includes('antigo-123'), false, 'valor nunca sai');
    assert.deepEqual(inv.pendentes.map(p => p.card).sort(), ['CAD-18', 'CAD-18b', 'PAINEL-99']);
    const cad = inv.projetos.find(p => p.projeto === 'CadastroUnico');
    assert.equal(cad.servidor.lido, false);
    assert.equal(cad.chaves[0].servidor, 'não lido');
  } finally { await a.limpar(); }
});

test('troca local: escrita atômica 0600 com cópia .bak, evento sem valor, reinício agendado da unit, pendência some', async () => {
  const a = await ambiente();
  try {
    const dados = await a.servico.preparar({ projeto: 'painel-admin', nome: 'XAI_API_KEY', alvo: 'local' });
    assert.match(dados.aviso, /painel-admin\/\.env/);
    const r = await a.servico.confirmar({ projeto: 'painel-admin', nome: 'XAI_API_KEY', alvo: 'local' }, 'novo-valor-xai', '1');
    assert.equal(r.reinicia, 'painel-admin');
    const arquivo = path.join(a.raiz, 'painel-admin', '.env');
    assert.equal(await fs.readFile(arquivo, 'utf8'), 'ELEVENLABS_API_KEY=antigo-123\nOUTRA=1\nXAI_API_KEY=novo-valor-xai\n');
    assert.equal(((await fs.stat(arquivo)).mode & 0o777).toString(8), '600');
    const bak = (await fs.readdir(path.join(a.raiz, 'painel-admin'))).find(f => f.startsWith('.env.bak-'));
    assert.ok(bak); assert.equal(((await fs.stat(path.join(a.raiz, 'painel-admin', bak))).mode & 0o777).toString(8), '600');
    await a.servico.confirmar({ projeto: 'painel-admin', nome: 'ELEVENLABS_API_KEY', alvo: 'local' }, 'trocado', '1');
    assert.match(await fs.readFile(arquivo, 'utf8'), /^ELEVENLABS_API_KEY=trocado\n/);
    const eventos = await fs.readFile(path.join(a.raiz, 'estado', 'chaves.jsonl'), 'utf8');
    assert.equal(eventos.includes('novo-valor-xai') || eventos.includes('trocado'), false, 'evento nunca leva valor');
    assert.equal((eventos.match(/ROTACIONADA/g) ?? []).length, 2);
    await new Promise(r => setTimeout(r, 1100));
    assert.deepEqual(a.spawns[0], ['systemctl', '--user', 'restart', 'painel-admin']);
    const inv = await a.servico.inventario();
    assert.deepEqual(inv.pendentes.map(p => p.card).sort(), ['CAD-18', 'CAD-18b'], 'XAI rotacionada deixa de estar pendente');
    await assert.rejects(a.servico.confirmar({ projeto: 'painel-admin', nome: 'XAI_API_KEY', alvo: 'local' }, 'com\nquebra', '1'), /valor inválido/);
    await assert.rejects(a.servico.preparar({ projeto: 'painel-admin', nome: 'ELEVENLABS_API_KEY', alvo: 'servidor' }), /sem \.env no servidor/);
    await assert.rejects(a.servico.preparar({ projeto: 'CadastroUnico', nome: 'OUTRA', alvo: 'servidor' }), /não catalogada/);
  } finally { await a.limpar(); }
});

test('servidor: inventário por ssh só com nomes; troca exige flag, inventário prévio, valor pelo stdin e script fixo', async () => {
  const ssh = async (args, stdin) => {
    const script = args.at(-1);
    if (script.includes('ARQ ')) return { codigo: 0, stdout: 'ARQ CadastroUnico|/opt/conta-astargne/.env|600\nVAR TOKEN_INTERNO\nVAR BREVO_API_KEY\n', stderr: '' };
    assert.match(script, /^sudo python3 -c '[^']+' '\/opt\/conta-astargne\/\.env' 'BREVO_API_KEY' && sudo systemctl restart 'conta-astargne' && echo REINICIADO$/);
    assert.equal(script.includes(stdin), false, 'valor nunca entra na linha de comando');
    return { codigo: 0, stdout: 'OK\nREINICIADO\n', stderr: '' };
  };
  const desligado = await ambiente({ ssh });
  try {
    await assert.rejects(desligado.servico.preparar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }), e => e.status === 503 && /validador-deploy/.test(e.message));
  } finally { await desligado.limpar(); }
  const a = await ambiente({ ssh, escritaServidor: true });
  try {
    await assert.rejects(a.servico.preparar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }), e => e.status === 409);
    const inv = await a.servico.lerServidor();
    const cad = inv.projetos.find(p => p.projeto === 'CadastroUnico');
    assert.equal(cad.servidor.arquivo, '/opt/conta-astargne/.env');
    assert.equal(cad.chaves[0].servidor, 'presente');
    assert.equal(cad.chaves.find(c => c.nome === 'TOKEN_INTERNO').bloqueado, 'derruba player e fliperama');
    assert.match(a.chamadasSsh[0].args.at(-1), /sudo test -f '\/opt\/conta-astargne\/\.env'/);
    assert.match(a.chamadasSsh[0].args.at(-1), /grep -oE '\^\[A-Za-z_\]\[A-Za-z0-9_\]\*='/);
    const dados = await a.servico.preparar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' });
    assert.equal(dados.unit, 'conta-astargne');
    assert.match(dados.aviso, /Efeito do reinício: queda de 1 a 3 s/);
    // validador-deploy 24/10: bloqueado, descoberta e valor perigoso para compose não passam
    await assert.rejects(a.servico.preparar({ projeto: 'CadastroUnico', nome: 'TOKEN_INTERNO', alvo: 'servidor' }), e => e.status === 422 && /bloqueada/.test(e.message));
    await assert.rejects(a.servico.preparar({ projeto: 'CadastroUnico', nome: 'OUTRA_DESCOBERTA', alvo: 'servidor' }), e => e.status === 422 && /catalogue/.test(e.message));
    assert.equal((await a.servico.preparar({ projeto: 'CadastroUnico', nome: 'DATABASE_URL', alvo: 'servidor' })).depois, 'ALTER USER no Postgres');
    await assert.rejects(a.servico.confirmar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }, 'tem #comentario', '1'), e => e.status === 422);
    await assert.rejects(a.servico.confirmar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }, 'tem espaco', '1'), e => e.status === 422);
    const r = await a.servico.confirmar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }, 'xkeysib-nova', '1');
    assert.deepEqual(r, { ok: true, alvo: 'servidor', arquivo: '/opt/conta-astargne/.env', reiniciou: true });
    assert.equal(a.chamadasSsh.at(-1).stdin, 'xkeysib-nova');
    const eventos = await fs.readFile(path.join(a.raiz, 'estado', 'chaves.jsonl'), 'utf8');
    assert.equal(eventos.includes('xkeysib'), false);
    assert.equal((await a.servico.inventario()).pendentes.some(p => p.card === 'CAD-18'), false);
    // fora do .env: só registra
    await assert.rejects(a.servico.confirmar({ projeto: 'CadastroUnico', nome: 'senha do painel da Brevo', alvo: 'fora' }, 'valor', '1'), /não recebe valor/);
    assert.deepEqual(await a.servico.confirmar({ projeto: 'CadastroUnico', nome: 'senha do painel da Brevo', alvo: 'fora' }, undefined, '1'), { ok: true, alvo: 'fora' });
    assert.deepEqual((await a.servico.inventario()).pendentes.map(p => p.card), ['PAINEL-99'], 'só a pendência do painel (não rotacionada aqui) resta');
  } finally { await a.limpar(); }
});

test('API: exige sessão antes do corpo, payload fixo, valor só no confirmar e nunca ecoado; sessão alheia 403', async () => {
  const a = await ambiente();
  try {
    const confirmacoes = criarConfirmacoesChaves({ servico: a.servico });
    let leituras = 0;
    const negada = criarApiChaves({ autorizar: async () => { throw new ErroAcesso('sem sessão', 401); }, confirmacoes });
    assert.equal((await negada({ method: 'POST' }, '/api/chaves/preparar', async () => { leituras++; return '{}'; })).status, 401);
    assert.equal(leituras, 0);
    const api = criarApiChaves({ autorizar: async () => identidade, confirmacoes });
    assert.equal((await api({ method: 'POST' }, '/api/chaves/preparar', async () => JSON.stringify({ projeto: 'painel-admin', nome: 'XAI_API_KEY', alvo: 'local', valor: 'cedo' }))).status, 422, 'valor não entra no preparar');
    const p = await api({ method: 'POST' }, '/api/chaves/preparar', async () => JSON.stringify({ projeto: 'painel-admin', nome: 'XAI_API_KEY', alvo: 'local' }));
    assert.equal(p.status, 200);
    const outra = criarApiChaves({ autorizar: async () => ({ usuarioId: '2', sessaoHash: 'b'.repeat(64) }), confirmacoes });
    assert.equal((await outra({ method: 'POST' }, '/api/chaves/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId, valor: 'x' }))).status, 403);
    const c = await api({ method: 'POST' }, '/api/chaves/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId, valor: 'segredo-novo' }));
    assert.equal(c.status, 200);
    assert.equal(JSON.stringify(c.corpo).includes('segredo-novo'), false, 'resposta não ecoa o valor');
    assert.equal((await api({ method: 'POST' }, '/api/chaves/confirmar', async () => JSON.stringify({ confirmacaoId: p.corpo.confirmacaoId, valor: 'segredo-novo' }))).status, 200, 'repetição devolve o mesmo resultado sem regravar');
    assert.equal((await fs.readFile(path.join(a.raiz, 'painel-admin', '.env'), 'utf8')).split('XAI_API_KEY=').length - 1, 1);
  } finally { await a.limpar(); }
});

test('front: aba Chaves e bloco Astargne existem, sem innerHTML, e a rota de chaves vem antes do 405', async () => {
  const html = await fs.readFile(new URL('../publico/index.html', import.meta.url), 'utf8');
  const chaves = await fs.readFile(new URL('../publico/chaves.js', import.meta.url), 'utf8');
  const decisoes = await fs.readFile(new URL('../publico/decisoes.js', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../publico/app.js', import.meta.url), 'utf8');
  assert.match(html, /data-aba="chaves"/); assert.match(html, /id="aba-chaves"/); assert.match(html, /chaves\.js/);
  assert.doesNotMatch(chaves, /innerHTML/); assert.doesNotMatch(decisoes, /innerHTML/);
  assert.match(chaves, /type: 'password'/);
  assert.match(decisoes, /ASTARGNE · O QUE DEPENDE DE VOCÊ/);
  assert.match(app, /view === 'chaves'/);
});

test('servidor: dois candidatos existindo é ambíguo — nomes não se misturam e a troca para em 409', async () => {
  const ssh = async () => ({ codigo: 0, stdout: 'ARQ CadastroUnico|/opt/conta-astargne/.env|600\nVAR BREVO_API_KEY\nARQ CadastroUnico|/opt/conta-astargne/current/.env|644\nVAR SO_DO_SEGUNDO\n', stderr: '' });
  const a = await ambiente({ ssh, escritaServidor: true });
  try {
    const inv = await a.servico.lerServidor();
    const cad = inv.projetos.find(p => p.projeto === 'CadastroUnico');
    assert.equal(cad.servidor.ambiguo, true);
    assert.deepEqual(cad.servidor.nomes, ['BREVO_API_KEY']);
    assert.deepEqual(cad.servidor.outros, ['/opt/conta-astargne/current/.env']);
    await assert.rejects(a.servico.preparar({ projeto: 'CadastroUnico', nome: 'BREVO_API_KEY', alvo: 'servidor' }), e => e.status === 409 && /mais de um/.test(e.message));
  } finally { await a.limpar(); }
});

test('script remoto (python3 real): umask 077, preserva `export`, .bak 600, tmp exclusivo, sem aspas simples', async (t) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  try { await run('python3', ['--version']); } catch { t.skip('sem python3'); return; }
  const a = await ambiente({ escritaServidor: true });
  try {
    const script = a.servico.scriptTrocaServidor('/opt/conta-astargne/.env', 'BREVO_API_KEY', 'conta-astargne');
    const py = /^sudo python3 -c '([^']+)' /.exec(script)[1];
    assert.equal(py.includes("'"), false);
    const arq = path.join(a.raiz, 'remoto.env');
    await fs.writeFile(arq, 'A=1\nexport BREVO_API_KEY=velha\nB=2\n', { mode: 0o600 });
    // umask 022 como o sudo do servidor: o script tem de impor 077 sozinho; valor pelo stdin
    const { spawn } = await import('node:child_process');
    await new Promise((res, rej) => { const f = spawn('sh', ['-c', 'umask 022; exec python3 -c "$1" "$2" BREVO_API_KEY', 'sh', py, arq]); f.stdin.end('nova-xyz\n'); f.on('close', c => c === 0 ? res() : rej(new Error(`saida ${c}`))); });
    assert.equal(await fs.readFile(arq, 'utf8'), 'A=1\nexport BREVO_API_KEY=nova-xyz\nB=2\n');
    const nomes = await fs.readdir(a.raiz);
    const bak = nomes.filter(n => n.startsWith('remoto.env.bak-'));
    assert.ok(bak.length >= 1, 'cópia .bak existe');
    for (const b of bak) assert.equal(((await fs.stat(path.join(a.raiz, b))).mode & 0o777), 0o600);
    assert.equal(((await fs.stat(arq)).mode & 0o777), 0o600);
    assert.equal(nomes.some(n => n.includes('.tmp-')), false, 'tmp não sobra');
  } finally { await a.limpar(); }
});
