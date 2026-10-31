// Peças do zelador (F3) uma a uma: trava do agendador (J52), lease (J53), ato humano (J57), prontidão (J58), evidência (J69), escritor (J56/J68), sessões estritas (J67), diário (J45–J50), CLI (J21/J25) e fim do job (J41–J44, J70). Sem rede, sem CLI real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { TravaDisco } from '../orquestrador/trava.js';
import { InstanciaAgendador } from '../orquestrador/agendador-instancia.js';
import { VigiliaVarredura } from '../orquestrador/vigilia-varredura.js';
import { LeaseZelador } from '../orquestrador/zelador-lease.js';
import { DiarioZelador } from '../orquestrador/zelador-diario.js';
import { violaAtoHumano, violaProntidao, prontidaoDoProjeto, ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { validarVeredito, prosaRecusada, lerSaidaCli, novaDescricao } from '../orquestrador/zelador-veredito.js';
import { GitZelador } from '../orquestrador/zelador-git.js';
import { criarEscritorZelador } from '../orquestrador/escritor-zelador-plane.js';
import { CliZelador } from '../orquestrador/zelador-cli.js';
import { nadaFazivel } from '../orquestrador/zelador-fim.js';
import { ocupacaoPorSessoes } from '../coletores.js';

const HUMANO = 'cd43e869-ed51-419e-b23b-0b10aea66231';
const temp = prefixo => fs.mkdtemp(path.join(os.tmpdir(), prefixo));

test('J52: sem ORQ_AGENDADOR não toma a trava nem agenda; pid vivo de outro recusa; pid morto é tomado; quem perdeu o arquivo para', async () => {
  const dir = await temp('zel-agendador-');
  try {
    const comTrava = acao => new TravaDisco(dir).segurar(acao);
    const sem = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: false });
    assert.equal((await sem.tomar()).agenda, false);
    assert.equal(await sem.podeAgendar(), false);
    await assert.rejects(fs.access(path.join(dir, 'agendador.json')), 'sem a flag nada é gravado');
    const vivos = new Set([111]);
    const a = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 111, processoVivo: p => vivos.has(p) });
    const b = new InstanciaAgendador({ diretorio: dir, comTrava, habilitado: true, pid: 222, processoVivo: p => vivos.has(p) });
    assert.equal((await a.tomar()).agenda, true);
    const recusa = await b.tomar();
    assert.equal(recusa.agenda, false);
    assert.match(recusa.motivo, /outra instância \(pid 111\)/);
    vivos.delete(111);
    assert.equal((await b.tomar()).agenda, true, 'pid morto é tomado');
    assert.equal(await a.podeAgendar(), false, 'o arquivo é conferido a cada volta');
    assert.equal(await b.podeAgendar(), true);
    // A vigília só varre quando podeAgendar diz sim.
    let varridas = 0;
    const v = new VigiliaVarredura({ servico: {}, play: {}, projetos: [], intervaloMs: 5, registrarLog: () => {}, livro: {}, memoria: new Map(), ocupada: { atual: false } });
    v.varrer = async () => { varridas += 1; };
    v.iniciar(() => sem.podeAgendar());
    await new Promise(r => setTimeout(r, 40));
    v.parar();
    assert.equal(varridas, 0, 'sem a flag a vigília não agenda');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('J53: lease com jobId sob a trava — outro job espera; vencido é tomado; o dono antigo perde o fencing; ilegível conta como ocupado', async () => {
  const dir = await temp('zel-lease-');
  try {
    let t = Date.parse('2026-10-31T12:00:00Z');
    const leases = new LeaseZelador({ diretorio: dir, comTrava: acao => new TravaDisco(dir).segurar(acao), agora: () => t });
    const P = randomUUID();
    const [A, B] = [randomUUID(), randomUUID()];
    assert.equal((await leases.adquirir(A, P)).ok, true);
    assert.match((await leases.adquirir(B, randomUUID())).motivo, /outro job do zelador em curso/);
    await leases.comTrava(() => leases.conferirSobTrava(A, P));
    t += 21 * 60_000;
    assert.equal((await leases.adquirir(B, P)).ok, true, 'vencido é tomado');
    await assert.rejects(leases.comTrava(() => leases.conferirSobTrava(A, P)), /perdido ou vencido/);
    await assert.rejects(leases.renovar(A, P), /perdido/);
    await leases.soltar(A, P);
    assert.equal((await leases.ler(null)).jobId, B, 'soltar só solta o que é do job');
    await fs.writeFile(leases.caminho(null), '{ ruim');
    const r = await leases.adquirir(randomUUID(), P);
    assert.equal(r.ok, false);
    assert.match(r.motivo, /ilegível .*apague o arquivo à mão/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('J57: reaberta por humano não fecha; etiqueta posta por humano não sai; posta pelo zelador sai; descrição não volta ao texto trocado; ilegível = humano', () => {
  const estados = [{ id: 's-todo', name: 'Todo', group: 'unstarted' }, { id: 's-done', name: 'Done', group: 'completed' }];
  const reaberta = [{ field: 'state', old_value: 'Done', new_value: 'Todo', old_identifier: 's-done', actor: HUMANO }];
  assert.match(violaAtoHumano({}, { tipo: 'estado', grupo: 'completed' }, { atividades: reaberta, estados }), /tirou a carta de Done/);
  assert.equal(violaAtoHumano({}, { tipo: 'estado', grupo: 'cancelled' }, { atividades: reaberta, estados }), null);
  const tirada = [{ field: 'labels', old_value: 'ASTARGNE', new_value: '', actor: HUMANO }];
  assert.match(violaAtoHumano({}, { tipo: 'labels', adicionar: ['ASTARGNE'], remover: [] }, { atividades: tirada }), /não repõe/);
  assert.match(violaAtoHumano({}, { tipo: 'labels', adicionar: [], remover: ['ASTARGNE'] }, { atividades: [{ field: 'labels', old_value: '', new_value: 'ASTARGNE', actor: { id: HUMANO } }] }), /não foi posta pelo zelador/);
  assert.equal(violaAtoHumano({}, { tipo: 'labels', adicionar: [], remover: ['ASTARGNE'] }, { atividades: [{ field: 'labels', old_value: '', new_value: 'ASTARGNE', actor: ZELADOR_ATOR }] }), null);
  assert.match(violaAtoHumano({}, { tipo: 'labels', adicionar: [], remover: ['ASTARGNE'] }, { atividades: [] }), /não foi posta pelo zelador/, 'sem histórico = humano');
  const trocada = [{ field: 'description', old_value: '<p>texto velho</p>', new_value: '<p>texto do dono</p>', actor: HUMANO }];
  assert.match(violaAtoHumano({}, { tipo: 'trecho', trecho: 'x', novoTrecho: 'velho' }, { atividades: trocada, novaDescricao: '<p>texto velho</p>' }), /voltaria/);
  assert.match(violaAtoHumano({}, { tipo: 'anexar', texto: 'texto velho' }, { atividades: trocada, novaDescricao: '<p>texto do dono</p><p>texto velho</p>' }), /outro ator tirou/);
  assert.match(violaAtoHumano({}, { tipo: 'anexar', texto: 'algo' }, { atividades: [{ field: 'description', actor: HUMANO }] }), /ilegível/);
  assert.match(violaAtoHumano({}, { tipo: 'estado', grupo: 'completed' }, { atividades: null }), /atividades ilegíveis/);
});

test('J58: a própria carta só pode ganhar motivo — tirar ASTARGNE dela (IA_DECIDE) é recusado; outra carta não pode mudar nada', () => {
  const carta = (id, nomes = [], seq = 1) => ({ id, sequence_id: seq, sigla: 'X', name: id, state: { group: 'unstarted', name: 'Todo' }, labels: nomes.map(name => ({ name })), description_html: '<p>Sem dependências.</p>', filhos: [] });
  const a = carta('a', ['ASTARGNE']);
  const porId = new Map([['a', a]]);
  const rel = new Map([['a', { blocked_by: [] }]]);
  const antes = prontidaoDoProjeto([a], rel, porId);
  const sem = { ...a, labels: [] };
  assert.match(violaProntidao(antes, prontidaoDoProjeto([sem], rel, new Map([['a', sem]])), 'a'), /mais perto do READY TO DEV/);
  const fechada = { ...a, state: { group: 'completed', name: 'Done' } };
  assert.equal(violaProntidao(antes, prontidaoDoProjeto([fechada], rel, new Map([['a', fechada]])), 'a'), null, 'fechar só acrescenta motivo');
});

test('veredito: forma fechada, PRODUTO só com ASTARGNE, segredo e HTML na prosa recusados, trecho único, saída estrita', async () => {
  const ctx = { cartasPorIdentificador: new Map([['X-1', {}], ['X-2', {}]]), candidatas: new Set(['X-1']), pasta: '/nada',
    git: { commitNoPrincipal: async () => ({ ok: true, principal: 'main' }), arquivoRastreado: async (_p, c) => ({ ok: true, caminho: c }) } };
  const base = { carta: 'X-1', evidencias: [{ tipo: 'carta', carta: 'X-2' }], comentario: 'Duplicata da X-2, que já cobre o mesmo escopo.' };
  assert.equal((await validarVeredito({ ...base, veredito: 'DONO', labelsTrava: ['PRODUTO'] }, ctx)).recusado, 'etiquetas de trava fora da lista (PRODUTO só junto com ASTARGNE)');
  assert.deepEqual((await validarVeredito({ ...base, veredito: 'DONO', labelsTrava: ['PRODUTO', 'ASTARGNE'] }, ctx)).mudanca, { tipo: 'labels', adicionar: ['ASTARGNE', 'PRODUTO'], remover: [] });
  assert.equal((await validarVeredito({ ...base, veredito: 'CANCELAR', extra: 1 }, ctx)).recusado, 'veredito fora da forma fechada');
  assert.equal((await validarVeredito({ ...base, carta: 'X-2', veredito: 'CANCELAR' }, ctx)).recusado, 'carta fora das candidatas do retrato');
  assert.equal((await validarVeredito({ ...base, veredito: 'FECHAR' }, ctx)).recusado, 'fechar exige commit no ramo principal');
  assert.equal((await validarVeredito({ ...base, veredito: 'CANCELAR', evidencias: [] }, ctx)).recusado, 'sem evidência');
  assert.equal((await validarVeredito({ ...base, veredito: 'CANCELAR' }, ctx)).veredito, 'CANCELAR');
  assert.equal(prosaRecusada('vazou a chave sk-abcdefghijklmnopqrstu aqui'), 'prosa com forma de segredo');
  assert.equal(prosaRecusada('veja <script>alert(1)</script>'), 'prosa com HTML');
  assert.equal(prosaRecusada('commit 0123456789abcdef0123456789abcdef01234567 no main'), null, 'sha hexadecimal não é segredo');
  assert.throws(() => novaDescricao('<p>a b a b</p>', { tipo: 'trecho', trecho: 'a b', novoTrecho: 'c' }), /mais de uma vez/);
  assert.equal(novaDescricao('<p>R&amp;D antigo</p>', { tipo: 'trecho', trecho: 'R&D antigo', novoTrecho: 'P&D <novo>' }), '<p>P&amp;D &lt;novo&gt;</p>');
  assert.throws(() => lerSaidaCli('Aqui está: {"vereditos": []}'));
  assert.deepEqual(lerSaidaCli('```json\n{"vereditos": []}\n```'), []);
});

test('J69/J22: commit fora do ramo principal, arquivo fora do repo (link), não rastreado ou linha além do fim não valem; só o caminho sai', async () => {
  const raiz = await temp('zel-git-');
  const g = (...a) => execFileSync('git', a, { cwd: path.join(raiz, 'repo'), env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } }).toString().trim();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', path.join(raiz, 'repo')]);
    g('config', 'user.email', 't@e'); g('config', 'user.name', 'T');
    await fs.writeFile(path.join(raiz, 'repo', 'a.md'), 'um\ndois\n');
    await fs.writeFile(path.join(raiz, 'fora.md'), 'segredo\n');
    await fs.symlink(path.join(raiz, 'fora.md'), path.join(raiz, 'repo', 'link.md'));
    g('add', 'a.md', 'link.md'); g('commit', '-q', '-m', 'um');
    const noMain = g('rev-parse', 'HEAD');
    g('checkout', '-q', '-b', 'orq/x'); await fs.writeFile(path.join(raiz, 'repo', 'b.md'), 'b\n'); g('add', 'b.md'); g('commit', '-q', '-m', 'b');
    const fora = g('rev-parse', 'HEAD'); g('checkout', '-q', 'main');
    await fs.writeFile(path.join(raiz, 'repo', 'solto.md'), 'x\n');
    const git = new GitZelador();
    const repo = path.join(raiz, 'repo');
    assert.equal((await git.commitNoPrincipal(repo, noMain)).ok, true);
    assert.match((await git.commitNoPrincipal(repo, fora)).motivo, /fora do ramo main/);
    assert.deepEqual(await git.arquivoRastreado(repo, 'a.md', 2), { ok: true, caminho: 'a.md' });
    assert.match((await git.arquivoRastreado(repo, 'a.md', 9)).motivo, /além do fim/);
    assert.match((await git.arquivoRastreado(repo, 'link.md', 1)).motivo, /fora do repositório/);
    assert.match((await git.arquivoRastreado(repo, '../fora.md')).motivo, /fora do repositório/);
    assert.match((await git.arquivoRastreado(repo, 'solto.md')).motivo, /não é rastreado/);
    assert.deepEqual(await git.ramosNaoIntegrados(repo), ['orq/x']);
    const vistos = [];
    const espiao = new GitZelador({ executar: async (args, o) => { vistos.push(args[0]); return { codigo: 0, stdout: '', stderr: '' }; } });
    await espiao.retrato(repo);
    assert.ok(vistos.includes('status') && vistos.includes('log'));
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('J56/J68: o escritor lê a chave 600 por operação, confere o ator fixo, recusa chave igual a outra identidade e projeto fora do play', async () => {
  const dir = await temp('zel-escritor-');
  try {
    const arquivo = path.join(dir, 'zelador.token');
    await fs.writeFile(arquivo, 'chave-do-zelador-de-teste-123\n', { mode: 0o600 });
    let ator = ZELADOR_ATOR;
    let leituras = 0;
    const P = randomUUID();
    const fetchImpl = async (url) => ({ status: 200, ok: true, json: async () => (url.endsWith('/users/me/') ? { id: ator } : {}) });
    const escritor = (opcoes = {}) => criarEscritorZelador({ escopoPermitido: async id => id === P, arquivoChave: arquivo, fetchImpl, apiBase: 'http://x',
      lerChave: async a => { leituras++; return (await fs.readFile(a, 'utf8')).trim(); }, ...opcoes });
    assert.equal(await escritor().conferir(P), true);
    assert.equal(await escritor().conferir(P), true);
    assert.equal(leituras, 2, 'uma leitura do arquivo por operação');
    await assert.rejects(escritor().conferir(randomUUID()), /fora do escopo/);
    ator = HUMANO;
    await assert.rejects(escritor().conferir(P), /identidade do zelador não confere/);
    ator = ZELADOR_ATOR;
    await assert.rejects(escritor({ chavesProibidas: new Set(['chave-do-zelador-de-teste-123']) }).conferir(P), /igual a outra identidade/);
    await fs.chmod(arquivo, 0o640);
    await assert.rejects(criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: arquivo, fetchImpl }).conferir(P), /permissão frouxa/);
    await assert.rejects(criarEscritorZelador({ escopoPermitido: async () => true, arquivoChave: path.join(dir, 'outro.token'), fetchImpl }).conferir(P), /fora da lista/);
    await assert.rejects(escritor().comentar({ projetoId: P, cartaId: randomUUID(), html: '<p>sem prefixo</p>', externalId: 'a'.repeat(64) }), /forma do zelador/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('J16–J19/J67: leitor estrito — sessão que tocou o projeto ocupa; outro projeto não; pasta ilegível e transcript recente sem linha legível ocupam', async () => {
  const raiz = await temp('zel-sessoes-');
  try {
    const projeto = { pasta: 'alfa', area: 'ProjetosPessoais', plane: randomUUID(), sigla: 'ALFA' };
    const dirAlfa = path.join(raiz, 'ProjetosPessoais', 'alfa');
    const claude = path.join(raiz, 'claude', 'p1');
    await fs.mkdir(claude, { recursive: true });
    const agora = Date.parse('2026-10-31T12:00:00Z');
    const linha = (arquivo) => JSON.stringify({ type: 'assistant', timestamp: new Date(agora - 30 * 60_000).toISOString(), cwd: '/home/x',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: arquivo } }], stop_reason: 'tool_use' } });
    const opcoes = { projeto, raiz, agora, raizClaude: path.join(raiz, 'claude'), raizCodex: path.join(raiz, 'codex') };
    await fs.writeFile(path.join(claude, 's.jsonl'), `${linha(path.join(raiz, 'ProjetosPessoais', 'beta', 'x.js'))}\n`);
    assert.equal((await ocupacaoPorSessoes(opcoes)).ocupado, false, 'outro projeto não ocupa');
    await fs.writeFile(path.join(claude, 's.jsonl'), `${linha(path.join(dirAlfa, 'x.js'))}\n`);
    assert.match((await ocupacaoPorSessoes(opcoes)).motivo, /sessão claude tocou o projeto/);
    await fs.writeFile(path.join(claude, 's.jsonl'), 'lixo sem json\n');
    assert.match((await ocupacaoPorSessoes(opcoes)).motivo, /sem linha legível/);
    await fs.writeFile(path.join(claude, 's.jsonl'), '');
    await fs.chmod(claude, 0o000);
    assert.match((await ocupacaoPorSessoes(opcoes)).motivo, /sessões ilegíveis/);
    await fs.chmod(claude, 0o755);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('J45–J50: diário roda por dia, a cauda cortada é tolerada e avisada, corrupção no meio falha fechada, o índice de pendentes não roda', async () => {
  const dir = await temp('zel-diario-');
  try {
    let t = Date.parse('2026-10-30T23:00:00Z');
    const d = new DiarioZelador({ diretorio: dir, agora: () => t });
    await d.anotar({ tipo: 'JOB_INICIO', jobId: 'j1', projetoId: 'p' });
    await d.marcarPendente({ chave: 'k1', projetoId: 'p', cartaId: 'c', carta: 'X-1', veredito: 'FECHAR', jobId: 'j1' });
    t += 2 * 3_600_000;
    await d.anotar({ tipo: 'JOB_FIM', jobId: 'j1', projetoId: 'p' });
    assert.deepEqual((await fs.readdir(path.join(dir, 'zelador'))).sort(), ['pendentes.jsonl', 'zelador-2026-10-30.jsonl', 'zelador-2026-10-31.jsonl']);
    assert.deepEqual((await d.pendentes()).map(p => p.chave), ['k1'], 'o PENDENTE atravessa a virada do dia');
    await fs.appendFile(d.arquivoDoDia(t), '{"tipo":"JOB_INI');
    const lido = await d.linhas();
    assert.deepEqual(lido.linhas.map(l => l.tipo), ["JOB_INICIO", "ZELADOR_PENDENTE", "JOB_FIM"], "os dois dias, sem a linha cortada");
    assert.match(lido.avisos.join(' '), /última linha incompleta/);
    await fs.writeFile(d.arquivoDoDia(t - 2 * 3_600_000), '{"ok":1}\n{ruim\n{"ok":2}\n');
    await assert.rejects(d.jobs24h(), /ilegível na linha 2/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('J21/J25: a CLI do zelador roda num diretório vazio, sem ferramentas nem sessão, com o retrato pela stdin, e o vazio some no fim', async () => {
  const vistos = [];
  const spawn = (executavel, argumentos, opcoes) => {
    const filho = new EventEmitter();
    filho.stdout = new PassThrough(); filho.stderr = new PassThrough(); filho.pid = 999_999;
    let entrada = '';
    filho.stdin = new PassThrough();
    filho.stdin.on('data', p => { entrada += p; });
    filho.stdin.on('finish', async () => {
      vistos.push({ executavel, argumentos, cwd: opcoes.cwd, vazio: (await fs.readdir(opcoes.cwd)).length === 0, entrada, env: opcoes.env });
      filho.stdout.end(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '{"vereditos":[]}', total_cost_usd: 0.02 }));
      filho.stderr.end();
      setImmediate(() => filho.emit('close', 0, null));
    });
    return filho;
  };
  const cli = new CliZelador({ spawn, ambiente: { PATH: '/bin', HOME: '/home/x', PLANE_API_KEY: 'segredo' }, binario: async n => `/bin/${n}` });
  const r = await cli.rodar({ provedor: 'claude', modelo: 'claude-opus-5', esforco: 'high' }, 'RETRATO-AQUI');
  assert.deepEqual([r.ok, r.texto, r.uso.custoUsd], [true, '{"vereditos":[]}', 0.02]);
  const [v] = vistos;
  assert.equal(v.vazio, true);
  assert.equal(v.entrada, 'RETRATO-AQUI');
  assert.deepEqual(v.argumentos.slice(v.argumentos.indexOf('--tools'), v.argumentos.indexOf('--tools') + 2), ['--tools', '']);
  for (const f of ['--restricted', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands']) assert.ok(v.argumentos.includes(f), f);
  assert.equal(v.env.PLANE_API_KEY, undefined, 'ambiente por lista branca');
  await assert.rejects(fs.access(v.cwd), 'o diretório vazio é apagado no fim');
  await cli.rodar({ provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'high' }, 'R');
  const codex = vistos[1].argumentos;
  assert.deepEqual(codex.slice(0, 5), ['exec', '-C', vistos[1].cwd, '--sandbox', 'read-only']);
  assert.ok(codex.includes('--ephemeral'));
});

test('J41–J44/J70: fim do job — feita é zero abertas; só decisão e tarefa do dono acendem o bloqueio; ramo orq/* não integrado apaga', () => {
  const c = (seq, grupo, etiquetas = []) => ({ sequence_id: seq, state: { group: grupo }, labels: etiquetas.map(name => ({ name })), filhos: [] });
  assert.equal(nadaFazivel({ cartas: [c(1, 'completed'), c(2, 'cancelled')], sigla: 'X' }).feita, true);
  const travada = nadaFazivel({ cartas: [c(1, 'unstarted', ['ASTARGNE']), c(2, 'started', ['TAREFA DONO']), c(3, 'completed')], sigla: 'X' });
  assert.deepEqual([travada.feita, travada.soDono, travada.categorias.decisao, travada.categorias.tarefaDono, travada.emAndamento], [false, true, ['X-1'], ['X-2'], 1]);
  assert.equal(nadaFazivel({ cartas: [c(1, 'unstarted', ['ASTARGNE'])], sigla: 'X', ramosNaoIntegrados: ['orq/x-1'] }).soDono, false);
  assert.equal(nadaFazivel({ cartas: [c(1, 'unstarted', ['ASTARGNE']), c(2, 'unstarted')], sigla: 'X' }).soDono, false, 'carta sem trava é da frota');
});
