// Liberação do jogo nativo (PAINEL-59): prazo que vence sozinho, só projetos com jogo
// nativo no catálogo, arquivo estranho conta como desligado e a troca só por duas ações.
// Sem prazo (PAINEL-67): só vale escrito por extenso e só o dono desliga.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LiberacaoNativa, SEM_PRAZO } from '../orquestrador/liberacao-nativa.js';
import { criarApiNativo, criarConfirmacoesNativo } from '../orquestrador/api-nativo.js';
import { PROJETOS } from '../projetos.js';

const JOGO = '00000000-0000-4000-8000-0000000000aa';
const OUTRO = '00000000-0000-4000-8000-0000000000bb';
const projetos = [{ pasta: 'Jogo', titulo: 'Jogo', plane: JOGO, jogoNativo: 'Jogo pela Steam' }, { pasta: 'Web', titulo: 'Web', plane: OUTRO }];
const identidade = { usuarioId: '1', sessaoHash: 'a'.repeat(64) };
const HORA = 3_600_000;

async function montar() {
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'nativo-'));
  const relogio = { t: Date.parse('2026-10-29T20:00:00Z') };
  const liberacao = new LiberacaoNativa({ diretorio, projetos, agora: () => relogio.t });
  return { diretorio, relogio, liberacao, arquivo: path.join(diretorio, 'liberacao-nativa.json') };
}

const pedido = corpo => Object.assign(Readable.from([Buffer.from(JSON.stringify(corpo))]), { method: 'POST' });
const ler = req => new Promise(r => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => r(s)); });

test('só o CKBL tem jogo nativo no catálogo real', () => {
  assert.deepEqual(PROJETOS.filter(p => p.jogoNativo).map(p => p.pasta), ['CK3BannerLord']);
});

test('sem arquivo, nada liberado; só projetos com jogo nativo aparecem', async () => {
  const { liberacao } = await montar();
  const e = await liberacao.estado();
  assert.equal(e.legivel, true);
  assert.deepEqual(e.horas, [2, 4, 8, 12]);
  assert.deepEqual(e.projetos.map(p => [p.projeto, p.liberada, p.ate]), [[JOGO, false, null]]);
});

test('ligar vale pelo prazo e vence sozinho; o estado não expõe quem ligou', async () => {
  const { liberacao, relogio } = await montar();
  const r = await liberacao.alternar(JOGO, 2, identidade.usuarioId);
  assert.equal(r.liberada, true);
  assert.equal(r.ate, '2026-10-29T22:00:00.000Z');
  relogio.t += 2 * HORA - 1;
  assert.equal((await liberacao.estado()).projetos[0].liberada, true);
  relogio.t += 1;
  const vencida = (await liberacao.estado()).projetos[0];
  assert.deepEqual([vencida.liberada, vencida.ate], [false, null]);
  assert.ok(!JSON.stringify(await liberacao.estado()).includes('usuarioId'));
});

test('desligar apaga o registro na hora', async () => {
  const { liberacao } = await montar();
  await liberacao.alternar(JOGO, 8, '1');
  const r = await liberacao.alternar(JOGO, 0, '1');
  assert.equal(r.liberada, false);
  assert.equal((await liberacao.estado()).projetos[0].liberada, false);
});

test('sem prazo não vence, atravessa o reinício do processo e só o desligar apaga', async () => {
  const { liberacao, relogio, diretorio, arquivo } = await montar();
  const r = await liberacao.alternar(JOGO, SEM_PRAZO, identidade.usuarioId);
  assert.deepEqual([r.liberada, r.semPrazo, r.ate, r.desde], [true, true, null, '2026-10-29T20:00:00.000Z']);
  assert.deepEqual(JSON.parse(await fs.readFile(arquivo, 'utf8'))[JOGO],
    { desde: '2026-10-29T20:00:00.000Z', ate: null, semPrazo: true, usuarioId: '1' });
  relogio.t += 400 * 24 * HORA;
  // Outra instância sobre o mesmo diretório: é o que o restart do serviço faz.
  const depois = new LiberacaoNativa({ diretorio, projetos, agora: () => relogio.t });
  const e = await depois.estado();
  assert.equal(e.legivel, true);
  assert.deepEqual([e.projetos[0].liberada, e.projetos[0].semPrazo, e.projetos[0].ate], [true, true, null]);
  assert.match(e.observacao, /semPrazo/);
  assert.ok(!JSON.stringify(e).includes('usuarioId'));
  const fim = await depois.alternar(JOGO, 0, '1');
  assert.deepEqual([fim.liberada, fim.semPrazo, fim.desde], [false, false, null]);
  assert.deepEqual(JSON.parse(await fs.readFile(arquivo, 'utf8')), {});
});

test('com prazo, a linha diz semPrazo falso; religar com prazo por cima do sem prazo volta a vencer', async () => {
  const { liberacao, relogio } = await montar();
  await liberacao.alternar(JOGO, SEM_PRAZO, '1');
  const r = await liberacao.alternar(JOGO, 2, '1');
  assert.deepEqual([r.liberada, r.semPrazo, r.ate], [true, false, '2026-10-29T22:00:00.000Z']);
  relogio.t += 2 * HORA;
  const vencida = (await liberacao.estado()).projetos[0];
  assert.deepEqual([vencida.liberada, vencida.semPrazo], [false, false]);
});

test('prazo fora da lista e projeto sem jogo nativo são recusados sem escrita', async () => {
  const { liberacao, arquivo } = await montar();
  for (const horas of [1, 3, 24, -2, 0.5, 'sempre', '2', true, null, Infinity]) await assert.rejects(liberacao.validar(JOGO, horas), /prazo fora da lista/);
  await assert.rejects(liberacao.validar(OUTRO, 2), /sem jogo nativo/);
  await assert.rejects(liberacao.alternar(OUTRO, 2, '1'), /sem jogo nativo/);
  await assert.rejects(fs.access(arquivo));
});

test('arquivo ilegível ou com forma estranha conta como desligado; religar regrava do zero', async () => {
  const { liberacao, arquivo } = await montar();
  for (const conteudo of ['{', '[]', JSON.stringify({ [JOGO]: { ate: 'amanhã', desde: '2026-10-29T20:00:00Z', usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { ate: '2099-01-01T00:00:00Z' } }),
    // Sem prazo só por extenso: `ate` ausente, nulo sem a marca, ou a marca com outro valor não liberam para sempre.
    JSON.stringify({ [JOGO]: { desde: '2026-10-29T20:00:00Z', usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { desde: '2026-10-29T20:00:00Z', ate: null, usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { desde: '2026-10-29T20:00:00Z', ate: null, semPrazo: 'true', usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { desde: '2026-10-29T20:00:00Z', ate: null, semPrazo: 1, usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { desde: '2026-10-29T20:00:00Z', ate: '2026-10-29T22:00:00Z', semPrazo: true, usuarioId: '1' } }),
    JSON.stringify({ [JOGO]: { ate: null, semPrazo: true, usuarioId: '1' } })]) {
    await fs.writeFile(arquivo, conteudo);
    const e = await liberacao.estado();
    assert.equal(e.legivel, false, conteudo);
    assert.equal(e.projetos[0].liberada, false, conteudo);
  }
  await liberacao.alternar(JOGO, 4, '1');
  assert.equal((await liberacao.estado()).legivel, true);
});

test('desligar de arquivo ilegível regrava do zero: sem prazo guardado nele não volta quando o arquivo é consertado', async () => {
  const { liberacao, arquivo } = await montar();
  await liberacao.alternar(JOGO, SEM_PRAZO, '1');
  const guardado = JSON.parse(await fs.readFile(arquivo, 'utf8'));
  // Um registro estranho ao lado deixa o arquivo ilegível, com o sem prazo ainda no disco.
  await fs.writeFile(arquivo, JSON.stringify({ ...guardado, lixo: { ate: 'x' } }));
  const e = await liberacao.estado();
  assert.deepEqual([e.legivel, e.projetos[0].liberada, e.projetos[0].semPrazo], [false, false, false]);
  assert.match(e.observacao, /Desligar regrava o arquivo do zero/);
  const api = criarApiNativo({ autorizar: async () => identidade, confirmacoes: criarConfirmacoesNativo({ liberacao }) });
  const prep = await api(pedido({ projeto: JOGO, horas: 0 }), '/api/orquestracao/nativo/preparar', ler);
  assert.deepEqual([prep.status, prep.corpo.jaEstava, prep.corpo.ligar], [200, false, false]);
  assert.match(prep.corpo.aviso, /ilegível.*regrava o arquivo do zero/);
  const conf = await api(pedido({ confirmacaoId: prep.corpo.confirmacaoId }), '/api/orquestracao/nativo/confirmar', ler);
  assert.deepEqual([conf.status, conf.corpo.liberada], [200, false]);
  assert.deepEqual(JSON.parse(await fs.readFile(arquivo, 'utf8')), {});
  // Legível e desligado, o desligar volta a ser "já estava".
  assert.equal((await liberacao.validar(JOGO, 0)).jaEstava, true);
  assert.match((await liberacao.validar(JOGO, 0)).aviso, /^Confirmar desliga a liberação agora/);
});

test('registro de projeto fora do catálogo é forma estranha: não fica guardado à espera de o projeto voltar', async () => {
  const { diretorio, arquivo } = await montar();
  const dois = [projetos[0], { ...projetos[1], jogoNativo: 'Outro jogo' }];
  const antes = new LiberacaoNativa({ diretorio, projetos: dois });
  await antes.alternar(OUTRO, SEM_PRAZO, '1');
  // O projeto perde o jogo nativo no catálogo: o registro dele não pode ser preservado calado.
  const depois = new LiberacaoNativa({ diretorio, projetos });
  assert.equal((await depois.estado()).legivel, false);
  await depois.alternar(JOGO, 2, '1');
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(arquivo, 'utf8'))), [JOGO]);
  const voltou = new LiberacaoNativa({ diretorio, projetos: dois });
  assert.deepEqual((await voltou.estado()).projetos.map(p => [p.projeto, p.liberada]), [[JOGO, true], [OUTRO, false]]);
});

test('duas confirmações seguidas para projetos diferentes não se sobrescrevem', async () => {
  const dois = [projetos[0], { ...projetos[1], jogoNativo: 'Outro jogo' }];
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'nativo-'));
  const liberacao = new LiberacaoNativa({ diretorio, projetos: dois });
  await Promise.all([liberacao.alternar(JOGO, 2, '1'), liberacao.alternar(OUTRO, 4, '1')]);
  assert.deepEqual((await liberacao.estado()).projetos.map(p => p.liberada), [true, true]);
});

test('API: preparar não grava; confirmar grava uma vez; campos fechados; outra sessão não confirma', async () => {
  const { liberacao, arquivo } = await montar();
  const confirmacoes = criarConfirmacoesNativo({ liberacao });
  const api = criarApiNativo({ autorizar: async () => identidade, confirmacoes });
  const extra = await api(pedido({ projeto: JOGO, horas: 2, ate: 'x' }), '/api/orquestracao/nativo/preparar', ler);
  assert.equal(extra.status, 422);
  const ruim = await api(pedido({ projeto: JOGO, horas: 3 }), '/api/orquestracao/nativo/preparar', ler);
  assert.deepEqual([ruim.status, ruim.corpo.erro], [422, 'prazo fora da lista']);
  const prep = await api(pedido({ projeto: JOGO, horas: 2 }), '/api/orquestracao/nativo/preparar', ler);
  assert.equal(prep.status, 200);
  assert.equal(prep.corpo.ligar, true);
  assert.match(prep.corpo.aviso, /Steam livre/);
  await assert.rejects(fs.access(arquivo), 'preparar não grava');
  const outra = criarApiNativo({ autorizar: async () => ({ usuarioId: '2', sessaoHash: 'b'.repeat(64) }), confirmacoes });
  assert.equal((await outra(pedido({ confirmacaoId: prep.corpo.confirmacaoId }), '/api/orquestracao/nativo/confirmar', ler)).status, 403);
  const conf = await api(pedido({ confirmacaoId: prep.corpo.confirmacaoId }), '/api/orquestracao/nativo/confirmar', ler);
  assert.deepEqual([conf.status, conf.corpo.liberada], [200, true]);
  assert.equal(JSON.parse(await fs.readFile(arquivo, 'utf8'))[JOGO].usuarioId, '1');
});

test('API: sem prazo é o único texto aceito em horas; preparar avisa que não desliga sozinho e confirmar grava a marca', async () => {
  const { liberacao, arquivo } = await montar();
  const api = criarApiNativo({ autorizar: async () => identidade, confirmacoes: criarConfirmacoesNativo({ liberacao }) });
  for (const horas of ['sempre', '2', '', true, null, 2.5]) {
    const r = await api(pedido({ projeto: JOGO, horas }), '/api/orquestracao/nativo/preparar', ler);
    assert.equal(r.status, 422, JSON.stringify(horas));
  }
  const prep = await api(pedido({ projeto: JOGO, horas: SEM_PRAZO }), '/api/orquestracao/nativo/preparar', ler);
  assert.deepEqual([prep.status, prep.corpo.ligar, prep.corpo.semPrazo, prep.corpo.ate], [200, true, true, null]);
  assert.match(prep.corpo.aviso, /sem prazo: não desliga sozinho/);
  assert.match(prep.corpo.aviso, /Steam livre/);
  await assert.rejects(fs.access(arquivo), 'preparar não grava');
  const conf = await api(pedido({ confirmacaoId: prep.corpo.confirmacaoId }), '/api/orquestracao/nativo/confirmar', ler);
  assert.deepEqual([conf.status, conf.corpo.liberada, conf.corpo.semPrazo, conf.corpo.ate], [200, true, true, null]);
  assert.equal(JSON.parse(await fs.readFile(arquivo, 'utf8'))[JOGO].semPrazo, true);
  // Com prazo, o preparar diz semPrazo falso: a tela escolhe o texto do botão por ele.
  const comPrazo = await api(pedido({ projeto: JOGO, horas: 2 }), '/api/orquestracao/nativo/preparar', ler);
  assert.deepEqual([comPrazo.corpo.ligar, comPrazo.corpo.semPrazo], [true, false]);
  const desligar = await api(pedido({ projeto: JOGO, horas: 0 }), '/api/orquestracao/nativo/preparar', ler);
  assert.deepEqual([desligar.corpo.ligar, desligar.corpo.semPrazo, desligar.corpo.jaEstava], [false, false, false]);
});
