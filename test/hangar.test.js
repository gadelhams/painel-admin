// Hangar: sessões vivas (/proc e transcripts falsos em pasta temporária) e naves sobre backlog falso. Nada real é lido.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { programaDoComando, acaoDaFerramenta } from '../coletores/acoes-sessao.js';
import { sessaoClaude } from '../coletores/transcript-claude.js';
import { sessaoCodex } from '../coletores/transcript-codex.js';
import { lerSessoes } from '../coletores/sessoes.js';
import { fontesAcervo, setorDoCaminho } from '../coletores/acervo.js';
import { montarNave, sementeDe, lerHangar } from '../coletores/hangar.js';
import { montarFeatures } from '../plane.js';

// Por que estes testes existem: o painel abre pelo tailnet e um transcript
// pode ter segredo colado no prompt ou num argumento de comando. O Hangar só
// pode devolver nome de ferramenta, caminho relativo, programa e UUID de
// carta; o resto da chamada morre no coletor. Também: Exitlag não aparece,
// e sem CLI viva não há droid.

const SEGREDO = 'sk-segredo-que-nao-pode-vazar-123';
const AGORA = Date.parse('2026-10-28T20:00:00.000Z');
const UUID_PRJ = '11111111-2222-4333-8444-555555555555';
const UUID_CARTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
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
    const arq = path.join(base, 'claude', nome);
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  return {
    raiz,
    // O mtime dos arquivos é o relógio real; `agora` real mantém a janela de 15 min coerente.
    ler: (agora = Date.now()) => lerSessoes({
      raizProc: path.join(base, 'proc'),
      raizClaude: path.join(base, 'claude'),
      raizCodex: path.join(base, 'codex'),
      raiz,
      projetos: [{ pasta: 'alfa', area: 'ProjetosPessoais', plane: UUID_PRJ }],
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
  assert.equal(nave.pct, 40);
  assert.deepEqual(coleta.proximas.map((p) => p.id), ['ALFA-2', 'ALFA-3']);
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
