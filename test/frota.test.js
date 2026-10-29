// Frota (F2, 29/10/2026): catálogo fechado, dois blocos, estado explícito na leitura,
// troca por duas ações com versão-base e histórico só de acréscimo. Sem Plane nem CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArquivoFrota, congelarFrota, hashConteudo } from '../orquestrador/frota.js';
import { validarBlocoExecutor, validarBlocoZelador, validarConteudoFrota, catalogoPublico } from '../orquestrador/frota-catalogo.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarConfirmacoesFrota, criarApiFrota } from '../orquestrador/api-frota.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { perfilAntigoDoCanal } from '../orquestrador/consulta-perfil.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { conteudoFrota, tupla } from './fixtures/frota/frota.js';
import { ErroAcesso } from '../orquestrador/sso.js';
import { PausasFrota } from '../orquestrador/frota-pausas.js';
import { codificarHandoff, handoffsDoCanal } from '../orquestrador/handoff-plane.js';

const IDENTIDADE = { usuarioId: '7', sessaoHash: 'a'.repeat(64) };
const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

async function comServico(f) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-frota-'));
  const diretorio = path.join(raiz, 'estado');
  const servico = criarServicoOrquestracao({ consultar: async () => { throw Error('sem Plane'); }, raiz, estado: criarEstadoOrquestracao({ diretorio }) });
  const confirmacoes = criarConfirmacoesFrota({ servico });
  // O preparar leva a marca que a tela viu no GET (correção J-B).
  const preparar = async (conteudo, marca) => confirmacoes.preparar({ ...conteudo, marca: marca ?? (await servico.estadoFrota()).marca }, IDENTIDADE);
  try { await f({ servico, diretorio, arquivo: new ArquivoFrota({ diretorio }), confirmacoes, preparar }); }
  finally { await fs.rm(raiz, { recursive: true, force: true }); }
}

test('J6: catálogo fechado — modelo, esforço ou provedor fora dele é recusado', () => {
  const publico = catalogoPublico();
  assert.deepEqual(publico.filter(x => x.provedor === 'claude').map(x => x.modelo),
    ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-sonnet-5']);
  assert.equal(publico.filter(x => x.provedor === 'openai').length, 8);
  assert.ok(publico.every(x => x.esforcoPadrao === 'max'), 'o padrão continua max; ultra só por escolha');
  assert.doesNotThrow(() => validarConteudoFrota(conteudoFrota()));
  for (const ruim of [{ provedor: 'claude', modelo: 'claude-inventado', esforco: 'max' }, { provedor: 'openai', modelo: 'gpt-6-luna', esforco: 'ultra' },
    { provedor: 'claude', modelo: 'claude-opus-5-5', esforco: 'ultra' }, { provedor: 'grok', modelo: 'grok-5', esforco: 'high' }, { ...tupla(), extra: 1 }]) {
    assert.throws(() => validarConteudoFrota(conteudoFrota({ validacao: ruim })), /fora do catálogo para validacao/);
  }
});

test('J8: dois blocos com validadores separados — o executor nunca recebe o papel zelador, nem o zelador um do executor', () => {
  const { executor, zelador } = conteudoFrota();
  assert.deepEqual(Object.keys(validarBlocoExecutor(executor)), ['orquestracao', 'codificacao_testes', 'validacao']);
  assert.throws(() => validarBlocoExecutor({ ...executor, zelador: tupla() }), /papel zelador não pertence ao bloco executor/);
  assert.throws(() => validarBlocoZelador({ ...zelador, validacao: tupla() }), /papel validacao não pertence ao bloco zelador/);
  assert.throws(() => validarBlocoZelador({}), /fora do catálogo para zelador/);
  const congelada = congelarFrota({ estado: 'ok', versao: 2, hash: 'h', conteudo: validarConteudoFrota(conteudoFrota({ zelador: tupla('openai') })) });
  assert.deepEqual(Object.keys(congelada.tuplas), ['orquestracao', 'codificacao_testes', 'validacao'], 'só o bloco executor é congelado');
});

test('J5: a leitura diz o estado — ausente, ilegível, inválida (forma, hash, catálogo) — e nunca semeia', async () => {
  await comServico(async ({ diretorio, arquivo }) => {
    assert.equal((await arquivo.ler()).estado, 'ausente');
    await assert.rejects(fs.access(path.join(diretorio, 'frota.json')), 'ler não cria o arquivo');
    await fs.mkdir(diretorio, { recursive: true });
    await fs.writeFile(path.join(diretorio, 'frota.json'), 'não é json');
    assert.equal((await arquivo.ler()).estado, 'ilegivel');
    const bom = { formato: 'frota/v1', versao: 1, hash: hashConteudo(validarConteudoFrota(conteudoFrota())), atualizadoEm: 'x', atualizadoPor: '7', conteudo: conteudoFrota() };
    await fs.writeFile(path.join(diretorio, 'frota.json'), JSON.stringify(bom));
    assert.equal((await arquivo.ler()).estado, 'ok');
    for (const ruim of [[], { ...bom, extra: 1 }, { ...bom, versao: 0 }, { ...bom, hash: 'f'.repeat(64) },
      { ...bom, conteudo: conteudoFrota({ validacao: { provedor: 'openai', modelo: 'gpt-6-luna', esforco: 'ultra' } }) }]) {
      await fs.writeFile(path.join(diretorio, 'frota.json'), JSON.stringify(ruim));
      const lida = await arquivo.ler();
      assert.equal(lida.estado, 'invalida', JSON.stringify(ruim).slice(0, 60));
      assert.throws(() => congelarFrota(lida), /frota invalida: nenhum despacho nem vigília/);
    }
  });
});

test('J4: preparar não grava; confirmar com versão-base velha recusa sem escrita; histórico só cresce', async () => {
  await comServico(async ({ diretorio, arquivo, confirmacoes, servico, preparar }) => {
    const p1 = await preparar(conteudoFrota());
    const p2 = await preparar(conteudoFrota({ validacao: tupla('openai') }));
    assert.equal((await arquivo.ler()).estado, 'ausente', 'preparar não grava');
    const r1 = await confirmacoes.confirmar(p1.confirmacaoId, IDENTIDADE);
    assert.equal(r1.versao, 1);
    assert.equal(r1.substituiu, 'ausente');
    const antes = await fs.readFile(path.join(diretorio, 'frota.json'), 'utf8');
    // p2 foi preparado sobre "ausente"; a frota agora é v1: recusa limpa, nada gravado.
    await assert.rejects(confirmacoes.confirmar(p2.confirmacaoId, IDENTIDADE), e => e.status === 422 && /nada foi gravado.*mudou desde o preparar/.test(e.message));
    assert.equal(await fs.readFile(path.join(diretorio, 'frota.json'), 'utf8'), antes);
    assert.equal(lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).linhas.length, 1);
    const p3 = await preparar(conteudoFrota({ validacao: tupla('openai') }));
    const r3 = await confirmacoes.confirmar(p3.confirmacaoId, IDENTIDADE);
    assert.equal(r3.versao, 2);
    const lida = await arquivo.ler();
    assert.equal(lida.versao, 2);
    assert.equal(lida.hash, r3.hash);
    const historico = lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).linhas;
    assert.deepEqual(historico.map(h => h.versao), [1, 2]);
    assert.deepEqual(historico[1].substituiu, { estado: 'ok', versao: 1, hash: r1.hash });
    const visto = await servico.estadoFrota();
    assert.equal(visto.marca, `ok:2:${r3.hash}`, 'a marca sai na API: é a versão que o dono viu (J-B)');
    assert.equal(visto.versao, 2);
    assert.equal(visto.catalogo.length, 13);
  });
});

test('J6: preparar recusa modelo fora do catálogo antes de criar desafio', async () => {
  await comServico(async ({ arquivo, preparar }) => {
    await assert.rejects(preparar(conteudoFrota({ codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-luna', esforco: 'ultra' } })),
      e => e.status === 422 && /fora do catálogo para codificacao_testes/.test(e.message));
    await assert.rejects(preparar({ executor: { ...conteudoFrota().executor, zelador: tupla() }, zelador: conteudoFrota().zelador }),
      e => e.status === 422 && /zelador não pertence ao bloco executor/.test(e.message));
    assert.equal((await arquivo.ler()).estado, 'ausente');
  });
});

test('frota ilegível é regravada sem interpretar a anterior; o histórico registra a substituição e a versão não regride', async () => {
  await comServico(async ({ diretorio, arquivo, confirmacoes, preparar }) => {
    await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    await fs.writeFile(path.join(diretorio, 'frota.json'), '{ lixo');
    const p = await preparar(conteudoFrota());
    assert.equal(p.atual.estado, 'ilegivel');
    await fs.writeFile(path.join(diretorio, 'frota.json'), '{ outro lixo');
    await assert.rejects(confirmacoes.confirmar(p.confirmacaoId, IDENTIDADE), /mudou desde o preparar/, 'lixo diferente também é mudança');
    const q = await preparar(conteudoFrota());
    const r = await confirmacoes.confirmar(q.confirmacaoId, IDENTIDADE);
    assert.equal(r.versao, 2);
    assert.equal((await arquivo.ler()).estado, 'ok');
    const h = lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).linhas.at(-1);
    assert.equal(h.substituiu.estado, 'ilegivel');
  });
});

test('J-B: o GET devolve a marca; preparar com a marca vista velha recusa sem desafio', async () => {
  await comServico(async ({ servico, confirmacoes, preparar }) => {
    const vista = (await servico.estadoFrota()).marca;
    assert.equal(vista, 'ausente');
    await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    // O dono abriu a tela quando a frota era "ausente"; outra aba já gravou a v1.
    await assert.rejects(preparar(conteudoFrota({ validacao: tupla('openai') }), vista), e => e.status === 422 && /mudou desde que você a abriu/.test(e.message));
    await assert.rejects(confirmacoes.preparar(conteudoFrota(), IDENTIDADE), e => e.status === 422, 'sem marca não prepara');
  });
});

test('J-I: com histórico e frota estragados o piso segura a numeração; sem fonte legível recusa', async () => {
  await comServico(async ({ diretorio, confirmacoes, preparar }) => {
    for (let k = 0; k < 3; k++) await confirmacoes.confirmar((await preparar(conteudoFrota({ validacao: tupla('claude', ['low', 'high', 'max'][k]) }))).confirmacaoId, IDENTIDADE);
    await fs.writeFile(path.join(diretorio, 'frota-historico.jsonl'), '{lixo\n{"a":1}\n');
    await fs.writeFile(path.join(diretorio, 'frota.json'), '{ lixo');
    const r = await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    assert.equal(r.versao, 4, 'o piso (frota-versao.json) não deixa recomeçar do 1');
    await fs.writeFile(path.join(diretorio, 'frota-versao.json'), 'lixo');
    await fs.writeFile(path.join(diretorio, 'frota.json'), '{ lixo');
    await assert.rejects(confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE), /não pode ser numerada/);
  });
});

test('J-J: rename que falha marca a versão como nunca aplicada e limpa o .tmp; frota.json diretório recusa sem escrever', async () => {
  await comServico(async ({ diretorio, servico, confirmacoes, preparar }) => {
    await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    const quebrada = new ArquivoFrota({ diretorio, renomear: async () => { const e = new Error('disco'); e.code = 'EIO'; throw e; } });
    const atual = await quebrada.ler();
    await assert.rejects(quebrada.gravar({ conteudo: conteudoFrota({ validacao: tupla('openai') }), base: atual.marca, usuarioId: '7' }), /não aplicada/);
    const linhas = lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).linhas;
    assert.deepEqual(linhas.at(-1), { quando: linhas.at(-1).quando, versao: 2, hash: linhas.at(-1).hash, evento: 'nunca-aplicada', motivo: 'EIO' });
    assert.equal((await quebrada.ler()).versao, 1, 'a frota em vigor continua a v1');
    assert.deepEqual((await fs.readdir(diretorio)).filter(f => f.endsWith('.tmp')), [], 'nenhum .tmp sobra');
    await fs.rm(path.join(diretorio, 'frota.json'));
    await fs.mkdir(path.join(diretorio, 'frota.json'));
    const antes = (await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).length;
    const p = await preparar(conteudoFrota());
    for (let k = 0; k < 2; k++) await assert.rejects(new ArquivoFrota({ diretorio }).gravar({ conteudo: conteudoFrota(), base: p.atual.estado === 'ilegivel' ? 'ilegivel:sem-leitura' : 'x', usuarioId: '7' }), /não é um arquivo comum/);
    assert.equal((await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).length, antes, 'sem regravação em laço');
    assert.equal((await servico.estadoFrota()).estado, 'ilegivel');
  });
});

test('N4a: escrita interrompida no histórico da frota aparece no GET e fica anotada na versão seguinte', async () => {
  await comServico(async ({ diretorio, servico, confirmacoes, preparar }) => {
    await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    await fs.appendFile(path.join(diretorio, 'frota-historico.jsonl'), '{"quando":"x","vers');
    assert.deepEqual((await servico.estadoFrota()).historico, { legivel: true, truncadaNoFim: true, truncadasNoMeio: 0 });
    await confirmacoes.confirmar((await preparar(conteudoFrota({ validacao: tupla('openai') }))).confirmacaoId, IDENTIDADE);
    const h = lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8'));
    assert.equal(h.linhas.at(-1).historico, 'escrita interrompida no fim separada antes desta versão');
    assert.equal(h.truncadasNoMeio, 1);
    assert.deepEqual((await servico.estadoFrota()).historico, { legivel: true, truncadaNoFim: false, truncadasNoMeio: 1 });
  });
});

test('J-L2: tupla do zelador fora do catálogo não para o executor; o bloco tem estado próprio', async () => {
  await comServico(async ({ diretorio, arquivo }) => {
    await fs.mkdir(diretorio, { recursive: true });
    const conteudo = conteudoFrota({ zelador: { provedor: 'claude', modelo: 'claude-que-saiu-do-catalogo', esforco: 'max' } });
    await fs.writeFile(path.join(diretorio, 'frota.json'), JSON.stringify({ formato: 'frota/v1', versao: 2, hash: hashConteudo(conteudo),
      atualizadoEm: 'x', atualizadoPor: '7', conteudo }));
    const lida = await arquivo.ler();
    assert.equal(lida.estado, 'ok');
    assert.equal(lida.zelador.estado, 'invalida');
    assert.equal(congelarFrota(lida).versao, 2, 'o executor despacha');
  });
});

test('J-H: pausas de forma inválida contam como ilegíveis; confirmar uma frota nova limpa a de versão e regrava a ilegível', async () => {
  await comServico(async ({ diretorio, servico, confirmacoes, preparar }) => {
    const pausas = new PausasFrota({ diretorio });
    for (const ruim of ['{ lixo', '[]', JSON.stringify({ provedores: [], versao: null }), JSON.stringify({ provedores: {}, versao: 'v1' }),
      JSON.stringify({ provedores: { claude: { ate: 'nunca', motivo: 'x' } }, versao: null })]) {
      await fs.mkdir(diretorio, { recursive: true });
      await fs.writeFile(path.join(diretorio, 'frota-pausas.json'), ruim);
      assert.equal((await pausas.ler()).legivel, false, ruim);
    }
    await confirmacoes.confirmar((await preparar(conteudoFrota())).confirmacaoId, IDENTIDADE);
    assert.deepEqual(await pausas.ler(), { legivel: true, provedores: {}, versao: null }, 'a confirmação é a saída explícita');
    const h1 = lerJsonl(await fs.readFile(path.join(diretorio, 'frota-historico.jsonl'), 'utf8')).linhas.at(-1);
    assert.equal(h1.pausas, 'pausas ilegíveis regravadas vazias');
    const v1 = await new ArquivoFrota({ diretorio }).ler();
    await pausas.pausarVersao(v1, 'CLI impedida');
    await pausas.pausarProvedor('openai', 30, 'limite de uso do provedor');
    await confirmacoes.confirmar((await preparar(conteudoFrota({ validacao: tupla('openai') }))).confirmacaoId, IDENTIDADE);
    const depois = await pausas.ler();
    assert.equal(depois.versao, null, 'a pausa da versão some com a frota nova');
    assert.ok(depois.provedores.openai, 'a pausa por limite de uso continua');
    assert.equal((await servico.estadoFrota()).versao, 2);
  });
});

test('J-G: o leitor do HANDOFF/v2 confere a forma das tuplas, não o catálogo vivo', () => {
  const PROJ = PROJETO; const fora = { provedor: 'claude', modelo: 'claude-opus-4', esforco: 'max' };
  const origem = { fonte: 'frota', versao: 1, hash: 'a'.repeat(64), tuplas: { orquestracao: fora, codificacao_testes: fora, validacao: fora } };
  assert.throws(() => codificarHandoff({ projetoId: PROJ, cartaId: CARTA, chaveIdempotencia: CARTA, versaoCarta: '2026-10-20T08:00:00Z',
    papel: 'orquestracao', tentativaId: null, resultado: 'proposta', resumo: 'Recibo antigo de teste.', evidencia: ['evidência 1'], origemModelos: origem }), /fora do catálogo/);
  const dados = { versao: 2, projetoId: PROJ, cartaId: CARTA, chaveIdempotencia: CARTA, versaoCarta: '2026-10-20T08:00:00Z',
    papel: 'orquestracao', tentativaId: null, resultado: 'concluido', resumo: 'Recibo gravado com o catálogo antigo.', evidencia: ['evidência 1'], origemModelos: origem };
  const e = normalizarInteracao({ id: '1', actor: AUTOR, created_at: '2026-10-20T08:00:00Z',
    comment_html: `<p>[ORQ/v1 papel=orquestracao] HANDOFF/v2 ${Buffer.from(JSON.stringify(dados)).toString('base64url')}</p>` });
  const [lido] = handoffsDoCanal([e], { projetoId: PROJ, cartaId: CARTA, autorId: AUTOR });
  assert.deepEqual(lido?.origemModelos.tuplas.validacao, fora, 'a auditoria antiga sobrevive à troca de catálogo');
  const malformado = normalizarInteracao({ id: '2', actor: AUTOR, created_at: '2026-10-20T08:00:00Z',
    comment_html: `<p>[ORQ/v1 papel=orquestracao] HANDOFF/v2 ${Buffer.from(JSON.stringify({ ...dados, origemModelos: { ...origem, tuplas: { ...origem.tuplas, validacao: { provedor: 'claude', modelo: '--rm -rf', esforco: 'max' } } } })).toString('base64url')}</p>` });
  assert.equal(handoffsDoCanal([malformado], { projetoId: PROJ, cartaId: CARTA, autorId: AUTOR }).length, 0, 'forma ruim continua de fora');
});

test('API da frota: sem SSO não lê corpo; campos fechados', async () => {
  let leituras = 0;
  const negada = criarApiFrota({ autorizar: async () => { throw new ErroAcesso('entre no Cadastro Único', 401); }, confirmacoes: {} });
  for (const rota of ['/api/orquestracao/frota/preparar', '/api/orquestracao/frota/confirmar']) {
    assert.equal((await negada({ method: 'POST' }, rota, async () => { leituras++; return '{}'; })).status, 401);
  }
  assert.equal(leituras, 0);
  const api = criarApiFrota({ autorizar: async () => IDENTIDADE, confirmacoes: { preparar: async () => { throw Error('não chamar'); } } });
  assert.equal((await api({ method: 'POST' }, '/api/orquestracao/frota/preparar', async () => JSON.stringify({ executor: {} }))).status, 422);
});

test('J2: PERFIL-IA/v1 antigo só aparece como "ignorado"; comentário ruim não derruba a leitura', () => {
  const perfil = sel => `<p>[ORQ/v1 papel=decisao] PERFIL-IA/v1 ${Buffer.from(JSON.stringify({ versao: 1, projetoId: PROJETO, cartaId: CARTA,
    chaveIdempotencia: CARTA, versaoCarta: '2026-10-20T08:00:00Z', selecoes: sel })).toString('base64url')}</p>`;
  const bom = normalizarInteracao({ id: '1', actor: AUTOR, created_at: '2026-10-20T08:00:00Z', comment_html: perfil({ validacao: tupla('openai') }) });
  const ruim = normalizarInteracao({ id: '2', actor: AUTOR, created_at: '2026-10-21T08:00:00Z', comment_html: '<p>PERFIL-IA/v1 %%%</p>' });
  const alvo = { projetoId: PROJETO, cartaId: CARTA, autorId: AUTOR };
  assert.match(perfilAntigoDoCanal([bom, ruim], alvo).resumo, /validacao openai\/gpt-6-astra\/xhigh/);
  assert.equal(perfilAntigoDoCanal([bom, ruim], alvo).estado, 'ignorado');
  assert.deepEqual(perfilAntigoDoCanal([ruim], alvo), { estado: 'ilegivel', resumo: 'perfil antigo ilegível' });
  // J-L3: "não há perfil" e "não deu para saber" são estados diferentes.
  assert.deepEqual(perfilAntigoDoCanal([], alvo), { estado: 'inexistente' });
  assert.equal(perfilAntigoDoCanal([bom], { ...alvo, autorId: null }).estado, 'indisponivel');
});
