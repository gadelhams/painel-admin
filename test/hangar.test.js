// Hangar: sessões vivas (/proc e transcripts falsos em pasta temporária) e naves sobre backlog falso. Nada real é lido.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { programaDoComando, acaoDaFerramenta, cartaDoComando } from '../coletores/acoes-sessao.js';
import { sessaoClaude } from '../coletores/transcript-claude.js';
import { sessaoCodex } from '../coletores/transcript-codex.js';
import { lerSessoes } from '../coletores/sessoes.js';
import { fontesAcervo, setorDoCaminho } from '../coletores/acervo.js';
import { montarNave, sementeDe, lerHangar } from '../coletores/hangar.js';
import { montarFeatures } from '../plane.js';

// Por que estes testes existem: o painel abre pelo tailnet e um transcript
// pode ter segredo colado no prompt ou num argumento de comando. O Hangar só
// pode devolver nome de ferramenta, caminho relativo, programa e a carta (UUID ou
// SIGLA-N); o resto da chamada morre no coletor. Também: Exitlag não aparece,
// e sem CLI viva não há droid.

const SEGREDO = 'sk-segredo-que-nao-pode-vazar-123';
const AGORA = Date.parse('2026-10-28T20:00:00.000Z');
const UUID_PRJ = '11111111-2222-4333-8444-555555555555';
const UUID_CARTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UUID_BETA = '99999999-2222-4333-8444-555555555555';
const em = (s) => new Date(AGORA - s * 1000).toISOString();

test('programa: pula cd, VAR=valor e prefixo; nunca devolve argumento', () => {
  assert.equal(programaDoComando('cd /x/y && npm test'), 'npm');
  assert.equal(programaDoComando(`TOKEN=${SEGREDO} node --test`), 'node');
  assert.equal(programaDoComando(`curl -H "Authorization: ${SEGREDO}" x`), 'curl');
  assert.equal(programaDoComando('/usr/bin/git status'), 'git');
  assert.equal(programaDoComando(42), null);
});

test('ação: Skill vira consulta, MCP plane só passa UUID válido, ferramenta desconhecida some', () => {
  assert.deepEqual(acaoDaFerramenta('Skill', { skill: 'x:fecho-de-entrega', args: SEGREDO }, 't'),
    { em: 't', tipo: 'consultar', ferramenta: 'Skill', setor: 'skills', item: 'fecho-de-entrega' });
  const plane = acaoDaFerramenta('mcp__plane__add_issue_comment', { project_id: UUID_PRJ, issue_id: UUID_CARTA, comment_html: SEGREDO }, 't');
  assert.equal(plane.itemPlane, UUID_CARTA);
  assert.ok(!JSON.stringify(plane).includes(SEGREDO));
  assert.equal(acaoDaFerramenta('mcp__plane__x', { project_id: SEGREDO }, 't').projetoPlane, null);
  assert.equal(acaoDaFerramenta('WebFetch', { url: SEGREDO }, 't'), null);
  assert.equal(acaoDaFerramenta('Bash', { command: 'npm run x' }, 't').tipo, 'testar');
});

const assistente = (s, blocos, parada = 'tool_use', cwd = null) => ({
  type: 'assistant', timestamp: em(s), cwd, message: { stop_reason: parada, content: blocos },
});
const usuario = (s, conteudo) => ({ type: 'user', timestamp: em(s), message: { content: conteudo } });

test('Claude: fim de turno só depois de resposta sem ferramenta; prompt novo reabre', () => {
  const fim = sessaoClaude([usuario(9, 'faça'), assistente(8, [{ type: 'text', text: 'ok' }], 'end_turn')]);
  assert.equal(fim.fimDeTurno, true);
  const reaberto = sessaoClaude([assistente(8, [{ type: 'text', text: 'ok' }], 'end_turn'), usuario(2, 'outra')]);
  assert.equal(reaberto.fimDeTurno, false);
  const resultado = sessaoClaude([assistente(8, [{ type: 'tool_use', name: 'Read', input: {} }]), usuario(7, [{ type: 'tool_result' }])]);
  assert.equal(resultado.fimDeTurno, false);
});

test('Codex: arquivo do apply_patch, programa do cmd, guardian marcado como sub-sessão', () => {
  const raiz = '/r';
  const s = sessaoCodex([
    { type: 'session_meta', payload: { cwd: '/fora', source: 'vscode' } },
    { type: 'response_item', timestamp: em(5), payload: { type: 'custom_tool_call', name: 'exec', input: `tools.exec_command({cmd:"cd /r/ProjetosPessoais/p && npm test --token ${SEGREDO}"})` } },
    { type: 'response_item', timestamp: em(4), payload: { type: 'custom_tool_call', name: 'exec', input: `apply_patch("*** Update File: /r/ProjetosPessoais/p/a.js\\n+${SEGREDO}")` } },
    { type: 'event_msg', timestamp: em(3), payload: { type: 'task_complete', last_agent_message: SEGREDO } },
  ], { raiz });
  assert.equal(s.acoes[0].programa, 'npm');
  assert.equal(s.acoes[0].caminho, '/r/ProjetosPessoais/p');
  assert.deepEqual(s.acoes[1], { em: em(4), tipo: 'editar', ferramenta: 'apply_patch', caminho: '/r/ProjetosPessoais/p/a.js' });
  assert.equal(s.fimDeTurno, true);
  assert.ok(!JSON.stringify(s).includes(SEGREDO));
  assert.equal(sessaoCodex([{ type: 'session_meta', payload: { source: { subagent: { other: 'guardian' } } } }], { raiz }).subagente, true);
});

function cenario({ processos = ['claude'], transcripts = () => ({}) } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-'));
  const raiz = path.join(base, 'Work');
  for (const d of ['ProjetosPessoais/alfa/src', 'ProjetosPessoais/licoes-vivas', 'Exitlag/x']) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'PADROES-BACKLOG.md'), '');
  processos.forEach((nome, i) => {
    fs.mkdirSync(path.join(base, 'proc', String(100 + i)), { recursive: true });
    fs.writeFileSync(path.join(base, 'proc', String(100 + i), 'cmdline'), `/opt/bin/${nome}\0--flag\0`);
  });
  for (const [nome, linhas] of Object.entries(transcripts(raiz))) {
    const arq = nome.startsWith('codex/') ? path.join(base, nome) : path.join(base, 'claude', nome);
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  }
  return {
    raiz,
    // O mtime dos arquivos é o relógio real; `agora` real mantém a janela de 15 min coerente.
    ler: (agora = Date.now()) => lerSessoes({
      raizProc: path.join(base, 'proc'),
      raizClaude: path.join(base, 'claude'),
      raizCodex: path.join(base, 'codex'),
      raiz,
      projetos: [{ pasta: 'alfa', area: 'ProjetosPessoais', plane: UUID_PRJ, sigla: 'ALFA' }, { pasta: 'beta', area: 'ProjetosPessoais', plane: UUID_BETA, sigla: 'BETA' }],
      acervo: fontesAcervo({ raiz, casa: path.join(base, 'casa') }),
      agora,
    }),
  };
}

test('sessão: projeto pelo último arquivo tocado, caminho relativo, acervo vira consulta e segredo não sai', async () => {
  const c = cenario({
    transcripts: (raiz) => ({
      'slug/s1.jsonl': [
        usuario(60, `use a chave ${SEGREDO}`),
        assistente(50, [{ type: 'tool_use', name: 'Read', input: { file_path: path.join(raiz, 'PADROES-BACKLOG.md') } }], 'tool_use', raiz),
        assistente(40, [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(raiz, 'ProjetosPessoais/alfa/src/a.js'), new_string: SEGREDO } }]),
        assistente(30, [{ type: 'tool_use', name: 'Bash', input: { command: `TOKEN=${SEGREDO} npm test` } }]),
        assistente(20, [{ type: 'tool_use', name: 'mcp__plane__update_issue', input: { project_id: UUID_PRJ, issue_id: UUID_CARTA, name: SEGREDO } }]),
        assistente(10, [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]),
      ],
    }),
  });
  const { sessoes, ias } = await c.ler(AGORA);
  assert.equal(sessoes.length, 1);
  const [s] = sessoes;
  assert.deepEqual([s.ia, s.id, s.projeto, s.estado, s.cartao], ['claude', 's1', 'alfa', 'trabalhando', UUID_CARTA]);
  assert.deepEqual(s.acoes.map((a) => a.tipo), ['consultar', 'editar', 'testar', 'cartao', 'comando']);
  assert.deepEqual(s.acoes[0], { em: em(50), tipo: 'consultar', ferramenta: 'Read', setor: 'padroes', item: 'PADROES-BACKLOG.md' });
  assert.equal(s.acoes[1].arquivo, 'src/a.js');
  assert.equal(s.acoes[2].programa, 'npm');
  const texto = JSON.stringify({ sessoes, ias });
  assert.ok(!texto.includes(SEGREDO), 'segredo do prompt ou de argumento vazou');
  assert.ok(!texto.includes(c.raiz), 'caminho absoluto vazou');
  assert.deepEqual(ias.map((i) => [i.id, i.viva]), [['claude', true], ['codex', false], ['grok', false]]);
});

test('sessão: sem CLI viva não há droid; Exitlag some; parada há 5 min é ociosa; parada há horas some', async () => {
  const oi = () => ({ 's/a.jsonl': [usuario(5, 'oi')] });
  assert.deepEqual((await cenario({ processos: [], transcripts: oi }).ler(AGORA)).sessoes, []);
  const exit = cenario({
    transcripts: (raiz) => ({ 's/b.jsonl': [assistente(5, [{ type: 'tool_use', name: 'Read', input: { file_path: path.join(raiz, 'Exitlag/x/a.js') } }], 'tool_use', path.join(raiz, 'Exitlag/x'))] }),
  });
  assert.deepEqual((await exit.ler(AGORA)).sessoes, []);
  const [parada] = (await cenario({ transcripts: () => ({ 's/c.jsonl': [usuario(300, 'oi')] }) }).ler(AGORA)).sessoes;
  assert.equal(parada.estado, 'ocioso');
  assert.equal(parada.projeto, null);
  // arquivo tocado agora (mtime novo) mas último evento há 2 h: sessão morta, sem droid
  assert.deepEqual((await cenario({ transcripts: () => ({ 's/d.jsonl': [usuario(7200, 'oi')] }) }).ler(AGORA)).sessoes, []);
});

test('sessão: MCP do Plane em outro projeto não tira o droid da nave do arquivo editado', async () => {
  const c = cenario({
    transcripts: (raiz) => ({
      's/e.jsonl': [
        assistente(40, [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(raiz, 'ProjetosPessoais/alfa/src/a.js') } }]),
        // criar label em outro projeto: sem issue_id, não é trabalho naquele projeto
        assistente(20, [{ type: 'tool_use', name: 'mcp__plane__create_label', input: { project_id: UUID_BETA, label_data: { name: 'X' } } }]),
        // carta de outro projeto com issue_id, mas o arquivo editado ainda manda
        assistente(10, [{ type: 'tool_use', name: 'mcp__plane__update_issue', input: { project_id: UUID_BETA, issue_id: UUID_CARTA } }]),
      ],
      's/f.jsonl': [assistente(10, [{ type: 'tool_use', name: 'mcp__plane__update_issue', input: { project_id: UUID_BETA, issue_id: UUID_CARTA } }])],
    }),
  });
  const { sessoes } = await c.ler(AGORA);
  assert.deepEqual(sessoes.map((s) => [s.id, s.projeto]), [['e', 'alfa'], ['f', 'beta']]);
});

test('sessão: Codex aberto há dias, com saídas de imagem enormes no fim, ainda vira droid na nave certa', async () => {
  // Visto em 28/10/2026: a sessão do app desktop nasceu em 23/10 (a pasta é a do
  // dia em que nasceu) e cada screenshot grava ~5 MB de base64 numa linha só.
  const imagem = (s) => JSON.stringify({ type: 'response_item', timestamp: em(s), payload: { type: 'custom_tool_call_output', output: 'x'.repeat(300 * 1024) } });
  const c = cenario({
    processos: ['codex'],
    transcripts: (raiz) => ({
      'codex/2026/10/23/rollout-2026-10-23T09-00-00-01a16aa9-0eb9-7f21-9145-4d947c3f0943.jsonl': [
        { type: 'session_meta', payload: { cwd: '/home/x/Documents/Codex/2026-10-23/tarefa', source: 'vscode' } },
        { type: 'response_item', timestamp: em(30), payload: { type: 'custom_tool_call', name: 'exec', input: `tools.exec_command({cmd:"cd ${raiz}/ProjetosPessoais/alfa && rg ${SEGREDO}"})` } },
        imagem(25), imagem(20), imagem(15), imagem(10),
      ],
    }),
  });
  const { sessoes } = await c.ler(AGORA);
  assert.equal(sessoes.length, 1);
  assert.deepEqual([sessoes[0].ia, sessoes[0].id, sessoes[0].projeto], ['codex', '01a16aa9-0eb9-7f21-9145-4d947c3f0943', 'alfa']);
  assert.equal(sessoes[0].acoes.at(-1).programa, 'rg');
  assert.ok(!JSON.stringify(sessoes).includes(SEGREDO));
});

test('acervo: só os caminhos da lista fixa contam como Oficina', () => {
  const fontes = fontesAcervo({ raiz: '/w', casa: '/h' });
  assert.deepEqual(setorDoCaminho('/w/PADROES-CONTEXTO.md', fontes), { setor: 'padroes', item: 'PADROES-CONTEXTO.md' });
  assert.deepEqual(setorDoCaminho('/w/ProjetosPessoais/CLAUDE.md', fontes), { setor: 'orientacoes', item: 'ProjetosPessoais/CLAUDE.md' });
  assert.deepEqual(setorDoCaminho('/h/.claude/skills/omarchy/SKILL.md', fontes), { setor: 'skills', item: 'omarchy' });
  assert.equal(setorDoCaminho('/w/ProjetosPessoais/alfa/CLAUDE.md', fontes), null);
  assert.equal(setorDoCaminho('relativo.md', fontes), null);
});

const issue = (n, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  identifier: `ALFA-${n}`,
  title: `carta ${n}`,
  url: `u${n}`,
  description: '',
  createdAt: `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`,
  state: { name: 'x', type: 'backlog' },
  labels: { nodes: [] },
  project: { id: 'P' },
  projectMilestone: { id: 'M1' },
  parent: null,
  ...extra,
});

test('nave: % por peça com andamento separado, cancelada fora, PRODUTO na estação e o resto no chão', () => {
  const ws = {
    projetos: [{ id: 'P', name: 'Alfa', url: 'u' }],
    milestones: [{ id: 'M1', name: 'Coleta', sortOrder: 1, project: { id: 'P' } }, { id: 'M2', name: 'Busca', sortOrder: 2, project: { id: 'P' } }],
    issues: [
      issue(1, { state: { name: 'Done', type: 'completed' } }),
      issue(2, { state: { name: 'Doing', type: 'started' } }),
      issue(3, { labels: { nodes: [{ name: 'ASTARGNE' }] } }),
      issue(4, { labels: { nodes: [{ name: 'ASTARGNE' }, { name: 'PRODUTO' }] }, projectMilestone: { id: 'M2' } }),
      issue(5, { state: { name: 'No', type: 'canceled' } }),
      issue(6, { parent: { id: '00000000-0000-4000-8000-000000000002' }, state: { name: 'Done', type: 'completed' } }),
    ],
  };
  const backlog = { pasta: 'alfa', fonte: 'plane', estado: 'ok', features: montarFeatures(ws, 'P').features };
  const nave = montarNave({ pasta: 'alfa', titulo: 'Alfa', plane: 'P' }, backlog);
  assert.equal(nave.sigla, 'ALFA');
  const [coleta, busca] = nave.pecas;
  assert.deepEqual([coleta.total, coleta.feitas, coleta.andamento, coleta.abertas, coleta.pct], [4, 2, 1, 1, 50]);
  assert.deepEqual(coleta.decisoes.map((d) => d.id), ['ALFA-3']);
  assert.deepEqual(busca.decisoes, []);
  assert.deepEqual(nave.decisoesProduto.map((d) => [d.id, d.modulo]), [['ALFA-4', 'Busca']]);
  assert.deepEqual(nave.cartoes[issue(4).id], [1, 'ALFA-4', 'carta 4']);
  // índice reverso: a carta citada como ALFA-4 (ponte REST, commit) acha o mesmo UUID
  assert.equal(nave.identificadores['ALFA-4'], issue(4).id);
  assert.equal(nave.cartoes[nave.identificadores['ALFA-4']][1], 'ALFA-4');
  assert.equal(nave.pct, 40);
  assert.deepEqual(coleta.proximas.map((p) => p.id), ['ALFA-2', 'ALFA-3']);
});

test('nave: só o que espera o dono vira decisão; bloqueio por outra carta não vai para o chão', () => {
  const ws = {
    projetos: [{ id: 'P', name: 'Alfa', url: 'u' }],
    milestones: [{ id: 'M1', name: 'Coleta', sortOrder: 1, project: { id: 'P' } }],
    issues: [
      issue(1, { labels: { nodes: [{ name: 'BLOQUEADA' }] }, description: '(BLOQUEADA: espera ALFA-9)' }),
      issue(2, { labels: { nodes: [{ name: 'EMPÍRICA' }] } }),
      issue(3, { labels: { nodes: [{ name: 'DONO' }] }, description: 'Escolher (DONO: o formato)' }),
      issue(4, { labels: { nodes: [{ name: 'PRODUTO' }] } }),
      issue(5, { labels: { nodes: [{ name: 'SEM ESCOPO' }] } }),
      issue(6, { labels: { nodes: [{ name: 'TAREFA DONO' }] }, description: '(TAREFA DONO: playtest no celular)' }),
    ],
  };
  const backlog = { pasta: 'alfa', fonte: 'plane', estado: 'ok', features: montarFeatures(ws, 'P').features };
  const nave = montarNave({ pasta: 'alfa', titulo: 'Alfa', plane: 'P' }, backlog);
  assert.deepEqual(nave.pecas[0].decisoes.map((d) => d.id), ['ALFA-3']);
  assert.deepEqual(nave.decisoesProduto.map((d) => d.id), ['ALFA-4']);
  const congelada = montarNave({ pasta: 'alfa', titulo: 'Alfa', plane: 'P', congelado: true }, backlog);
  assert.deepEqual([congelada.pecas[0].decisoes.length, congelada.decisoesProduto.length], [0, 0], 'congelado não põe peça no chão');
  assert.equal(congelada.cartas.abertas + congelada.cartas.andamento + congelada.cartas.feitas, 6, 'mas as cartas continuam contadas');
});

test('nave: semente estável por pasta; sem backlog vira casco vazio, não erro', async () => {
  assert.equal(sementeDe('painel-admin'), sementeDe('painel-admin'));
  assert.notEqual(sementeDe('alfa'), sementeDe('beta'));
  const r = await lerHangar({
    projetos: [{ pasta: 'alfa', titulo: 'Alfa' }, { pasta: 'beta', titulo: 'Beta', plane: 'P' }],
    backlog: async () => ({ projetos: [{ pasta: 'beta', estado: 'erro_plane', fonte: 'plane' }] }),
    acervo: async () => [],
  });
  assert.deepEqual(r.naves.map((n) => [n.pasta, n.estado, n.pecas.length]), [['alfa', 'sem_backlog', 0], ['beta', 'erro_plane', 0]]);
});

// PAINEL-57: o droid do Codex no CKBL aparecia com "cartão desconhecido"
// porque falava com o Plane pela ponte REST (`plane-testcase.mjs read 94`, só
// o número) e o coletor só via `mcp__plane__*` com UUID. A carta agora vem de
// três fontes no texto do COMANDO (nunca do prompt nem da resposta), e
// `SIGLA-N` só vale com sigla da lista branca do catálogo.
const SIGLAS_TESTE = new Set(['ALFA', 'BETA']);

test('carta do comando: ponte REST, URL /issues/<uuid>/ e SIGLA-N da lista branca', () => {
  assert.deepEqual(cartaDoComando('node /r/ProjetosPessoais/alfa/scripts/plane-testcase.mjs append 94 work/x.html', SIGLAS_TESTE),
    { ponte: { numero: 94, script: '/r/ProjetosPessoais/alfa/scripts/plane-testcase.mjs' } });
  assert.deepEqual(cartaDoComando('cd /r/x && node scripts/plane-testcase.mjs read 21 | jq .', SIGLAS_TESTE), { ponte: { numero: 21, script: null } });
  assert.deepEqual(cartaDoComando(`curl -H "X-API-Key: ${SEGREDO}" http://127.0.0.1:8095/api/v1/workspaces/w/projects/${UUID_PRJ}/issues/${UUID_CARTA}/`, SIGLAS_TESTE),
    { itemPlane: UUID_CARTA, projetoPlane: UUID_PRJ });
  assert.deepEqual(cartaDoComando('git commit -m "ALFA-007: porquê" && git log', SIGLAS_TESTE), { carta: 'ALFA-7' });
  assert.deepEqual(cartaDoComando('rg "BETA-3|ALFA-12" docs', SIGLAS_TESTE), { carta: 'ALFA-12' }, 'a última citada vence');
  // commit do Claude Code: a mensagem vai num heredoc e o assunto é a 1ª linha
  assert.deepEqual(cartaDoComando(`git commit -m "$(cat <<'EOF'\nALFA-57: porquê\n\nCorpo cita BETA-40.\nEOF\n)"`, SIGLAS_TESTE), { carta: 'ALFA-57' });
});

test('carta do comando: corpo de heredoc é conteúdo, não comando', () => {
  // visto em 31/10/2026: script que edita um plano citando a carta de outra fatia
  const editar = `cd /r/p && python3 -I - <<'EOF'\nfrom pathlib import Path\np = Path('docs/plano.md') # ALFA-40 e BETA-2\nnode scripts/plane-testcase.mjs read 21\ncurl http://x/projects/${UUID_PRJ}/issues/${UUID_CARTA}/\nEOF`;
  assert.equal(cartaDoComando(editar, SIGLAS_TESTE), null);
  assert.deepEqual(cartaDoComando(`${editar}\ngit commit -m "BETA-3: x"`, SIGLAS_TESTE), { carta: 'BETA-3' }, 'o que vem depois do heredoc ainda é comando');
});

test('carta do comando: UTF-8, ISO-8601, SHA-256, AES-128, X-API-Key e sigla fora da lista não viram carta', () => {
  const comandos = [
    'iconv -f UTF-8 -t latin1 a.txt', 'date --iso-8601 && echo ISO-8601', 'sha256sum a # SHA-256', 'openssl enc -AES-128-cbc; echo AES-128',
    `curl -H "X-API-Key: ${SEGREDO}" http://x/`, 'git commit -m "ZZZ-12: fora do catálogo"', 'git commit -m "alfa-3 minúscula"',
    'node scripts/plane-testcase.mjs read ${id}',
  ];
  for (const c of comandos) assert.equal(cartaDoComando(c, SIGLAS_TESTE), null, c);
  // o catálogo real também não conhece essas siglas
  for (const c of comandos.slice(0, 4)) assert.equal(cartaDoComando(c), null, c);
  // e o MCP segue igual: UUID, tipo cartao, ferramenta plane
  assert.deepEqual(acaoDaFerramenta('mcp__plane__get_issue', { project_id: UUID_PRJ, issue_id: UUID_CARTA }, 't'),
    { em: 't', tipo: 'cartao', ferramenta: 'plane', projetoPlane: UUID_PRJ, itemPlane: UUID_CARTA });
});

test('sessão: ponte REST do Claude vira ALFA-94 pelo dono do script; prompt e resposta com SIGLA-N não contam', async () => {
  const c = cenario({
    transcripts: (raiz) => ({
      's/p.jsonl': [
        usuario(60, `trabalhe na BETA-5 com a chave ${SEGREDO}`),
        assistente(50, [{ type: 'text', text: 'vou olhar a BETA-6' }, { type: 'tool_use', name: 'Bash', input: { command: `node ${raiz}/ProjetosPessoais/alfa/scripts/plane-testcase.mjs append 94 work/${SEGREDO}.html` } }]),
        assistente(40, [{ type: 'text', text: 'BETA-7 também' }], 'end_turn'),
      ],
      's/q.jsonl': [
        assistente(30, [{ type: 'tool_use', name: 'Bash', input: { command: 'git commit -m "BETA-2: ajuste" && git push' } }], 'tool_use', path.join(raiz, 'ProjetosPessoais/alfa')),
      ],
      's/r.jsonl': [usuario(20, 'feche a ALFA-3'), assistente(10, [{ type: 'text', text: 'ALFA-3 fechada' }], 'end_turn')],
    }),
  });
  const { sessoes } = await c.ler(AGORA);
  const por = Object.fromEntries(sessoes.map((s) => [s.id, s]));
  assert.deepEqual([por.p.projeto, por.p.cartao], ['alfa', 'ALFA-94'], 'sem cwd: a sigla da ponte leva o droid à nave');
  assert.deepEqual(por.p.acoes, [{ em: em(50), tipo: 'cartao', ferramenta: 'Bash', programa: 'node', itemPlane: 'ALFA-94' }]);
  assert.deepEqual([por.q.projeto, por.q.cartao, por.q.acoes[0].tipo], ['alfa', 'BETA-2', 'comando'], 'cwd manda no projeto; commit só dá a carta');
  assert.equal(por.r.cartao, null, 'prompt e resposta nunca dão carta');
  const texto = JSON.stringify(sessoes);
  assert.ok(!texto.includes(SEGREDO) && !texto.includes('work/') && !texto.includes(c.raiz), 'argumento do comando vazou');
});

test('sessão: Codex pela ponte REST (o caso da CKBL-94) e sem carta no corpo do patch', async () => {
  const c = cenario({
    processos: ['codex'],
    transcripts: (raiz) => ({
      'codex/2026/10/23/rollout-2026-10-23T09-00-00-01a16aa9-0eb9-7f21-9145-4d947c3f0944.jsonl': [
        { type: 'session_meta', payload: { cwd: '/home/x/Documents/Codex/2026-10-23/tarefa', source: 'vscode' } },
        // forma real (24/10/2026): o exec é JavaScript e o comando vai no `cmd`
        { type: 'response_item', timestamp: em(40), payload: { type: 'custom_tool_call', name: 'exec', input: `const r=await tools.exec_command({cmd:"node ${raiz}/ProjetosPessoais/alfa/scripts/plane-testcase.mjs read 94","workdir":"${raiz}/ProjetosPessoais/alfa","max_output_tokens":14000});text(r)` } },
        { type: 'response_item', timestamp: em(30), payload: { type: 'custom_tool_call', name: 'exec', input: `apply_patch("*** Update File: ${raiz}/ProjetosPessoais/alfa/a.md\\n+BETA-9 ${SEGREDO}")` } },
        { type: 'response_item', timestamp: em(20), payload: { type: 'custom_tool_call', name: 'exec', input: `await Promise.all([3,4].map(id=>tools.exec_command({cmd:\`node ${raiz}/ProjetosPessoais/alfa/scripts/plane-testcase.mjs read \${id}\`})))` } },
        { type: 'response_item', timestamp: em(10), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'BETA-8 pronta' }] } },
      ],
    }),
  });
  const { sessoes: [s] } = await c.ler(AGORA);
  assert.deepEqual([s.projeto, s.cartao], ['alfa', 'ALFA-94']);
  assert.deepEqual(s.acoes.map((a) => [a.tipo, a.itemPlane ?? null]), [['cartao', 'ALFA-94'], ['editar', null], ['comando', null]]);
  assert.equal(s.acoes[0].arquivo, '.', 'o caminho é o último sob a raiz (o workdir), relativo');
  assert.ok(!JSON.stringify(s).includes(SEGREDO));
});

test('sessão: a última carta vista fica com a sessão quando sai da cauda', async () => {
  const c = cenario({
    transcripts: (raiz) => ({
      's/g.jsonl': [assistente(20, [{ type: 'tool_use', name: 'Bash', input: { command: 'git commit -m "ALFA-5: x"' } }], 'tool_use', path.join(raiz, 'ProjetosPessoais/alfa'))],
    }),
  });
  assert.equal((await c.ler(AGORA)).sessoes[0].cartao, 'ALFA-5');
  // a CLI continua escrevendo e a linha da carta sai da cauda lida
  const arq = path.join(path.dirname(c.raiz), 'claude', 's/g.jsonl');
  fs.writeFileSync(arq, `${JSON.stringify(assistente(5, [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }], 'tool_use', path.join(c.raiz, 'ProjetosPessoais/alfa')))}\n`);
  const [s] = (await c.ler(AGORA)).sessoes;
  assert.deepEqual([s.cartao, s.acoes.map((a) => a.programa)], ['ALFA-5', ['ls']]);
});
