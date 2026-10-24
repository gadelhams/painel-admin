// Executor real com CLIs falsas: flags exatas, ambiente limpo, isolamento por worktree,
// timeout que mata o processo, e os três desfechos. Nenhuma CLI paga, rede ou Plane real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { criarExecutorCli, validarScriptNpm, ambienteLimpo } from '../orquestrador/executor-cli.js';
import { prepararPlanoExecucao } from '../orquestrador/modelos.js';
import { validarHandoff } from '../orquestrador/handoff-plane.js';

const run = promisify(execFile);
const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'executor-cli');
const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const contrato = {
  versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline',
  tiposTeste: ['unitário'], criteriosAceite: ['scripts/ok.mjs sai 0', 'sem rede'], acoesProibidas: ['deploy', 'ssh'],
  comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }, { id: 'script', executavel: 'node', argumentos: ['scripts/ok.mjs'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', esforcos: ['high', 'max'], disponivel: true },
    { id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', esforcos: ['xhigh', 'max'], disponivel: true }],
};
const selecoes = (o, d, v) => ({ orquestracao: o, codificacao_testes: d, validacao: v });
const CLAUDE = { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' };
const OPENAI = { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' };
const carta = { identificador: 'PAINEL-99', id: CARTA, projetoId: PROJETO, gate: 'READY TO DEV', labels: ['READY TO DEV'] };
const consultar = async url => {
  if (url === `/projects/${PROJETO}/work-items/${CARTA}/`) return { id: CARTA, name: 'Trabalho de teste', description_html: '<p>Fazer <b>algo</b> útil.</p><p>Sem dependências.</p>', labels: [{ name: 'READY TO DEV' }] };
  throw Error(url);
};

async function ambiente({ testeScript = 'node scripts/ok.mjs', controle = null, binariosExtra = {}, limites = {}, comLock = false } = {}) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-exec-'));
  const bin = path.join(raiz, 'bin');
  await fs.cp(FIXTURES, bin, { recursive: true });
  if (controle) await fs.writeFile(path.join(bin, 'controle.json'), JSON.stringify(controle));
  const repo = path.join(raiz, 'projeto');
  await fs.mkdir(path.join(repo, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'p', scripts: { test: testeScript } }));
  await fs.writeFile(path.join(repo, 'scripts', 'ok.mjs'), 'process.exit(0);\n');
  await fs.writeFile(path.join(repo, 'scripts', 'falha.mjs'), 'console.error("quebrou"); process.exit(1);\n');
  await fs.writeFile(path.join(repo, 'scripts', 'perigoso.mjs'), 'import { execSync } from "node:child_process"; execSync("ssh host");\n');
  if (comLock) await fs.writeFile(path.join(repo, 'package-lock.json'), '{}');
  const g = (...a) => run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo });
  await g('init', '-q', '-b', 'main'); await g('add', '-A'); await g('commit', '-q', '-m', 'inicial');
  const estado = path.join(raiz, 'estado');
  const executor = criarExecutorCli({ diretorioEstado: estado, consultar,
    binarios: { claude: path.join(bin, 'claude-falso.mjs'), codex: path.join(bin, 'codex-falso.mjs'), npm: path.join(bin, 'npm-falso.mjs'), ...binariosExtra },
    ambienteBase: { ...process.env, PLANE_API_KEY: 'segredo-que-nao-pode-vazar', XAI_API_KEY: 'outro' },
    limites: { minutosIa: 0.5, minutosComando: 0.5, minutosInstalacao: 0.5, ...limites },
    licoesVivasDir: path.join(raiz, 'sem-licoes') });
  // Os scripts falsos são .mjs: executáveis via shebang não dá, então o "binário" é o node com o script. O executor
  // aceita caminho absoluto; aqui envolvemos cada script num lançador executável.
  for (const nome of ['claude-falso', 'codex-falso', 'npm-falso', 'dormente']) {
    const lancador = path.join(bin, nome);
    await fs.writeFile(lancador, `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, `${nome}.mjs`)}" "$@"\n`, { mode: 0o755 });
  }
  const registros = async () => Promise.all((await fs.readdir(bin)).filter(f => f.startsWith('registro-')).sort()
    .map(async f => JSON.parse(await fs.readFile(path.join(bin, f), 'utf8'))));
  return { raiz, bin, repo, estado, registros, limpar: () => fs.rm(raiz, { recursive: true, force: true }),
    executor: criarExecutorCli({ diretorioEstado: estado, consultar,
      binarios: { claude: path.join(bin, 'claude-falso'), codex: path.join(bin, 'codex-falso'), npm: path.join(bin, 'npm-falso'), ...binariosExtra },
      ambienteBase: { ...process.env, PLANE_API_KEY: 'segredo-que-nao-pode-vazar', XAI_API_KEY: 'outro' },
      limites: { minutosIa: 0.5, minutosComando: 0.5, minutosInstalacao: 0.5, ...limites },
      licoesVivasDir: path.join(raiz, 'sem-licoes') }), executorSemLancador: executor };
}
const pedido = (a, plano, extra = {}) => ({ carta: carta.identificador, cartaId: CARTA, projetoId: PROJETO, versaoCarta: 'v1',
  comandoId: 'testes', comando: contrato.comandos[0], plano, contrato, gate: 'READY TO DEV', perfilComentarioId: randomUUID(),
  pasta: a.repo, tentativaId: randomUUID(), ...extra });

test('ambiente dos filhos é lista branca: chaves do Painel não passam, CI e NO_COLOR entram', () => {
  const env = ambienteLimpo({ PATH: '/x', HOME: '/h', PLANE_API_KEY: 's', ORQ_OWNER_USER_ID: '1', MISE_SHELL: 'bash', SEGREDO_TOKEN: 'y' });
  assert.deepEqual(env, { PATH: '/x', HOME: '/h', MISE_SHELL: 'bash', CI: '1', NO_COLOR: '1' });
});

test('gramática do scripts.test: aceita encadeamento de testes, recusa shell, proibidos e npm run desconhecido', () => {
  assert.equal(validarScriptNpm({ test: 'vitest run && node scripts/check-docs.mjs' }), 'vitest run && node scripts/check-docs.mjs');
  assert.equal(validarScriptNpm({ test: 'npm run unit && npm run docs', unit: 'node --test "test/**/*.test.js"', docs: 'python3 scripts/check_docs.py' }).length > 0, true);
  assert.throws(() => validarScriptNpm({ test: 'node --test | tee saida' }), /metacaractere/);
  assert.throws(() => validarScriptNpm({ test: 'node scripts/x.mjs && ssh host' }), /proibido: ssh/);
  assert.throws(() => validarScriptNpm({ test: 'bash scripts/x.sh' }), /não permitido: bash/);
  assert.throws(() => validarScriptNpm({ test: 'npm run nada' }), /sem scripts.nada/);
  assert.throws(() => validarScriptNpm({ test: 'npm run a', a: 'npm run b', b: 'npm run c', c: 'npm run d', d: 'npm run a' }), /três níveis/);
});

test('validar aceita o cenário bom e recusa: sem git, binário ausente, scripts.test perigoso, script com token proibido, modelo fora do contrato', async () => {
  const a = await ambiente();
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, OPENAI, CLAUDE));
    const ok = await a.executor.validar({ pasta: a.repo, contrato, comando: contrato.comandos[0], plano, carta });
    assert.match(ok.inspecao, /npm test → node scripts\/ok.mjs/);
    const semGit = await fs.mkdtemp(path.join(a.raiz, 'semgit-'));
    await assert.rejects(a.executor.validar({ pasta: semGit, contrato, comando: contrato.comandos[0], plano, carta }), /sem repositório git/);
    const semCodex = criarExecutorCli({ diretorioEstado: a.estado, consultar, binarios: { claude: path.join(a.bin, 'claude-falso'), codex: '/nao/existe/codex' } });
    await assert.rejects(semCodex.validar({ pasta: a.repo, contrato, comando: contrato.comandos[0], plano, carta }), /binário indisponível: codex/);
    await fs.writeFile(path.join(a.repo, 'package.json'), JSON.stringify({ scripts: { test: 'node scripts/ok.mjs | cat' } }));
    await assert.rejects(a.executor.validar({ pasta: a.repo, contrato, comando: contrato.comandos[0], plano, carta }), /metacaractere/);
    await assert.rejects(a.executor.validar({ pasta: a.repo, contrato, comando: { id: 'x', executavel: 'node', argumentos: ['scripts/perigoso.mjs'] }, plano, carta }), /token proibido: ssh/);
    const semOpenai = { ...contrato, agentes: [contrato.agentes[0]] };
    assert.throws(() => prepararPlanoExecucao(semOpenai, selecoes(CLAUDE, OPENAI, CLAUDE)), /não permitido/);
    const indisponivel = { ...contrato, agentes: [contrato.agentes[0], { ...contrato.agentes[1], disponivel: false }] };
    await assert.rejects(a.executor.validar({ pasta: a.repo, contrato: indisponivel, comando: contrato.comandos[0], plano, carta }), /indisponível.*sem fallback/);
  } finally { await a.limpar(); }
});

test('execução completa: três papéis com flags exatas, prompt com a carta, worktree isolado, commit no ramo e árvore principal intacta → concluido', async () => {
  const a = await ambiente();
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, OPENAI, CLAUDE));
    const p = pedido(a, plano);
    const r = await a.executor.executar(p);
    assert.equal(r.resultado, 'concluido', JSON.stringify(r));
    validarHandoff({ papel: 'orquestracao', tentativaId: p.tentativaId, resultado: r.resultado, resumo: r.resumo, evidencia: r.evidencia });
    const regs = await a.registros();
    assert.deepEqual(regs.map(x => x.papel), ['orquestracao', 'codificacao_testes', 'validacao']);
    const worktree = path.join(a.estado, 'worktrees', `PAINEL-99-${p.tentativaId.slice(0, 8)}`);
    const [orq, dev, val] = regs;
    assert.deepEqual(orq.argv, ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--model', 'claude-opus-5', '--effort', 'max', '--bare',
      '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--disable-slash-commands',
      '--max-turns', '60', '--max-budget-usd', '15', '--restricted', '--allowedTools', 'Read', 'Glob', 'Grep', 'LS']);
    assert.deepEqual(dev.argv, ['exec', '-C', worktree, '--sandbox', 'workspace-write', '--color', 'never', '--ignore-user-config', '--ignore-rules',
      '--ephemeral', '--skip-git-repo-check', '-o', path.join(a.estado, 'saidas', p.tentativaId, 'codificacao_testes.ultima.md'),
      '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort="xhigh"', '-']);
    assert.equal(val.argv.includes('--restricted'), true);
    for (const reg of regs) {
      assert.equal(reg.cwd, worktree);
      assert.equal('PLANE_API_KEY' in reg.env, false);
      assert.equal('XAI_API_KEY' in reg.env, false);
      assert.equal(reg.env.CI, '1');
      assert.match(reg.stdin, /PAINEL-99/);
      assert.match(reg.stdin, /Trabalho de teste/);
    }
    assert.match(orq.stdin, /Fazer algo útil\./);
    assert.match(orq.stdin, /scripts\/ok\.mjs sai 0/);
    assert.match(dev.stdin, /Briefing\/relatório falso do papel orquestracao/);
    assert.match(val.stdin, /VEREDITO: APROVADO/);
    assert.match(val.stdin, /alteracao-da-ia\.txt/);
    const { stdout: ramos } = await run('git', ['branch', '--list', `orq/painel-99-${p.tentativaId.slice(0, 8)}`], { cwd: a.repo });
    assert.match(ramos, /orq\/painel-99/);
    const { stdout: log } = await run('git', ['log', '--oneline', '-1'], { cwd: worktree });
    assert.match(log, /ORQ PAINEL-99: tentativa/);
    assert.equal((await run('git', ['status', '--porcelain'], { cwd: a.repo })).stdout.trim(), '');
    assert.equal(await fs.access(path.join(a.repo, 'alteracao-da-ia.txt')).then(() => true, () => false), false);
    assert.match(r.evidencia.join('\n'), /commit [0-9a-f]{7} \(1 arquivo\)/);
    assert.match(r.evidencia.join('\n'), /comando testes \(npm test\): código 0/);
    assert.match(r.evidencia.join('\n'), /VEREDITO: APROVADO/);
    const planoGravado = JSON.parse(await fs.readFile(path.join(a.estado, 'saidas', p.tentativaId, 'plano.json'), 'utf8'));
    assert.equal(JSON.stringify(planoGravado).includes('segredo'), false);
  } finally { await a.limpar(); }
});

test('comando de aceite que falha → rejeitado; veredito REPROVADO → rejeitado; sem alterações não há commit', async () => {
  const a = await ambiente();
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    // O comando de aceite roda de verdade (node do PATH), sem npm falso no meio.
    const r = await a.executor.executar(pedido(a, plano, { comandoId: 'script', comando: { id: 'script', executavel: 'node', argumentos: ['scripts/falha.mjs'] } }));
    assert.equal(r.resultado, 'rejeitado');
    assert.match(r.evidencia.join('\n'), /código 1/);
    assert.match(r.resumo, /comando script falhou/);
    assert.match(await fs.readFile(path.join(a.estado, 'saidas', (await a.registros())[0] && (await fs.readdir(path.join(a.estado, 'saidas')))[0], 'comando-script.log'), 'utf8'), /quebrou/);
  } finally { await a.limpar(); }
  const b = await ambiente({ controle: { veredito: 'REPROVADO', escrever: false } });
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    const r = await b.executor.executar(pedido(b, plano));
    assert.equal(r.resultado, 'rejeitado');
    assert.match(r.evidencia.join('\n'), /VEREDITO: REPROVADO/);
    assert.match(r.evidencia.join('\n'), /sem alterações/);
    assert.match(r.resumo, /comando testes passou/);
  } finally { await b.limpar(); }
});

test('timeout do papel mata o processo e devolve impedido; limite de uso do provedor devolve impedido', async () => {
  const a = await ambiente({ binariosExtra: {}, limites: { minutosIa: 0.01 } });
  try {
    const dormente = criarExecutorCli({ diretorioEstado: a.estado, consultar, binarios: { claude: path.join(a.bin, 'dormente'), codex: path.join(a.bin, 'codex-falso'), npm: path.join(a.bin, 'npm-falso') },
      ambienteBase: process.env, limites: { minutosIa: 0.01, minutosComando: 0.5 } });
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    const r = await dormente.executar(pedido(a, plano));
    assert.equal(r.resultado, 'impedido');
    assert.match(r.resumo, /excedeu .* min/);
    await new Promise(res => setTimeout(res, 5500));
    assert.equal(await fs.access(path.join(a.bin, 'sobrevivi')).then(() => true, () => false), false, 'processo deveria ter sido morto');
  } finally { await a.limpar(); }
  const b = await ambiente({ controle: { limite: true } });
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    const r = await b.executor.executar(pedido(b, plano));
    assert.equal(r.resultado, 'impedido');
    assert.match(r.resumo, /limite de uso do provedor claude/);
    assert.equal((await b.registros()).length, 1, 'para no primeiro papel');
  } finally { await b.limpar(); }
});

test('package-lock sem node_modules instala com npm ci --ignore-scripts no worktree; falha de instalação impede', async () => {
  const a = await ambiente({ comLock: true });
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    const p = pedido(a, plano);
    const r = await a.executor.executar(p);
    assert.equal(r.resultado, 'concluido', JSON.stringify(r));
    const npm = JSON.parse(await fs.readFile(path.join(a.bin, 'npm-ci.json'), 'utf8'));
    assert.deepEqual(npm.argv, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(npm.cwd, path.join(a.estado, 'worktrees', `PAINEL-99-${p.tentativaId.slice(0, 8)}`));
    assert.match(r.evidencia.join('\n'), /npm ci --ignore-scripts/);
  } finally { await a.limpar(); }
  const b = await ambiente({ comLock: true, binariosExtra: { npm: '/nao/existe/npm' } });
  try {
    const plano = prepararPlanoExecucao(contrato, selecoes(CLAUDE, CLAUDE, CLAUDE));
    const r = await b.executor.executar(pedido(b, plano));
    assert.equal(r.resultado, 'impedido');
    assert.match(r.resumo, /binário indisponível: npm/);
  } finally { await b.limpar(); }
});
