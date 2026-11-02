// Simulação ponta a ponta do zelador (F3): um job completo num projeto falso com 5 cartas, pelas portas reais (play, leases, diário, escritor, git), com Plane, CLI, sessões e consumo falsos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarCenario, PROJETO_FALSO } from './fixtures/zelador/cenario.js';
import { HUMANO } from './fixtures/zelador/plane-falso.js';

const HORA = 3_600_000;

export async function cenarioCincoCartas() {
  const c = await montarCenario({
    responder: (_entrada, { plane, commitFeito }) => ({ vereditos: [
      { carta: 'FALSO-1', veredito: 'FECHAR', evidencias: [{ tipo: 'commit', sha: commitFeito }, { tipo: 'arquivo', caminho: 'exportador.js', linha: 1 }],
        comentario: 'O exportador CSV está no ramo principal (commit e arquivo citados); a carta mentia como aberta.' },
      { carta: 'FALSO-2', veredito: 'DONO', labelsTrava: ['ASTARGNE'], evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }],
        comentario: 'Escolher o formato público do relatório é decisão de produto do dono.' },
      { carta: 'FALSO-3', veredito: 'FECHAR', evidencias: [{ tipo: 'commit', sha: commitFeito }], comentario: 'Tentativa de fechar carta com gate, que não é candidata.' },
      { carta: 'FALSO-4', veredito: 'CANCELAR', evidencias: [{ tipo: 'carta', carta: 'FALSO-1' }], comentario: 'Duplicata da FALSO-1, segundo a CLI.' },
      { carta: 'FALSO-5', veredito: 'ATUALIZAR', trecho: 'versão antiga do texto', novoTrecho: 'o exportador CSV já existe; falta só o filtro por data',
        evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }], comentario: 'A descrição dizia que nada existia; o docs/current.md mostra o exportador pronto.' },
    ] }),
  });
  const { plane } = c;
  const agora = c.agora();
  plane.novaCarta({ nome: 'Exportar CSV' });
  const astargne = plane.novaCarta({ nome: 'Formato do relatório' });
  plane.atividade(astargne.id, { field: 'labels', verb: 'updated', old_value: 'ASTARGNE', new_value: '', actor: HUMANO, created_at: new Date(agora - 72 * HORA).toISOString() });
  plane.novaCarta({ nome: 'Carta com gate', etiquetas: ['READY TO DEV'] });
  const recente = plane.novaCarta({ nome: 'Mexida há pouco' });
  plane.atividade(recente.id, { field: 'name', verb: 'updated', old_value: 'x', new_value: 'Mexida há pouco', actor: HUMANO, created_at: new Date(agora - HORA).toISOString() });
  plane.novaCarta({ nome: 'Filtro do exportador', descricao: '<p>Escopo: versão antiga do texto.</p><p>Sem dependências.</p>' });
  return c;
}

test('simulação: um job em 5 cartas — feita no git FECHA, ASTARGNE tirada por humano não volta (J57), gate não é tocado, atividade recente pula, a comum ATUALIZA', async () => {
  const c = await cenarioCincoCartas();
  try {
    const r = await c.zelador.rodarUmaVez();
    assert.equal(r.resultado, 'CONCLUIDO', JSON.stringify(r));
    const carta = n => [...c.plane.cartas.values()].find(x => x.sequence_id === n);
    assert.equal(carta(1).state.group, 'completed', 'FALSO-1 fechada');
    assert.deepEqual(carta(2).labels.map(l => l.name), [], 'FALSO-2: o zelador não repõe o ASTARGNE que o humano tirou');
    assert.deepEqual(carta(3).labels.map(l => l.name), ['READY TO DEV']);
    assert.equal(carta(3).state.group, 'unstarted', 'FALSO-3 com gate intocada');
    assert.equal(carta(4).state.group, 'unstarted', 'FALSO-4 com atividade recente intocada');
    assert.match(carta(5).description_html, /o exportador CSV já existe; falta só o filtro por data/);
    assert.deepEqual(c.plane.escritas, ['comentario:FALSO-1', 'patch:FALSO-1:state', 'comentario:FALSO-1',
      'comentario:FALSO-5', 'patch:FALSO-5:description_html', 'comentario:FALSO-5'], 'intenção → mudança → recibo, só nas duas cartas');
    const intencao = c.plane.comentarios.get(carta(1).id)[0];
    assert.match(intencao.comment_html, /^<p>\[ZELADOR\/v1 veredito=FECHAR chave=[0-9a-f]{16}\]<\/p>/);
    assert.equal(intencao.external_source, 'zelador-hangar-v1');
    assert.match(intencao.comment_html, /arquivo exportador\.js/);
    assert.doesNotMatch(intencao.comment_html, /export const csv/, 'do arquivo só o caminho vai ao comentário (J69)');
    const diario = await c.lerDiario();
    const vereditos = diario.filter(l => l.tipo === 'VEREDITO').map(l => [l.carta, l.veredito, l.resultado ?? null, l.motivo ?? null]);
    assert.deepEqual(vereditos, [
      ['FALSO-1', 'FECHAR', 'APLICADO', null],
      ['FALSO-2', 'DONO', 'MANTER', 'outro ator tirou ASTARGNE; o zelador não repõe'],
      ['FALSO-3', 'MANTER', null, 'carta fora das candidatas do retrato'],
      ['FALSO-4', 'MANTER', null, 'carta fora das candidatas do retrato'],
      ['FALSO-5', 'ATUALIZAR', 'APLICADO', null],
    ]);
    assert.deepEqual(diario.filter(l => l.tipo === 'INTOCAVEL').map(l => [l.carta, l.motivo]),
      [['FALSO-3', 'carta com gate (portão próprio)'], ['FALSO-4', 'atividade de outro ator nas últimas 2 h']]);
    const fim = diario.find(l => l.tipo === 'JOB_FIM');
    assert.equal(fim.resultado, 'CONCLUIDO');
    assert.deepEqual(fim.fim.categorias.esperaIntegracao, ['orq/falso-9-abc'], 'J70: o ramo de tentativa aparece');
    assert.equal(fim.fim.soDono, false);
    assert.deepEqual(diario.map(l => l.tipo).filter(t => t.startsWith('JOB_')), ['JOB_INICIO', 'JOB_FIM']);
    assert.deepEqual(await c.zelador.diario.pendentes(), [], 'nada pela metade');
    const tela = await c.zelador.estado();
    assert.equal(tela.atual, null, 'o droid volta quando o job termina');
    assert.equal(tela.porProjeto[PROJETO_FALSO].retrato.abertas, 4);
  } finally { await c.limpar(); }
});
