import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarProntidaoDev, criarTriagemDev } from '../orquestrador/triagem.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const ids = Object.fromEntries(['pai', 'semProva', 'dependente', 'bloqueio', 'livre', 'ready', 'cancelada', 'concluida', 'ilegivel']
  .map((nome, i) => [nome, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
const carta = (nome, numero, grupo, extras = {}) => ({ id: ids[nome], sequence_id: numero, name: nome,
  parent: null, state: { name: grupo, group: grupo }, labels: [], description_html: '', ...extras });

test('categorias distinguem decisão, dependência, estado e conteúdo não revisado', () => {
  assert.deepEqual(classificarProntidaoDev({ filhos: ['filho'] }), ['CARTA_PAI']);
  assert.deepEqual(classificarProntidaoDev({ labels: [], state: { group: 'unstarted' },
    description_html: '<p>Sem dependências.</p>' }), ['CONTEUDO_A_REVISAR']);
  const tipos = classificarProntidaoDev({ labels: [{ name: 'ASTARGNE' }, { name: 'PÓS-PLAYTEST' }],
    state: { group: 'backlog' } }, [{ id: 'PAINEL-30', estado: 'pendente' }]);
  assert.deepEqual(tipos, ['ASTARGNE', 'POS_PLAYTEST', 'DEPENDENCIA_PENDENTE', 'ESTADO_INADEQUADO']);
  assert.deepEqual(classificarProntidaoDev({ labels: [{ name: 'TAREFA DONO' }], state: { group: 'unstarted' },
    description_html: '<p>(TAREFA DONO: playtest) Sem dependências.</p>' }), ['TAREFA_DONO'], 'tarefa do dono trava o DEV sem virar decisão');
  assert.deepEqual(classificarProntidaoDev({ labels: [], state: { group: 'unstarted' } },
    [{ id: '?', estado: 'desconhecida' }]), ['DEPENDENCIA_INDISPONIVEL']);
  assert.deepEqual(classificarProntidaoDev({ labels: [], state: { group: 'backlog' } },
    [{ id: 'declaração', estado: 'não auditada' }]), ['DEPENDENCIA_NAO_AUDITADA', 'ESTADO_INADEQUADO']);
});

test('triagem só lê folhas abertas sem gate; categorias se sobrepõem sem marcar READY', async () => {
  const chamadas = [];
  const cartas = [
    carta('pai', 1, 'backlog'),
    carta('semProva', 2, 'backlog', { parent: ids.pai }),
    carta('dependente', 3, 'unstarted', { description_html: '<p>Depende de: PAINEL-2</p>' }),
    carta('bloqueio', 4, 'backlog', { labels: [{ name: 'ASTARGNE' }], description_html: '<p>Sem dependências.</p>' }),
    carta('livre', 5, 'unstarted', { description_html: '<p>Sem dependências.</p>' }),
    carta('ready', 6, 'unstarted', { labels: [{ name: 'READY TO DEV' }] }),
    carta('cancelada', 7, 'cancelled'),
    carta('concluida', 8, 'completed'),
    carta('ilegivel', 9, 'unstarted'),
  ];
  const consultar = async url => {
    chamadas.push(url);
    if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, identifier: 'PAINEL', name: 'Painel' }] };
    if (url.includes('/work-items/?')) return { results: cartas, next_page_results: false };
    if (url.includes(`/${ids.dependente}/relations/`)) return { blocked_by: [{ issue_id: ids.semProva }] };
    if (url.includes(`/${ids.ilegivel}/relations/`)) throw new Error('falha do Plane');
    if (url.includes('/relations/')) return { blocked_by: [] };
    throw new Error(`consulta inesperada ${url}`);
  };
  const triagem = criarTriagemDev({ consultar, concorrencia: 2 });
  const [dados, simultanea] = await Promise.all([triagem(), triagem()]);
  assert.strictEqual(dados, simultanea, 'leituras concorrentes partilham a mesma fotografia');
  assert.equal(chamadas.filter(url => url.startsWith('/projects/?')).length, 1);
  assert.equal(dados.total, 6);
  assert.equal(dados.folhas, 5);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-1').categorias, ['CARTA_PAI']);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-2').categorias,
    ['DEPENDENCIA_NAO_AUDITADA', 'ESTADO_INADEQUADO']);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-3').categorias, ['DEPENDENCIA_PENDENTE']);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-4').categorias,
    ['ASTARGNE', 'ESTADO_INADEQUADO']);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-5').categorias, ['CONTEUDO_A_REVISAR']);
  assert.deepEqual(dados.itens.find(x => x.identificador === 'PAINEL-9').categorias, ['DEPENDENCIA_INDISPONIVEL']);
  assert.equal(dados.categorias.find(x => x.codigo === 'ESTADO_INADEQUADO').total, 2);
  assert.ok(!chamadas.some(url => url.includes(`/${ids.pai}/relations/`)));
  assert.ok(!chamadas.some(url => url.includes(`/${ids.ready}/relations/`)));
  assert.ok(chamadas.every(url => !url.startsWith('POST ')));
  assert.match(dados.observacao, /Nenhum gate foi aplicado/);
});
