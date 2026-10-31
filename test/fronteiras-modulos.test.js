// Portão das fronteiras entre áreas (padroes/modulos.md, regra 14; PAINEL-55): lê os `import` de
// todo módulo fora de test/ e e2e/ e recusa os que pulam a porta de outra área. A regra foi
// escrita a partir do grafo real de 31/10/2026; o que já a violava está em EXCECOES, aresta a
// aresta e com o porquê — exceção que deixou de existir também reprova, para a lista não mentir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const IGNORAR = new Set(['node_modules', 'vendor', 'docs', 'test', 'e2e', 'test-results', 'playwright-report', '.git', '.claude']);

// Área = pasta X/ com a porta X.js na raiz, que só reexporta: quem é de fora importa a porta.
const AREAS_COM_PORTA = ['alinhamento', 'chaves', 'coletores', 'contas', 'decisao', 'motor', 'plane'];
// orquestrador/ não tem porta única: estes são os módulos que outra área pode importar.
// As primitivas de execução (processo sem shell, ambiente por lista branca) e o contrato local
// são portas desde a fase 3 do C-3PO (31/10/2026): acoes/ e a leitura de git as reusam em vez de duplicar.
const PORTAS_ORQUESTRADOR = new Set(['sso.js', 'fila.js', 'triagem.js', 'consulta-c3po.js',
  'api-duas-acoes.js', 'desafio-duas-acoes.js', 'leitor-jsonl.js', 'uuid.js',
  'processo-cli.js', 'ambiente-cli.js', 'contrato-local.js', 'politica.js']);
// Quem compõe (montagem.js) liga as peças internas de cada área — regra 7, "quem compõe não implementa".
const COMPOSICAO = 'montagem.js';
// O motor do C-3PO é só leitura até a fase 3 (invariante 4): nem o fecho dos seus imports alcança
// escritor do Plane ou o executor. Exceções do fecho na lista abaixo, com o caminho e o porquê.
const PROIBIDOS_AO_MOTOR = ['orquestrador/escritor-handoff-plane.js', 'orquestrador/escritor-gate-plane.js',
  'orquestrador/estado-plane.js', 'orquestrador/executor-cli.js', 'orquestrador/api-despacho.js', 'orquestrador/api-gate.js',
  'orquestrador/api-handoff.js', 'orquestrador/api-frota.js',
  // Mesa de decisão (PAINEL-53): o motor lê a carta pela porta decisao.js e nunca chega ao escritor Painel Admin.
  'decisao/escritor-decisao-plane.js', 'decisao/aplicacao-decisao.js', 'decisao/api-decisao.js', 'decisao/mesa.js'];
const EXCECOES_MOTOR = new Map([
  ['orquestrador/escritor-handoff-plane.js', 'motor/ferramentas.js → fila.js → servico-orquestracao.js → canal-carta.js → handoff-plane.js, porta que reexporta o protocolo (leitura do canal) junto com a fábrica do escritor; o motor só lê, e o escritor só nasce com chave injetada pela montagem'],
  ['orquestrador/escritor-gate-plane.js', 'o mesmo caminho até canal-carta.js → gate-plane.js, mesma porta mista de protocolo e escritor; mesma razão'],
]);
const EXCECOES = new Map([
  ['orquestrador/fonte-consumo-codex.js -> coletores/sessoes.js',
    'o consumo do Codex reusa `recentes` (a árvore de sessões por mtime do Hangar), que a porta coletores.js não reexporta (deaff9d, 29/10/2026)'],
  ['orquestrador/fonte-consumo-codex.js -> coletores/transcript-cauda.js',
    'o consumo do Codex lê a cauda do transcript com `lerCauda`, que a porta coletores.js não reexporta (deaff9d, 29/10/2026)'],
]);

function listar(dir = RAIZ) {
  const saida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listar(abs));
    else if (/\.(js|mjs)$/.test(e.name) && !abs.includes(`${path.sep}scripts${path.sep}`)) saida.push(path.relative(RAIZ, abs).split(path.sep).join('/'));
  }
  return saida.sort();
}

// Especificadores relativos (e absolutos do front, servidos a partir de publico/) de import
// estático, `export … from` e import() dinâmico. Linha de comentário não conta.
function importsDe(arquivo) {
  const texto = readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const alvos = [];
  const re = /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g;
  for (const m of texto.matchAll(re)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec.startsWith('.')) alvos.push(path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), spec)));
    else if (spec.startsWith('/') && arquivo.startsWith('publico/')) alvos.push(path.posix.join('publico', spec));
  }
  return alvos;
}

const area = f => (f.includes('/') ? f.slice(0, f.indexOf('/')) : null);

function grafo() {
  const arestas = [];
  for (const de of listar()) for (const para of importsDe(de)) arestas.push({ de, para });
  return arestas;
}

function violacoes(arestas) {
  const achadas = [];
  const recusar = (a, regra) => achadas.push({ chave: `${a.de} -> ${a.para}`, regra });
  for (const a of arestas) {
    const origem = area(a.de);
    const destino = area(a.para);
    if (a.de === 'servidor.js' && a.para !== COMPOSICAO) recusar(a, 'servidor.js só importa a montagem');
    if (a.para === COMPOSICAO && a.de !== 'servidor.js') recusar(a, 'só servidor.js importa a montagem');
    if ((origem === 'publico') !== (destino === 'publico')) recusar(a, 'publico/ e o servidor não se importam');
    if (destino === 'http' && origem !== 'http' && a.de !== COMPOSICAO) recusar(a, 'http/ só é montado pela montagem');
    if (a.de === COMPOSICAO || origem === destino) continue;
    if (AREAS_COM_PORTA.includes(destino) && a.de !== `${destino}.js`) recusar(a, `de fora de ${destino}/ importa-se ${destino}.js`);
    if (destino === 'orquestrador' && !PORTAS_ORQUESTRADOR.has(a.para.slice('orquestrador/'.length))) recusar(a, 'módulo interno de orquestrador/');
  }
  return achadas;
}

// Fecho transitivo a partir das entradas do motor.
function alcancaveis(arestas, inicio) {
  const vizinhos = new Map();
  for (const a of arestas) vizinhos.set(a.de, [...(vizinhos.get(a.de) ?? []), a.para]);
  const vistos = new Set();
  const fila = [...inicio];
  while (fila.length) {
    const atual = fila.pop();
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    fila.push(...(vizinhos.get(atual) ?? []));
  }
  return vistos;
}

test('nenhum import pula a porta de outra área (fora das exceções nomeadas)', () => {
  const arestas = grafo();
  assert.ok(arestas.length > 300, `grafo pequeno demais (${arestas.length} arestas): o leitor de import parou de achar`);
  const fora = violacoes(arestas).filter(v => !EXCECOES.has(v.chave));
  assert.deepEqual(fora.map(v => `${v.chave} (${v.regra})`), []);
});

test('toda exceção de import ainda existe e ainda viola a regra — resolvida, sai da lista', () => {
  const chaves = new Set(violacoes(grafo()).map(v => v.chave));
  for (const [chave, motivo] of EXCECOES) {
    assert.ok(motivo.length > 20, `${chave}: exceção sem motivo`);
    assert.ok(chaves.has(chave), `${chave}: não viola mais; tire de EXCECOES`);
  }
});

test('o motor do C-3PO não alcança escritor do Plane nem o executor, nem por transitividade', () => {
  const arestas = grafo();
  const entradas = listar().filter(f => f === 'motor.js' || f.startsWith('motor/'));
  assert.ok(entradas.length > 3);
  const alcance = alcancaveis(arestas, entradas);
  assert.ok(alcance.has('orquestrador/fila.js'), 'o fecho precisa atravessar a porta da fila');
  assert.ok(alcance.has('decisao/leitor-carta.js'), 'o fecho precisa atravessar a porta da mesa (carta_plane)');
  assert.deepEqual(PROIBIDOS_AO_MOTOR.filter(p => alcance.has(p) && !EXCECOES_MOTOR.has(p)), []);
  for (const p of EXCECOES_MOTOR.keys()) assert.ok(alcance.has(p), `${p}: o motor não o alcança mais; tire de EXCECOES_MOTOR`);
});

test('cada regra morde: aresta fabricada que pula porta é recusada', () => {
  const casos = [
    { de: 'http/rotas-x.js', para: 'coletores/git-local.js' },
    { de: 'motor/x.js', para: 'orquestrador/servico-orquestracao.js' },
    { de: 'publico/x.js', para: 'contas.js' },
    { de: 'coletores/x.js', para: 'http/resposta.js' },
    { de: 'servidor.js', para: 'http/roteador.js' },
    { de: 'orquestrador/x.js', para: 'montagem.js' },
    { de: 'motor/x.js', para: 'decisao/escritor-decisao-plane.js' },
    { de: 'http/rotas-decisao.js', para: 'decisao/api-decisao.js' },
  ];
  for (const caso of casos) assert.ok(violacoes([caso]).length >= 1, `${caso.de} -> ${caso.para} passou`);
  assert.deepEqual(violacoes([{ de: 'montagem.js', para: 'orquestrador/api-frota.js' }, { de: 'http/rotas-contas.js', para: 'contas.js' },
    { de: 'chaves/api.js', para: 'orquestrador/api-duas-acoes.js' }, { de: 'coletores.js', para: 'coletores/sessoes.js' }]), []);
});
