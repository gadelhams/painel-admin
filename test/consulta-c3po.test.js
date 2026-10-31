import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { consultarOrquestracaoC3po } from '../orquestrador/consulta-c3po.js';

const ID = '00000000-0000-4000-8000-000000000001';
function contexto() {
  const chamadas = [];
  const orquestracao = {
    async fila() {
      chamadas.push('fila');
      return { atualizadoEm: '2026-10-22T00:00:00Z', frota: { estado: 'ok', versao: 4, hash: 'h', motivo: null }, itens: [
        { id: ID, identificador: 'PAINEL-31', titulo: 'Fila', estado: 'Backlog', gate: null,
          elegivel: false, motivos: ['dependência pendente'], agente: null, lease: null },
        ...Array.from({ length: 35 }, (_, indice) => ({ id: String(indice), identificador: `T-${indice}`,
          titulo: 'Candidata', gate: 'READY TO DEV', motivos: [], elegivel: false })),
      ] };
    },
    async preavaliar(id, gate) {
      chamadas.push(`prontidao:${id}:${gate}`);
      return { carta: 'PAINEL-31', gateProposto: gate, pendenciasDoGate: ['dependência pendente'],
        pendenciasTecnicas: ['contrato ausente'], gatePodeSerMarcado: false };
    },
  };
  const triagemDev = async () => {
    chamadas.push('triagem');
    return { atualizadoEm: '2026-10-22T00:00:00Z', total: 2, folhas: 2,
      categorias: [{ codigo: 'DEPENDENCIA_PENDENTE', total: 1 }, { codigo: 'CONTEUDO_A_REVISAR', total: 1 }],
      itens: [
        { identificador: 'PAINEL-31', categorias: ['DEPENDENCIA_PENDENTE'] },
        { identificador: 'PAINEL-41', categorias: ['CONTEUDO_A_REVISAR'] },
      ], observacao: 'Categorias podem se sobrepor; sem gate aplicado.' };
  };
  return { orquestracao, triagemDev, chamadas };
}

test('C-3PO resume fila sem divulgar dados extras e limita contexto', async () => {
  const base = contexto();
  const resultado = await consultarOrquestracaoC3po(base);
  assert.equal(resultado.total, 36);
  assert.equal(resultado.candidatosComGate, 35);
  assert.equal(resultado.encontrados, 35);
  assert.equal(resultado.itens.length, 30);
  assert.deepEqual(base.chamadas, ['fila']);
  const carta = await consultarOrquestracaoC3po(base, { identificador: 'painel-31' });
  assert.equal(carta.itens[0].identificador, 'PAINEL-31');
  assert.equal(carta.itens[0].id, undefined);
});

test('J-L4: o C-3PO vê a frota que rodaria, e do contrato só o interruptor', async () => {
  const resultado = await consultarOrquestracaoC3po(contexto());
  assert.deepEqual(resultado.frota, { estado: 'ok', versao: 4, hash: 'h', motivo: null });
});

test('"por que a frota não puxou": a fila diz como a frota puxa hoje e o resumo de cada projeto', async () => {
  const base = contexto();
  const fila = base.orquestracao.fila;
  base.orquestracao.fila = async () => ({ ...await fila(), modo: 'despacho-controlado',
    projetos: [{ id: '87dd03dc-ff75-4b86-b265-44740e0f112e', nome: 'EmuladorWeb', candidatas: 2, elegiveis: 0, impedimento: null, cartas: 21 }] });
  const r = await consultarOrquestracaoC3po(base);
  assert.match(r.comoAFrotaPuxa, /ainda não puxa cartas sozinha/);
  // O serviço do C-3PO nasce sem executor: o modo do painel não sai (o `modo` aqui é o da consulta).
  assert.equal(r.modo, 'fila');
  assert.deepEqual(r.projetos, [{ nome: 'EmuladorWeb', pasta: 'EmuladorWeb', candidatas: 2, elegiveis: 0, impedimento: null }]);
});

test('triagem DEV filtra categorias sem transformar ausência de gate em elegibilidade', async () => {
  const base = contexto();
  const resultado = await consultarOrquestracaoC3po(base,
    { modo: 'triagem_dev', categoria: 'DEPENDENCIA_PENDENTE' });
  assert.equal(resultado.totalSemGate, 2);
  assert.equal(resultado.encontrados, 1);
  assert.deepEqual(resultado.itens.map(i => i.identificador), ['PAINEL-31']);
  assert.match(resultado.observacao, /sem gate aplicado/);
  assert.deepEqual(base.chamadas, ['triagem']);
  await assert.rejects(() => consultarOrquestracaoC3po(base,
    { modo: 'triagem_dev', categoria: 'INVENTADA' }), /categoria de triagem inválida/);
});

test('pré-checagem de carta separa gate de despacho e exige identificador', async () => {
  const base = contexto();
  const resultado = await consultarOrquestracaoC3po(base,
    { modo: 'prontidao', identificador: 'painel-31', gate: 'READY TO TEST' });
  assert.deepEqual(resultado.pendenciasDoGate, ['dependência pendente']);
  assert.deepEqual(resultado.pendenciasTecnicas, ['contrato ausente']);
  assert.equal(resultado.gatePodeSerMarcado, false);
  assert.deepEqual(base.chamadas, ['fila', `prontidao:${ID}:READY TO TEST`]);
  await assert.rejects(() => consultarOrquestracaoC3po(base, { modo: 'prontidao' }), /identificador obrigatório/);
});

test('integração mantém as seis ferramentas MCP somente de leitura e não envia consulta ao abrir', async () => {
  const motor = await fs.readFile(new URL('../motor.js', import.meta.url), 'utf8');
  const ferramentas = await fs.readFile(new URL('../motor/ferramentas.js', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../publico/console-c3po.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../publico/orquestracao/demanda-carta.js', import.meta.url), 'utf8');
  assert.match(motor, /tools: \[\]/);
  assert.equal((ferramentas.match(/readOnlyHint: true/g) ?? []).length, 6);
  assert.match(ferramentas, /consultarOrquestracaoC3po/);
  assert.match(ui, /Discutir pendências com C-3PO/);
  assert.match(ui, /abrirConsoleOrquestracao\?\.\(c\.identificador\)/);
  const abertura = app.slice(app.indexOf('window.abrirConsoleOrquestracao ='), app.indexOf('abrirConsoleBtn.addEventListener'));
  assert.doesNotMatch(abertura, /mandarMensagemC3po/);
  assert.match(abertura, /entrada\.value/);
});
