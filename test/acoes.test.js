// Fase 3 do C-3PO (PAINEL-2, -3, -4): leituras novas do motor e ações com portão. Nada de ssh real,
// LLM, Plane ou CLI paga: o ssh é um executor falso; os comandos são `node scripts/*.mjs` num projeto temporário.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LeituraSsh, CONSULTAS_SSH, COMANDO_SSH } from '../coletores/ssh-leitura.js';
import { LeituraGitProjeto, LEITURAS_GIT } from '../coletores/git-leitura.js';
import { criarRegistroPropostas, RecusaProposta } from '../acoes/propostas.js';
import { criarDiarioAcoes } from '../acoes/diario-acoes.js';
import { criarExecutorAcoes } from '../acoes/executor-acoes.js';
import { criarConfirmacoesAcoes, criarApiAcoes } from '../acoes/api-acoes.js';
import { filtrarSegredo } from '../acoes/filtro-segredo.js';
import { PropostaAcao, propostasDaMensagem, FERRAMENTA_PROPOSTA } from '../motor/acao-proposta.js';
import { opcoesDaConversa } from '../motor.js';
import { contratoDoProjeto } from '../orquestrador/contrato-local.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';

const REPO = path.resolve(import.meta.dirname, '..');
const PLANE = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const DONO = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };
const contrato = {
  versao: 1, optIn: true, projetoPlane: PLANE, ambiente: 'local',
  tiposTeste: ['unitário'], criteriosAceite: ['sai 0'], acoesProibidas: ['deploy'],
  comandos: [{ id: 'testes', executavel: 'node', argumentos: ['scripts/ok.mjs'] },
    { id: 'falha', executavel: 'node', argumentos: ['scripts/falha.mjs'] },
    { id: 'lento', executavel: 'node', argumentos: ['scripts/lento.mjs'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: false }],
};

async function arredores() {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'acoes-'));
  const dir = path.join(raiz, 'proj');
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(raiz, 'semcontrato'));
  await fs.writeFile(path.join(dir, '.orquestrador.json'), JSON.stringify(contrato));
  // Simula uma suíte que ecoa o .env de quem roda: o valor literal, uma atribuição e um bearer.
  // `rodou.txt` é a testemunha de execução: só confirmar pode criá-lo.
  await fs.writeFile(path.join(dir, 'scripts', 'ok.mjs'),
    'import fs from "node:fs"; fs.appendFileSync("rodou.txt", "x");\nconsole.log("ok 3 testes; ELEVENLABS lido: valor-super-secreto-123"); console.error("PLANE_API_KEY=plane_api_abcdefghijklmnop Authorization: Bearer tok.en");\n');
  await fs.writeFile(path.join(dir, 'scripts', 'falha.mjs'), 'console.error("quebrou"); process.exit(3);\n');
  await fs.writeFile(path.join(dir, 'scripts', 'lento.mjs'), 'setTimeout(() => console.log("fim"), 400);\n');
  const projetos = [{ pasta: 'proj', area: 'ProjetosPessoais', titulo: 'Proj', plane: PLANE },
    { pasta: 'semcontrato', area: 'ProjetosPessoais', titulo: 'Sem', plane: 'b24e3d36-2e2a-4760-a3f3-53998297a245' }];
  const diario = criarDiarioAcoes({ diretorio: path.join(raiz, 'estado') });
  const propostas = criarRegistroPropostas({ projetos, raiz, lerContrato: contratoDoProjeto, diario });
  const executor = criarExecutorAcoes({ ambiente: { ...process.env, ELEVENLABS_API_KEY: 'valor-super-secreto-123' }, timeoutMs: 10_000 });
  const confirmacoes = criarConfirmacoesAcoes({ propostas, executor, diario, registrarLog: () => {} });
  const linhas = async () => lerJsonl(await fs.readFile(diario.arquivo, 'utf8')).linhas;
  return { raiz, dir, propostas, executor, confirmacoes, diario, linhas, limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}

async function modulosJs(dir = REPO, saida = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'vendor', 'test', 'e2e', 'docs', '.git', '.claude'].includes(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await modulosJs(abs, saida);
    else if (/\.(js|mjs)$/.test(e.name)) saida.push(abs);
  }
  return saida;
}

test('PAINEL-2: a allowlist do ssh é uma lista só, e a consulta manda exatamente ela', async () => {
  // Fonte única: o texto de cada comando permitido não aparece em nenhum outro módulo.
  const trechos = ['uptime -p', 'systemctl is-active', 'docker ps', 'df -h', 'free -h'];
  for (const arquivo of await modulosJs()) {
    const texto = await fs.readFile(arquivo, 'utf8');
    const rel = path.relative(REPO, arquivo);
    for (const t of trechos) if (rel !== path.join('coletores', 'ssh-leitura.js')) assert.ok(!texto.includes(t), `${rel} repete "${t}" da allowlist`);
  }
  const ferramentas = await fs.readFile(path.join(REPO, 'motor', 'ferramentas.js'), 'utf8');
  assert.match(ferramentas, /import \{ LeituraSsh \} from '\.\.\/coletores\.js'/);
  // Os programas da lista são só os cinco da invariante 2 e a cola de formatação.
  const programas = new Set(CONSULTAS_SSH.join(';').split(/;|\|/).map(t => t.trim().split(/\s+/)[0]).filter(Boolean));
  assert.deepEqual([...programas].sort(), ['df', 'do', 'docker', 'done', 'echo', 'for', 'free', 'head', 'systemctl', 'tail', 'uptime'].sort());
  assert.match(COMANDO_SSH, /systemctl is-active/);
  const chamadas = [];
  const ssh = new LeituraSsh({ chave: '/k', executar: async (...a) => { chamadas.push(a); return { stdout: 'up 3 days' }; } });
  assert.deepEqual(await ssh.consultar(), { ok: true, saida: 'up 3 days' });
  assert.deepEqual(chamadas[0][0], 'ssh');
  assert.deepEqual(chamadas[0][1], ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-i', '/k', 'linuxuser@astargne.com', COMANDO_SSH]);
  assert.equal(COMANDO_SSH, CONSULTAS_SSH.join('; '));
});

test('PAINEL-3a: git só de projeto do catálogo, só as três leituras, sem lock, sem shell e com saída limitada', async () => {
  const chamadas = [];
  const git = new LeituraGitProjeto({ projetos: [{ pasta: 'alfa', area: 'ProjetosPessoais' }], dirDe: p => `/raiz/${p.pasta}`,
    ambiente: { PATH: '/bin', HOME: '/h', PLANE_API_KEY: 'chave-do-plane-0001' },
    executar: async (...a) => { chamadas.push(a); return { stdout: `${'x'.repeat(7000)} chave-do-plane-0001` }; } });
  assert.deepEqual(await git.ler({ projeto: '../Exitlag', leitura: 'status' }),
    { ok: false, erro: 'projeto fora do catálogo: use o nome exato da pasta que estado_projetos devolve' });
  assert.equal((await git.ler({ projeto: 'alfa', leitura: 'diff' })).ok, false, 'diff de conteúdo não é leitura aceita');
  assert.equal((await git.ler({ projeto: 'alfa', leitura: 'constructor' })).ok, false);
  assert.equal(chamadas.length, 0, 'recusa antes de chamar git');
  const r = await git.ler({ projeto: 'alfa', leitura: 'log' });
  assert.equal(r.ok, true);
  assert.equal(r.truncada, true);
  assert.equal(r.saida.length, 6000);
  const [bin, args, opcoes] = chamadas[0];
  assert.equal(bin, 'git');
  assert.deepEqual(args, ['--no-pager', '-c', 'core.fsmonitor=false', '-C', '/raiz/alfa', 'log', '--oneline', '-n', '15']);
  assert.equal(opcoes.env.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(opcoes.env.PLANE_API_KEY, undefined, 'git não herda chave do painel');
  assert.ok(opcoes.timeout > 0 && opcoes.maxBuffer > 0 && !opcoes.shell);
  assert.deepEqual(Object.keys(LEITURAS_GIT), ['status', 'diff_stat', 'log']);
  assert.deepEqual([...LEITURAS_GIT.diff_stat], ['diff', '--stat']);
});

test('PAINEL-3b: proposta confere catálogo e contrato; fora dele recusa nomeada e anotada', async () => {
  const a = await arredores();
  try {
    await assert.rejects(a.propostas.propor({ projeto: 'proj', comandoId: 'rm-rf' }),
      e => e instanceof RecusaProposta && e.message === 'comando fora do contrato de proj; permitidos: testes, falha, lento');
    await assert.rejects(a.propostas.propor({ projeto: 'semcontrato', comandoId: 'testes' }),
      e => e instanceof RecusaProposta && e.message === 'semcontrato não tem contrato .orquestrador.json: não há comando que eu possa propor');
    await assert.rejects(a.propostas.propor({ projeto: 'Exitlag', comandoId: 'testes' }), { message: 'projeto fora do catálogo' });
    const p = await a.propostas.propor({ projeto: 'proj', comandoId: 'testes' });
    assert.deepEqual(Object.keys(p).sort(), ['comando', 'comandoId', 'expiraEm', 'id', 'projeto', 'titulo']);
    assert.equal(p.comando, 'node scripts/ok.mjs');
    const linhas = await a.linhas();
    assert.deepEqual(linhas.map(l => l.etapa), ['proposta-recusada', 'proposta-recusada', 'proposta-recusada', 'proposta']);
    assert.ok(linhas.every(l => l.quem === 'c3po'));
  } finally { await a.limpar(); }
});

test('propor_acao só propõe: devolve id de proposta, nunca de confirmação, e nada roda', async () => {
  const a = await arredores();
  try {
    const ferramenta = new PropostaAcao({ propostas: a.propostas });
    const r = await ferramenta.propor({ projeto: 'proj', comandoId: 'testes' });
    assert.equal(r.isError, undefined);
    const dados = JSON.parse(r.content[0].text);
    assert.ok(dados.proposta.id);
    assert.ok(!/confirmacao/i.test(r.content[0].text), 'a ferramenta não emite confirmação');
    assert.deepEqual((await a.linhas()).map(l => l.etapa), ['proposta'], 'nenhum preparo, confirmação ou resultado');
    assert.equal(a.executor.ocupado(), false);
    await assert.rejects(fs.access(path.join(a.dir, 'rodou.txt')), { code: 'ENOENT' }, 'propor rodou o comando');
    const recusa = await ferramenta.propor({ projeto: 'proj', comandoId: 'npm-publish' });
    assert.equal(recusa.isError, true);
    assert.match(recusa.content[0].text, /^PROPOSTA RECUSADA: comando fora do contrato de proj/);
    // O cartão do chat só nasce de resultado da ferramenta com proposta que o registro conhece.
    const msg = (id, texto, extra = {}) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: texto }], ...extra }] } });
    const ids = new Set(['t1']);
    assert.deepEqual(propostasDaMensagem(msg('t1', r.content[0].text), ids, a.propostas).map(p => p.id), [dados.proposta.id]);
    assert.deepEqual(propostasDaMensagem(msg('t2', r.content[0].text), ids, a.propostas), [], 'outra ferramenta não vira cartão');
    const forjada = JSON.stringify({ proposta: { ...dados.proposta, id: '11111111-1111-4111-8111-111111111111' } });
    assert.deepEqual(propostasDaMensagem(msg('t1', forjada), ids, a.propostas), [], 'id desconhecido não vira cartão');
    assert.deepEqual(propostasDaMensagem(msg('t1', r.content[0].text, { is_error: true }), ids, a.propostas), []);
  } finally { await a.limpar(); }
});

test('motor: ganha só as leituras novas e o propor; nada que ele importa alcança o executor de ações', async () => {
  const o = opcoesDaConversa(undefined, {});
  for (const t of ['mcp__c3po__consulta_ssh', 'mcp__c3po__git_projeto', 'mcp__c3po__diario_zelador', 'mcp__c3po__encomendas', FERRAMENTA_PROPOSTA]) assert.ok(o.allowedTools.includes(t), t);
  assert.equal(o.allowedTools.length, 11, 'leituras das encomendas (PAINEL-50) e do diário do zelador (F3)');
  assert.deepEqual(o.tools, []);
  // Fecho transitivo dos imports relativos de motor.js.
  const vistos = new Set();
  const fila = [path.join(REPO, 'motor.js')];
  while (fila.length) {
    const f = fila.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    const texto = await fs.readFile(f, 'utf8');
    for (const m of texto.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]/g)) {
      fila.push(path.resolve(path.dirname(f), m[1] ?? m[2] ?? m[3]));
    }
  }
  const alcancados = [...vistos].map(f => path.relative(REPO, f));
  assert.ok(alcancados.includes(path.join('acoes', 'propostas.js')), 'o motor propõe pelo registro');
  for (const proibido of ['acoes/executor-acoes.js', 'acoes/api-acoes.js', 'orquestrador/processo-cli.js', 'orquestrador/executor-cli.js']) {
    assert.ok(!alcancados.includes(proibido), `motor alcança ${proibido}`);
  }
});

test('PAINEL-4: preparar → confirmar roda na pasta do projeto, filtra segredo e o diário recebe todas as etapas', async () => {
  const a = await arredores();
  try {
    const p = await a.propostas.propor({ projeto: 'proj', comandoId: 'testes' });
    const prep = await a.confirmacoes.preparar({ propostaId: p.id }, DONO);
    assert.equal(prep.projeto, 'proj');
    assert.equal(prep.pasta, a.dir);
    assert.equal(prep.executavel, 'node');
    assert.deepEqual(prep.argumentos, ['scripts/ok.mjs']);
    assert.ok(prep.confirmacaoId && prep.expiraEm);
    const r = await a.confirmacoes.confirmar(prep.confirmacaoId, DONO);
    assert.equal(r.codigo, 0);
    assert.equal(await fs.readFile(path.join(a.dir, 'rodou.txt'), 'utf8'), 'x', 'rodou uma vez, na pasta do projeto');
    assert.equal(r.expirou, false);
    assert.match(r.saida, /ok 3 testes/);
    for (const segredo of ['valor-super-secreto-123', 'plane_api_abcdefghijklmnop', 'tok.en']) assert.ok(!r.saida.includes(segredo), `vazou ${segredo}`);
    const linhas = await a.linhas();
    assert.deepEqual(linhas.map(l => l.etapa), ['proposta', 'preparo', 'confirmacao', 'resultado']);
    assert.deepEqual(linhas.map(l => l.quem), ['c3po', '7', '7', '7']);
    const fim = linhas.at(-1);
    assert.equal(fim.codigo, 0);
    assert.ok(Number.isInteger(fim.duracaoMs));
    assert.match(fim.resumo, /ok 3 testes/);
    assert.ok(!JSON.stringify(linhas).includes('valor-super-secreto-123'), 'segredo no diário');
    assert.equal(linhas[2].executavel, 'node');
    assert.deepEqual(linhas[2].argumentos, ['scripts/ok.mjs']);
    // Uma proposta roda uma vez.
    await assert.rejects(a.confirmacoes.preparar({ propostaId: p.id }, DONO), { status: 404 });
    // Código de saída diferente de zero volta como resultado, não como erro.
    const p2 = await a.propostas.propor({ projeto: 'proj', comandoId: 'falha' });
    const prep2 = await a.confirmacoes.preparar({ propostaId: p2.id }, DONO);
    assert.equal((await a.confirmacoes.confirmar(prep2.confirmacaoId, DONO)).codigo, 3);
  } finally { await a.limpar(); }
});

test('confirmar sem desafio, de outra sessão ou expirado recusa sem rodar', async () => {
  const a = await arredores();
  try {
    await assert.rejects(a.confirmacoes.confirmar('11111111-1111-4111-8111-111111111111', DONO), { status: 404 });
    await assert.rejects(a.confirmacoes.confirmar('nao-e-uuid', DONO), { status: 422 });
    const p = await a.propostas.propor({ projeto: 'proj', comandoId: 'testes' });
    const prep = await a.confirmacoes.preparar({ propostaId: p.id }, DONO);
    await assert.rejects(a.confirmacoes.confirmar(prep.confirmacaoId, { usuarioId: '7', sessaoHash: 'b'.repeat(64) }), { status: 403 });
    await assert.rejects(a.confirmacoes.preparar({ propostaId: 'x' }, DONO), { status: 404 });
    let t = 0;
    const lenta = criarConfirmacoesAcoes({ propostas: a.propostas, executor: a.executor, diario: a.diario, agora: () => t });
    const prep3 = await lenta.preparar({ propostaId: p.id }, DONO);
    t += 3 * 60_000;
    await assert.rejects(lenta.confirmar(prep3.confirmacaoId, DONO), { status: 410 });
    assert.deepEqual((await a.linhas()).map(l => l.etapa), ['proposta', 'preparo', 'preparo'], 'nada foi confirmado nem rodou');
  } finally { await a.limpar(); }
});

test('duas ações ao mesmo tempo: a segunda é recusada, nada roda duas vezes', async () => {
  const a = await arredores();
  try {
    const p1 = await a.propostas.propor({ projeto: 'proj', comandoId: 'lento' });
    const p2 = await a.propostas.propor({ projeto: 'proj', comandoId: 'testes' });
    const c1 = await a.confirmacoes.preparar({ propostaId: p1.id }, DONO);
    const c2 = await a.confirmacoes.preparar({ propostaId: p2.id }, DONO);
    const primeira = a.confirmacoes.confirmar(c1.confirmacaoId, DONO);
    await assert.rejects(a.confirmacoes.confirmar(c2.confirmacaoId, DONO),
      { status: 409, message: 'recusado; nada foi executado: já há uma ação rodando; espere o resultado dela' });
    await assert.rejects(a.confirmacoes.preparar({ propostaId: p2.id }, DONO), { status: 409 }, 'nem prepara enquanto roda');
    assert.equal((await primeira).codigo, 0);
    const etapas = (await a.linhas()).map(l => `${l.etapa}:${l.propostaId === p1.id ? 1 : 2}`);
    assert.deepEqual(etapas.filter(e => e.startsWith('confirmacao') || e.startsWith('resultado')), ['confirmacao:1', 'resultado:1']);
    assert.equal(a.executor.ocupado(), false, 'a vez é liberada no fim');
  } finally { await a.limpar(); }
});

test('API das ações: campos fechados e sessão antes do corpo', async () => {
  const chamadas = [];
  const api = criarApiAcoes({ autorizar: async () => DONO,
    confirmacoes: { preparar: async (c) => { chamadas.push(c); return { ok: 1 }; }, confirmar: async () => ({ ok: 2 }) } });
  const req = { method: 'POST' };
  assert.deepEqual(await api(req, '/api/acoes/preparar', async () => '{"propostaId":"x","comando":"rm"}'), { status: 422, corpo: { erro: 'campos de preparação inválidos' } });
  assert.deepEqual(await api(req, '/api/acoes/confirmar', async () => '{"confirmacaoId":"x","projeto":"y"}'),
    { status: 422, corpo: { erro: 'confirmação aceita somente o identificador' } });
  assert.deepEqual(chamadas, []);
  assert.deepEqual(await api(req, '/api/acoes/preparar', async () => '{"propostaId":"x"}'), { status: 200, corpo: { ok: 1 } });
});

test('filtro de segredo: valor literal do ambiente, atribuição, bearer e formatos conhecidos', () => {
  const amb = { XAI_API_KEY: 'xai-chave-muito-longa-0001', HOME: '/home/astargne', CURTO_TOKEN: 'abc' };
  const t = filtrarSegredo('home /home/astargne; chave xai-chave-muito-longa-0001; SENHA=hunter22 token: "zzz" Bearer abc ghp_abcdefghijklmnopqrstuvwx sk-ant-abcdefghijklmnopqrst', amb);
  assert.equal(t, 'home /home/astargne; chave ***; SENHA=*** token: "***" Bearer *** *** ***');
  assert.equal(filtrarSegredo('3 testes passaram'), '3 testes passaram');
});
