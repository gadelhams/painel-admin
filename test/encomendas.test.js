// Encomenda de nave como pedido registrado (PAINEL-50): validação, colisão de sigla, SSO + duas ações
// pelo painel MONTADO (HTTP real, porta efêmera) e o diário só de acréscimo. Nada de Plane, ssh ou LLM:
// o SSO é o falso de painel-falso.js e o estado é um diretório temporário.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { servirComFalsos, cabecalhosDaBorda, DONO } from './painel-falso.js';
import { validarPedido, RecusaEncomenda, LIMITES } from '../encomendas/pedido-encomenda.js';
import { dobrarEncomendas, lerEncomendas } from '../encomendas/leitura-encomendas.js';
import { criarRegistroEncomendas } from '../encomendas/registro-encomendas.js';
import { lerJsonl } from '../orquestrador/leitor-jsonl.js';

const PEDIDO = { nome: '  Bot de <b>Receitas</b> ', sigla: 'RECEI', modulos: [' Coleta ', 'Busca'] };
const ID = '11111111-1111-4111-8111-111111111111';
const recusa = re => erro => erro instanceof RecusaEncomenda && re.test(erro.message);

test('validação: limites de nome, sigla e módulos; aceito sai aparado e a sigla vazia vira nula', () => {
  assert.deepEqual(validarPedido(PEDIDO), { nome: 'Bot de <b>Receitas</b>', sigla: 'RECEI', modulos: ['Coleta', 'Busca'] });
  assert.equal(validarPedido({ ...PEDIDO, sigla: '' }).sigla, null);
  assert.equal(validarPedido({ ...PEDIDO, sigla: null }).sigla, null);
  assert.equal(validarPedido({ ...PEDIDO, nome: 'x'.repeat(LIMITES.nome) }).nome.length, 60);
  assert.equal(validarPedido({ ...PEDIDO, modulos: Array.from({ length: 20 }, (_, i) => `m${i}`) }).modulos.length, 20);
  const casos = [
    [{ nome: '   ' }, /^nome: vazio$/],
    [{ nome: 'x'.repeat(61) }, /^nome: passa de 60/],
    [{ nome: 'a\nb' }, /^nome: caractere de controle/],
    [{ nome: 7 }, /^nome: precisa ser texto/],
    [{ sigla: 'recei' }, /^sigla: de 2 a 6/],
    [{ sigla: 'A' }, /^sigla: de 2 a 6/],
    [{ sigla: 'ABCDEFG' }, /^sigla: de 2 a 6/],
    [{ sigla: 'AB1' }, /^sigla: de 2 a 6/],
    [{ modulos: [] }, /^módulos: escreva/],
    [{ modulos: 'Coleta' }, /^módulos: escreva/],
    [{ modulos: Array.from({ length: 21 }, (_, i) => `m${i}`) }, /^módulos: no máximo 20/],
    [{ modulos: ['ok', 'x'.repeat(81)] }, /^módulo 2: passa de 80/],
    [{ modulos: ['ok', ' '] }, /^módulo 2: vazio/],
    [{ modulos: ['Coleta', 'coleta'] }, /^módulo 2: repetido/],
  ];
  for (const [extra, re] of casos) assert.throws(() => validarPedido({ ...PEDIDO, ...extra }), recusa(re), JSON.stringify(extra));
});

test('colisão de sigla: a do catálogo (projetos.js) e a de outra encomenda pendente recusam; atendida libera', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'encomendas-'));
  try {
    const registro = criarRegistroEncomendas({ diretorio: dir, agora: () => Date.parse('2026-10-31T12:00:00Z') });
    await assert.rejects(() => registro.validar({ ...PEDIDO, sigla: 'PAINEL' }), recusa(/^sigla PAINEL já é do projeto painel-admin no catálogo$/));
    await assert.rejects(() => registro.validar({ ...PEDIDO, sigla: 'CKBL' }), recusa(/CK3BannerLord/));
    const r = await registro.registrar(PEDIDO, DONO);
    await assert.rejects(() => registro.validar({ ...PEDIDO, nome: 'Outra' }), recusa(/^sigla RECEI já é de outra encomenda pendente$/));
    await fs.appendFile(registro.arquivo, `${JSON.stringify({ id: r.id, quando: '2026-10-31T13:00:00Z', estado: 'atendida', projeto: 'RECEI' })}\n`);
    assert.equal((await registro.validar({ ...PEDIDO, nome: 'Outra' })).sigla, 'RECEI');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('leitura: a dobra fecha só com atendida do mesmo id; estado desconhecido e linha sem id são contados, não fecham', () => {
  const pedida = (id, extra = {}) => ({ id, quando: '2026-10-31T12:00:00Z', usuarioId: '1', nome: 'N', sigla: null, modulos: ['M'], estado: 'pedida', ...extra });
  const outro = '22222222-2222-4222-8222-222222222222';
  const r = dobrarEncomendas([pedida(ID), pedida(outro), { id: ID, estado: 'atendida' }, { id: outro, estado: 'atendid' }, { estado: 'atendida' },
    pedida(ID, { nome: 'reaberta?' })]);
  assert.deepEqual(r, { pendentes: [{ id: outro, quando: '2026-10-31T12:00:00Z', nome: 'N', sigla: null, modulos: ['M'], estado: 'pedida' }], atendidas: 1, ignoradas: 2 });
});

async function painel() {
  const s = await servirComFalsos();
  const arquivo = path.join(s.diretorio, 'encomendas.jsonl');
  const post = (rota, corpo, sessao = true) => s.pedir('POST', rota, { corpo: JSON.stringify(corpo), cabecalhos: cabecalhosDaBorda({ sessao }) });
  return { ...s, arquivo, post };
}

test('sem sessão nada grava: preparar e confirmar respondem 401 e o diretório de estado fica vazio', async () => {
  const s = await painel();
  try {
    for (const rota of ['/api/hangar/encomendas/preparar', '/api/hangar/encomendas/confirmar']) {
      const r = await s.post(rota, rota.endsWith('preparar') ? PEDIDO : { confirmacaoId: ID }, false);
      assert.deepEqual({ status: r.status, corpo: r.corpo }, { status: 401, corpo: { erro: 'entre no Cadastro Único para confirmar esta ação' } });
    }
    assert.deepEqual(await fs.readdir(s.diretorio), []);
    assert.deepEqual(s.chamadas, []);
  } finally { await s.fechar(); }
});

test('preparar mostra o resumo sem gravar; confirmar acrescenta uma linha pedida; GET devolve a pendente sem usuarioId', async () => {
  const s = await painel();
  try {
    const p = await s.post('/api/hangar/encomendas/preparar', PEDIDO);
    assert.equal(p.status, 200);
    assert.deepEqual({ ...p.corpo, confirmacaoId: 'x', expiraEm: 'x' }, { confirmacaoId: 'x', expiraEm: 'x', nome: 'Bot de <b>Receitas</b>', sigla: 'RECEI', modulos: ['Coleta', 'Busca'],
      aviso: 'Confirmar só registra o pedido no painel. O orquestrador cria o projeto e os módulos no Plane e acrescenta a nave ao catálogo; até lá a vaga mostra "pedida".' });
    await assert.rejects(() => fs.stat(s.arquivo), { code: 'ENOENT' }, 'preparar não grava');
    const c = await s.post('/api/hangar/encomendas/confirmar', { confirmacaoId: p.corpo.confirmacaoId });
    assert.equal(c.status, 200);
    const linhas = lerJsonl(await fs.readFile(s.arquivo, 'utf8')).linhas;
    assert.deepEqual(linhas, [{ id: c.corpo.id, quando: '2026-10-31T12:00:00.000Z', usuarioId: DONO, nome: 'Bot de <b>Receitas</b>', sigla: 'RECEI', modulos: ['Coleta', 'Busca'], estado: 'pedida' }]);
    assert.deepEqual(c.corpo, { id: linhas[0].id, quando: '2026-10-31T12:00:00.000Z', nome: 'Bot de <b>Receitas</b>', sigla: 'RECEI', modulos: ['Coleta', 'Busca'], estado: 'pedida' });
    // Confirmar de novo devolve o mesmo resultado e não grava outra linha.
    assert.deepEqual((await s.post('/api/hangar/encomendas/confirmar', { confirmacaoId: p.corpo.confirmacaoId })).corpo, c.corpo);
    assert.equal(lerJsonl(await fs.readFile(s.arquivo, 'utf8')).linhas.length, 1);
    const g = await s.pedir('GET', '/api/hangar/encomendas', { cabecalhos: cabecalhosDaBorda() });
    assert.deepEqual(g.corpo, { legivel: true, pendentes: [c.corpo], atendidas: 0, ignoradas: 0, truncadasNoMeio: 0, truncadaNoFim: false });
    assert.doesNotMatch(g.texto, /usuarioId/);
  } finally { await s.fechar(); }
});

test('acréscimo: o painel nunca reescreve linha; a atendida do orquestrador tira da lista e a segunda encomenda vai ao fim', async () => {
  const s = await painel();
  try {
    const registrar = async (pedido) => {
      const p = await s.post('/api/hangar/encomendas/preparar', pedido);
      assert.equal(p.status, 200, JSON.stringify(p.corpo));
      return (await s.post('/api/hangar/encomendas/confirmar', { confirmacaoId: p.corpo.confirmacaoId })).corpo;
    };
    const a = await registrar(PEDIDO);
    const antes = await fs.readFile(s.arquivo, 'utf8');
    await fs.appendFile(s.arquivo, `${JSON.stringify({ id: a.id, quando: '2026-10-31T12:30:00Z', estado: 'atendida', projeto: 'RECEI' })}\n`);
    const b = await registrar({ nome: 'Outra', sigla: null, modulos: ['Única'] });
    const depois = await fs.readFile(s.arquivo, 'utf8');
    assert.ok(depois.startsWith(antes), 'as linhas anteriores ficaram byte a byte');
    assert.deepEqual(lerJsonl(depois).linhas.map(l => l.estado), ['pedida', 'atendida', 'pedida']);
    assert.deepEqual((await lerEncomendas(s.arquivo)).pendentes.map(e => e.id), [b.id]);
  } finally { await s.fechar(); }
});

test('sigla tomada entre o preparar e o confirmar: a segunda confirmação recusa limpo e não grava', async () => {
  const s = await painel();
  try {
    const p1 = await s.post('/api/hangar/encomendas/preparar', PEDIDO);
    const p2 = await s.post('/api/hangar/encomendas/preparar', { ...PEDIDO, nome: 'Rival' });
    assert.equal((await s.post('/api/hangar/encomendas/confirmar', { confirmacaoId: p1.corpo.confirmacaoId })).status, 200);
    const r = await s.post('/api/hangar/encomendas/confirmar', { confirmacaoId: p2.corpo.confirmacaoId });
    assert.deepEqual({ status: r.status, corpo: r.corpo }, { status: 422, corpo: { erro: 'recusado; nada foi gravado: sigla RECEI já é de outra encomenda pendente' } });
    assert.equal(lerJsonl(await fs.readFile(s.arquivo, 'utf8')).linhas.length, 1);
    const colide = await s.post('/api/hangar/encomendas/preparar', { ...PEDIDO, sigla: 'PAINEL' });
    assert.deepEqual({ status: colide.status, corpo: colide.corpo }, { status: 422, corpo: { erro: 'sigla PAINEL já é do projeto painel-admin no catálogo' } });
    const campos = await s.post('/api/hangar/encomendas/preparar', { nome: 'x', modulos: ['y'] });
    assert.deepEqual({ status: campos.status, corpo: campos.corpo }, { status: 422, corpo: { erro: 'campos de preparação inválidos' } });
  } finally { await s.fechar(); }
});

test('diário ilegível falha fechado: GET mostra legivel false e nada pendente; preparar recusa e o arquivo não muda', async () => {
  const s = await painel();
  try {
    const ruim = `{"id":"${ID}","estado":"pedida"\nlixo\n{"id":"${ID}","estado":"atendida"}\n`;
    await fs.writeFile(s.arquivo, ruim);
    const g = await s.pedir('GET', '/api/hangar/encomendas', { cabecalhos: cabecalhosDaBorda() });
    assert.deepEqual({ legivel: g.corpo.legivel, pendentes: g.corpo.pendentes }, { legivel: false, pendentes: [] });
    const p = await s.post('/api/hangar/encomendas/preparar', PEDIDO);
    assert.deepEqual({ status: p.status, corpo: p.corpo }, { status: 422, corpo: { erro: 'diário de encomendas ilegível; nada foi gravado até o orquestrador corrigir o arquivo' } });
    assert.equal(await fs.readFile(s.arquivo, 'utf8'), ruim);
  } finally { await s.fechar(); }
});
