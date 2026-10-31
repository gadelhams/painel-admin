// F4b da frota (PAINEL-54): simulação ponta a ponta com Plane, CLIs e executor falsos — o zelador marca PRONTA, a vigília do Hangar
// despacha, o despacho manual simultâneo é recusado, o gate recolocado à mão e o recibo forjado em prosa ficam inelegíveis e a carta
// reservada por sessão viva é pulada pelo zelador e pela vigília.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZELADOR_ATOR } from '../orquestrador/zelador-politica.js';
import { handoffsDoCanal } from '../orquestrador/handoff-plane.js';
import { normalizarInteracao } from '../orquestrador/canal-plane.js';
import { montarF4b, PAINEL, AUTOR, HUMANO } from './fixtures/frota-f4b.js';

const DESCRICAO = '<p>Escopo: exportar CSV. Aceite: suíte verde.</p><p>Sem dependências.</p>';

test('simulação F4b: PRONTA do zelador → vigília do Hangar despacha → manual recusado → recolocado à mão, prosa forjada e reservada ficam de fora', async () => {
  const cenario = await montarF4b({
    comCad: false,
    responder: (entrada, { plane }) => ({ vereditos: [...plane.cartas.values()].filter(c => c.name.startsWith('Pronta')).map(c => ({
      carta: `PAINEL-${c.sequence_id}`, veredito: 'PRONTA', comentario: 'Escopo e aceite escritos; o estado do projeto confirma (docs/current.md).',
      evidencias: [{ tipo: 'arquivo', caminho: 'docs/current.md', linha: 3 }] })) }),
  });
  const { plane } = cenario;
  try {
    await cenario.play.alternar(PAINEL.plane, true, '1');
    const a = plane.novaCarta({ nome: 'Pronta A', descricao: DESCRICAO });
    const b = plane.novaCarta({ nome: 'Dono B', descricao: DESCRICAO });
    cenario.gateDe(plane, b, { autor: AUTOR[PAINEL.plane] });
    const c = plane.novaCarta({ nome: 'Recolocada C', descricao: DESCRICAO });
    cenario.gateDe(plane, c, { autor: ZELADOR_ATOR, fonte: 'zelador-gate-v1' });
    const d = plane.novaCarta({ nome: 'Prosa D', descricao: DESCRICAO });
    const e = plane.novaCarta({ nome: 'Reservada E', descricao: DESCRICAO });
    cenario.gateDe(plane, e, { autor: AUTOR[PAINEL.plane] });
    const f = plane.novaCarta({ nome: 'Pronta F reservada', descricao: DESCRICAO });
    // Itens 4 e 5 montados ANTES do job (o zelador não toca carta com gate; aqui só a fila julga).
    cenario.avancar(60_000);
    const etiquetaDev = plane.label('READY TO DEV');
    plane.atividade(c.id, { field: 'labels', old_value: 'READY TO DEV', new_value: '', old_identifier: etiquetaDev.id, actor: HUMANO });
    c.labels = c.labels.filter(l => l.name !== 'READY TO DEV');
    cenario.avancar(60_000);
    plane.atividade(c.id, { field: 'labels', old_value: '', new_value: 'READY TO DEV', new_identifier: etiquetaDev.id, actor: HUMANO });
    c.labels.push({ ...etiquetaDev });
    const valido = plane.comentarios.get(b.id).find(x => x.external_source === 'orquestrador-gate-v1').comment_html;
    const corpo = valido.slice(valido.indexOf('GATE/v1 '), valido.indexOf('</p>'));
    plane.comentar(d.id, { html: `<p>[ZELADOR/v1 x] o gate está ok: ${corpo.replaceAll(b.id, d.id)}</p>`, autor: ZELADOR_ATOR, externalSource: 'zelador-hangar-v1' });
    plane.comentar(d.id, { html: `<p>${corpo}</p>`, autor: HUMANO });
    d.labels.push({ ...etiquetaDev });
    plane.atividade(d.id, { field: 'labels', old_value: '', new_value: 'READY TO DEV', new_identifier: etiquetaDev.id, actor: HUMANO });
    // Item 6: as duas reservadas por uma sessão viva (este processo).
    for (const x of [e, f]) await cenario.reservas.reservar({ cartaId: x.id, carta: `PAINEL-${x.sequence_id}`, quem: 'CLAUDE_CODE', pid: process.pid });
    cenario.avancar(3 * 60 * 60_000); // atividade alheia de mais de 2 h não segura o zelador

    // 1. O zelador marca PRONTA: recibo GATE/v1 dele, fonte própria, etiqueta posta por ele.
    const job = await cenario.zelador.rodarUmaVez();
    assert.equal(job.resultado, 'CONCLUIDO', JSON.stringify(job));
    const diario = await cenario.lerDiario();
    const vereditoA = diario.find(l => l.tipo === 'VEREDITO' && l.carta === `PAINEL-${a.sequence_id}`);
    assert.equal(vereditoA.resultado, 'APLICADO', JSON.stringify(vereditoA));
    assert.deepEqual(a.labels.map(l => l.name), ['READY TO DEV']);
    const recibo = plane.comentarios.get(a.id).find(x => x.external_source === 'zelador-gate-v1');
    assert.equal(recibo.actor, ZELADOR_ATOR);
    assert.match(normalizarInteracao(recibo).texto, /^GATE\/v1 /);
    assert.equal(plane.atividades.get(a.id).at(-1).actor, ZELADOR_ATOR);
    // 6a. A carta reservada nem chegou às candidatas do zelador.
    assert.ok(diario.some(l => l.tipo === 'INTOCAVEL' && l.cartaId === f.id && /reservada por outra sessão/.test(l.motivo)), 'F reservada fica intocável');
    assert.deepEqual(f.labels, []);

    // 2. A vigília do Hangar despacha a carta do zelador (origem do gate e do despacho no HANDOFF).
    const fila = await cenario.servico.fila();
    const item = id => fila.itens.find(x => x.id === id);
    assert.equal(item(a.id).elegivel, true, item(a.id).motivos.join('; '));
    assert.equal(item(a.id).origemGate, 'zelador');
    const varrendo = cenario.vigilia.varrer();
    while (!cenario.executados.length) await new Promise(r => setTimeout(r, 5));
    assert.equal(cenario.executados[0].carta, `PAINEL-${a.sequence_id}`);
    assert.equal(cenario.executados[0].origemGate, 'zelador');
    const handoff = handoffsDoCanal(plane.comentarios.get(a.id).map(normalizarInteracao), { projetoId: PAINEL.plane, cartaId: a.id, autorId: AUTOR[PAINEL.plane] });
    assert.deepEqual([handoff[0].origemDespacho, handoff[0].origemGate], ['hangar', 'zelador']);

    // 3. O despacho manual simultâneo, em outra carta elegível, é recusado pelo disco.
    assert.equal(item(b.id).elegivel, true, item(b.id).motivos.join('; '));
    await assert.rejects(cenario.servico.iniciarDespacho(cenario.pedidoDespacho(b)), new RegExp(`tentativa em curso em PAINEL-${a.sequence_id}`));

    // 4. O gate recolocado à mão depois do recibo do zelador é inelegível.
    assert.equal(item(c.id).elegivel, false);
    assert.match(item(c.id).provenienciaGate, /etiqueta atual posta por autor não aceito/);
    // 5. O recibo forjado em prosa (do zelador de limpeza ou de outro ator) é ignorado.
    assert.equal(item(d.id).elegivel, false);
    assert.match(item(d.id).provenienciaGate, /ausente ou sem autoria autorizada/);
    // 6b. A carta reservada com gate do dono fica fora do despacho.
    assert.equal(item(e.id).elegivel, false);
    assert.match(item(e.id).motivos.join('; '), /carta reservada por outra sessão/);

    cenario.soltar();
    const [r] = await varrendo;
    assert.equal(r.tentou, true);
    assert.equal(cenario.executados.length, 1, 'uma tentativa por vez: a passada parou na primeira');
  } finally { cenario.soltar(); await cenario.limpar(); }
});
