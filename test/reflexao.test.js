// Reflexão noturna (PAINEL-9) com CLI falsa: aplica com histórico; apagar demais vira pendente; segredo recusa;
// frota não ok recusa sem chamar a CLI; a segunda execução da mesma data não faz nada; sem insumo sai sem CLI.
// O spawn é falso e passa pelo ProcessoCli real: os argumentos, o ambiente e o cwd conferidos são os que iriam ao `claude`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executarReflexao, zeladorDaFrota, extrairMemoria, MAX_APAGADO } from '../memoria/reflexao.js';
import { criarLeitorMemoria, hashTexto } from '../memoria/arquivo-memoria.js';
import { criarEscritorMemoria } from '../memoria/escritor-memoria.js';
import { criarPendenteMemoria } from '../memoria/pendente-memoria.js';
import { criarDiarioConversas } from '../memoria/conversas.js';
import { criarRegistroMemoria } from '../memoria/propostas-memoria.js';
import { criarConfirmacoesMemoria } from '../memoria/api-memoria.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';

const AGORA = Date.parse('2026-11-01T06:30:00Z');
const FROTA_OK = { estado: 'ok', zelador: { estado: 'ok', motivo: null },
  conteudo: { executor: {}, zelador: { zelador: { provedor: 'claude', modelo: 'claude-sonnet-5-5', esforco: 'medium' } } } };
const SEGREDO = 'valor-do-env-do-painel-42';
const AMBIENTE = { PATH: '/bin', HOME: '/home/x', PLANE_API_KEY: SEGREDO, ORQ_OWNER_USER_ID: '1' };
const ANTIGA = Array.from({ length: 20 }, (_, i) => `- fato antigo ${i}`).join('\n') + '\n';

// Um filho de mentira com a forma que o ProcessoCli usa (stdout/stderr com 'data', stdin.end, 'close').
function cliFalsa(responder) {
  const chamadas = [];
  const spawn = (executavel, argumentos, opcoes) => {
    const filho = new EventEmitter();
    filho.stdout = new EventEmitter();
    filho.stderr = new EventEmitter();
    filho.pid = 999_999;
    const chamada = { executavel, argumentos, opcoes, cwdNoInicio: readdirSync(opcoes.cwd) };
    chamadas.push(chamada);
    filho.stdin = { on() {}, end(entrada) {
      chamada.stdin = entrada;
      setImmediate(() => {
        const { codigo = 0, stdout = '', stderr = '' } = responder(chamada);
        if (stdout) filho.stdout.emit('data', Buffer.from(stdout));
        if (stderr) filho.stderr.emit('data', Buffer.from(stderr));
        filho.emit('close', codigo, null);
      });
    } };
    return filho;
  };
  return { spawn, chamadas };
}

const resultado = texto => ({ stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: texto, total_cost_usd: 0.01 }) });
const comMemoria = texto => resultado(`Segue.\n<<<MEMORIA>>>\n${texto}<<<FIM>>>\n`);

async function arredores({ memoria = ANTIGA, conversas = 2 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reflexao-'));
  if (memoria !== null) await criarEscritorMemoria({ diretorio: dir }).gravar({ texto: memoria, base: hashTexto(''), quem: 'dono' });
  const diario = criarDiarioConversas({ diretorio: dir, agora: () => AGORA - 3_600_000, ambiente: AMBIENTE });
  for (let i = 0; i < conversas; i += 1) await diario.anotar({ pergunta: `pergunta ${i} com ${SEGREDO}`, resposta: `resposta ${i}` });
  const leitor = criarLeitorMemoria({ diretorio: dir });
  const rodar = (cli, extra = {}) => executarReflexao({ diretorio: dir, lerFrota: async () => FROTA_OK, spawn: cli.spawn, ambiente: AMBIENTE,
    agora: () => AGORA, binario: async () => '/usr/bin/claude', ...extra });
  const diarioReflexao = async () => lerJsonl(await fs.readFile(path.join(dir, 'reflexao.jsonl'), 'utf8')).linhas;
  return { dir, leitor, rodar, diarioReflexao, limpar: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('aplica: L1 nova com histórico (quem reflexao) e diff no diário; isolamento do claude -p conferido', async () => {
  const a = await arredores();
  const nova = `${ANTIGA}- o Mestre prefere respostas curtas\n`;
  const cli = cliFalsa(() => comMemoria(nova));
  try {
    const r = await a.rodar(cli);
    assert.equal(r.resultado, 'aplicada');
    assert.equal(await fs.readFile(a.leitor.arquivo, 'utf8'), nova);
    const h = (await a.leitor.lerHistorico()).at(-1);
    assert.deepEqual([h.quem, h.origem, h.hashAntes, h.hashDepois], ['reflexao', 'reflexao', hashTexto(ANTIGA), hashTexto(nova)]);
    // A noite é marcada antes da CLI ("iniciada", B6.2) e fechada depois.
    const [inicio, d] = await a.diarioReflexao();
    assert.deepEqual([inicio.data, inicio.resultado], ['2026-11-01', 'iniciada']);
    assert.deepEqual([d.data, d.resultado, d.modelo, d.esforco, d.conversas], ['2026-11-01', 'aplicada', 'claude-sonnet-5-5', 'medium', 2]);
    assert.match(d.diff, /^\+- o Mestre prefere respostas curtas$/m);
    const [c] = cli.chamadas;
    assert.equal(c.executavel, '/usr/bin/claude');
    for (const flag of ['-p', '--restricted', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands']) assert.ok(c.argumentos.includes(flag), flag);
    assert.equal(c.argumentos[c.argumentos.indexOf('--tools') + 1], '', 'sem ferramenta nenhuma');
    assert.equal(c.argumentos[c.argumentos.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
    assert.deepEqual([c.argumentos[c.argumentos.indexOf('--model') + 1], c.argumentos[c.argumentos.indexOf('--effort') + 1]], ['claude-sonnet-5-5', 'medium']);
    assert.deepEqual(c.cwdNoInicio, [], 'o cwd do modelo é um diretório vazio');
    await assert.rejects(fs.access(c.opcoes.cwd), { code: 'ENOENT' }, 'o diretório vazio some depois');
    assert.deepEqual(Object.keys(c.opcoes.env).sort(), ['CI', 'HOME', 'NO_COLOR', 'PATH'], 'ambiente por lista branca');
    assert.ok(!c.stdin.includes(SEGREDO) && !JSON.stringify(c.argumentos).includes(SEGREDO), 'segredo chegou ao modelo');
    assert.match(c.stdin, /<memoria_atual>\n- fato antigo 0[\s\S]*<conversas>\n- \[.*\] Mestre: pergunta 0 com \*\*\*/);
  } finally { await a.limpar(); }
});

test('diff que apaga 80% não se aplica: vira proposta pendente que o dono aceita pelo SSO', async () => {
  const a = await arredores();
  const enxuta = ANTIGA.split('\n').slice(0, 4).join('\n') + '\n';
  const cli = cliFalsa(() => comMemoria(enxuta));
  try {
    const r = await a.rodar(cli);
    assert.equal(r.resultado, 'pendente');
    assert.ok(r.fracaoApagada >= 0.8 && r.fracaoApagada > MAX_APAGADO);
    assert.equal(await fs.readFile(a.leitor.arquivo, 'utf8'), ANTIGA, 'a memória não mudou');
    const pendente = criarPendenteMemoria({ diretorio: a.dir });
    const p = await pendente.ler();
    assert.deepEqual([p.id, p.base, p.texto], [r.pendenteId, hashTexto(ANTIGA), enxuta]);
    const confirmacoes = criarConfirmacoesMemoria({ leitor: a.leitor, escritor: criarEscritorMemoria({ diretorio: a.dir }), pendente,
      propostas: criarRegistroMemoria({ ler: a.leitor.ler }), ambiente: AMBIENTE });
    const dono = { usuarioId: '1', sessaoHash: 'c'.repeat(64) };
    const prep = await confirmacoes.preparar({ base: hashTexto(ANTIGA), origem: 'reflexao', valor: p.id }, dono);
    await confirmacoes.confirmar(prep.confirmacaoId, dono);
    assert.equal(await fs.readFile(a.leitor.arquivo, 'utf8'), enxuta);
    assert.deepEqual(((h) => [h.quem, h.origem, h.usuarioId])((await a.leitor.lerHistorico()).at(-1)), ['proposta-aceita', 'reflexao', '1']);
    assert.equal(await pendente.ler(), null, 'aceita, a pendente some');
  } finally { await a.limpar(); }
});

test('segredo na memória nova: recusa, nada gravado e nem o diff entra no diário', async () => {
  const a = await arredores();
  const cli = cliFalsa(() => comMemoria(`${ANTIGA}- a chave do Plane é ${SEGREDO}\n`));
  try {
    const r = await a.rodar(cli);
    assert.deepEqual([r.resultado, r.motivo], ['recusada', 'memória nova com segredo pelo filtro']);
    assert.equal(await fs.readFile(a.leitor.arquivo, 'utf8'), ANTIGA);
    const bruto = await fs.readFile(path.join(a.dir, 'reflexao.jsonl'), 'utf8');
    assert.ok(!bruto.includes(SEGREDO) && !('diff' in JSON.parse(bruto.trim().split('\n').at(-1))));
    await assert.rejects(fs.access(path.join(a.dir, 'memoria-pendente.json')), { code: 'ENOENT' });
  } finally { await a.limpar(); }
});

test('frota não ok (ou zelador fora do Claude) recusa sem chamar a CLI', async () => {
  for (const frota of [{ estado: 'ausente', motivo: 'frota nunca configurada' }, { ...FROTA_OK, zelador: { estado: 'invalida', motivo: 'x' } },
    { ...FROTA_OK, conteudo: { zelador: { zelador: { provedor: 'openai', modelo: 'gpt-6-sol', esforco: 'max' } } } }]) {
    const a = await arredores();
    const cli = cliFalsa(() => comMemoria('nunca\n'));
    try {
      const r = await a.rodar(cli, { lerFrota: async () => frota });
      assert.equal(r.resultado, 'recusada');
      assert.equal(zeladorDaFrota(frota).ok, false);
      assert.equal(cli.chamadas.length, 0);
      assert.equal(await fs.readFile(a.leitor.arquivo, 'utf8'), ANTIGA);
    } finally { await a.limpar(); }
  }
});

test('segunda execução no mesmo dia não faz nada; sem insumo sai sem CLI; resposta sem marcas é erro sem gravar', async () => {
  const a = await arredores();
  const cli = cliFalsa(() => resultado('<<<SEM MUDANCA>>>'));
  try {
    assert.equal((await a.rodar(cli)).resultado, 'sem-mudanca');
    assert.deepEqual(await a.rodar(cli), { resultado: 'ja-rodou', data: '2026-11-01' });
    assert.equal(cli.chamadas.length, 1);
    assert.deepEqual((await a.diarioReflexao()).map(l => l.resultado), ['iniciada', 'sem-mudanca']);
  } finally { await a.limpar(); }
  const b = await arredores({ conversas: 0, memoria: null });
  const cliB = cliFalsa(() => comMemoria('x\n'));
  try {
    const r = await b.rodar(cliB);
    assert.deepEqual([r.resultado, r.conversas], ['sem-insumo', 0]);
    assert.equal(cliB.chamadas.length, 0);
    await assert.rejects(fs.access(b.leitor.arquivo), { code: 'ENOENT' });
  } finally { await b.limpar(); }
  const c = await arredores();
  try {
    assert.equal((await c.rodar(cliFalsa(() => resultado('não sei o formato')))).resultado, 'erro');
    await criarDiarioConversas({ diretorio: c.dir, agora: () => AGORA + 23 * 3_600_000, ambiente: AMBIENTE }).anotar({ pergunta: 'p', resposta: 'r' });
    assert.equal((await c.rodar(cliFalsa(() => comMemoria('x\n')), { agora: () => AGORA + 86_400_000 })).resultado, 'pendente', 'outra data roda de novo');
  } finally { await c.limpar(); }
  assert.deepEqual(extrairMemoria('<<<MEMORIA>>>\r\n# a\r\n<<<FIM>>>'), { texto: '# a\n' });
});
