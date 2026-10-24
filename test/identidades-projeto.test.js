import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { codificarGate } from '../orquestrador/gate-plane.js';

const projetos = [
  { id: '7ce26c40-6e46-49a8-9a7d-bf06bbda6542', identifier: 'CKBL', name: 'CKBL',
    carta: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', autor: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' },
  { id: 'bbcd79e6-ff42-4a2e-8d9d-72011021e664', identifier: 'PLAYER', name: 'PLAYER',
    carta: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', autor: 'dddddddd-dddd-4ddd-dddd-dddddddddddd' },
];

test('identidades de escrita por projeto decodificam apenas comentários do próprio ator', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-identidades-'));
  try {
    const comentarios = new Map(projetos.map(p => [p.id, [
      { id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', actor: p.autor,
        comment_html: codificarGate({ projetoId: p.id, cartaId: p.carta,
          chaveIdempotencia: 'ffffffff-ffff-4fff-ffff-ffffffffffff', versaoCarta: '2026-10-20T08:00:00Z',
          gate: 'READY TO DEV', justificativa: 'Escopo pronto.', evidencias: ['Revisão no Plane'] }) },
      { id: '11111111-1111-4111-8111-111111111111', actor: projetos.find(x => x.id !== p.id).autor,
        comment_html: codificarGate({ projetoId: p.id, cartaId: p.carta,
          chaveIdempotencia: '22222222-2222-4222-8222-222222222222', versaoCarta: '2026-10-20T08:00:00Z',
          gate: 'READY TO TEST', justificativa: 'Autor errado.', evidencias: ['Não confiar'] }) },
    ]]));
    const consultar = async url => {
      if (url.startsWith('/projects/?')) return { results: projetos };
      const p = projetos.find(x => url.includes(`/projects/${x.id}/`));
      if (!p) throw new Error(`consulta inesperada ${url}`);
      if (url.includes('/work-items/?')) return { results: [{ id: p.carta, name: 'Piloto', sequence_id: 38,
        parent: null, labels: [{ name: 'READY TO DEV' }], state: { name: 'Todo', group: 'unstarted' },
        description_html: '<p>Sem dependências.</p>', updated_at: '2026-10-20T08:00:00Z' }] };
      if (url.includes('/relations/')) return { blocked_by: [] };
      if (url.includes('/comments/')) return { results: comentarios.get(p.id), next_page_results: false };
      if (url.endsWith(`/${p.carta}/`)) return { id: p.carta };
      throw new Error(`consulta inesperada ${url}`);
    };
    const identidadesEscrita = Object.fromEntries(projetos.map(p => [p.id,
      { autorEscrita: p.autor, escritorGate: async () => { throw Error('não deveria escrever'); } }]));
    const servico = criarServicoOrquestracao({ consultar, raiz,
      estado: criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') }), identidadesEscrita });
    for (const p of projetos) {
      const canal = await servico.canal(p.carta);
      assert.equal(canal.gates.length, 1);
      assert.equal(canal.gates[0].gate, 'READY TO DEV');
      assert.equal(canal.gates[0].autorId, p.autor);
      assert.equal((await servico.preavaliar(p.carta, 'READY TO TEST')).podeRegistrarGate, true);
    }
    assert.equal((await servico.fila()).execucaoHabilitada, false);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
