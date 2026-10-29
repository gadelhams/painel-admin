import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { avaliarCarta, comandoEstaticoSeguro, comandoPermitido, validarContrato } from '../orquestrador/politica.js';
import { criarEstadoOrquestracao } from '../orquestrador/estado.js';
import { dependenciasDaCarta, criarServicoOrquestracao } from '../orquestrador/fila.js';
import { argumentosModeloCli } from '../orquestrador/modelos.js';
import { gravarFrota } from './fixtures/frota/frota.js';
import { codificarGate } from '../orquestrador/gate-plane.js';

const PROJETO = 'c24e3d36-2e2a-4760-a3f3-53998297a245';
const CARTA = 'd5b2f207-6076-4507-b85a-59ea9cfa56da';
const DEP = '050ee08a-f4c5-44cc-901f-b5eb4b74d333';
const AUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const contrato = {
  versao: 1, optIn: true, projetoPlane: PROJETO, ambiente: 'offline',
  tiposTeste: ['unitário'], criteriosAceite: ['passou'], acoesProibidas: ['deploy'],
  comandos: [{ id: 'teste', executavel: 'npm', argumentos: ['test'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true }],
};
const carta = { id: CARTA, labels: [{ name: 'READY TO DEV' }], state: { name: 'Todo', group: 'unstarted' }, filhos: [] };

test('gate único, estado, folha, dependência e decisão humana são necessários', () => {
  assert.equal(validarContrato(contrato, PROJETO).length, 0);
  assert.equal(avaliarCarta(carta, { contrato }).elegivel, true);
  assert.match(avaliarCarta({ ...carta, labels: [{ name: 'READY TO DEV' }, { name: 'READY TO TEST' }] }, { contrato }).motivos.join(' '), /dois gates/);
  assert.match(avaliarCarta(carta, { contrato: null }).motivos.join(' '), /contrato local ausente/);
  assert.match(avaliarCarta(carta, { contrato, dependencias: [{ id: 'PAINEL-1', estado: 'pendente' }] }).motivos.join(' '), /dependência PAINEL-1/);
  assert.match(avaliarCarta({ ...carta, labels: [{ name: 'READY TO DEV' }, { name: 'ASTARGNE' }] }, { contrato }).motivos.join(' '), /decisão humana/);
  assert.match(avaliarCarta({ ...carta, filhos: [DEP] }, { contrato }).motivos.join(' '), /folha/);
  assert.match(avaliarCarta(carta, { contrato: { ...contrato, agentes: [{ ...contrato.agentes[0], disponivel: false }] } }).motivos.join(' '), /nenhum agente elegível/);
  assert.match(avaliarCarta(carta, { contrato, erroEstado: 'touchpoints' }).motivos.join(' '), /estado operacional ilegível/);
});

test('fila lista todos os agentes disponíveis sem atribuir responsável implicitamente', () => {
  const doisAgentes = { ...contrato, agentes: [contrato.agentes[0],
    { id: 'OpenAI', provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'extreme high', disponivel: true }] };
  const avaliacao = avaliarCarta(carta, { contrato: doisAgentes });
  assert.equal(avaliacao.elegivel, true);
  assert.deepEqual(avaliacao.agentesDisponiveis.map(a => a.id), ['Claude', 'OpenAI']);
  // J-L4: do contrato só sai o interruptor; modelo e esforço são da frota.
  assert.deepEqual(avaliacao.agentesDisponiveis, [{ id: 'Claude', provedor: 'claude' }, { id: 'OpenAI', provedor: 'openai' }]);
  assert.deepEqual(avaliacao.agente, { id: 'Claude', provedor: 'claude' });
  assert.equal(avaliacao.lease, null);
  assert.equal(avaliacao.tentativa, null);

  const nenhum = avaliarCarta(carta, { contrato: { ...doisAgentes,
    agentes: doisAgentes.agentes.map(a => ({ ...a, disponivel: false })) } });
  assert.deepEqual(nenhum.agentesDisponiveis, []);
  assert.match(nenhum.motivos.join(' '), /nenhum agente elegível/);
});

test('dependência informal e relação pendente bloqueiam; relação concluída passa', () => {
  const alvo = { id: DEP, sigla: 'PAINEL', sequence_id: 32, state: { name: 'Todo', group: 'unstarted' } };
  const origem = { ...carta, description_html: '<p>Depende de: PAINEL-32</p>' };
  const mapa = new Map([[DEP, alvo]]);
  assert.equal(dependenciasDaCarta(origem, { blocked_by: [] }, mapa)[0].estado, 'não formalizada');
  assert.equal(dependenciasDaCarta(carta, { blocked_by: [] }, mapa)[0].estado, 'não auditada');
  assert.deepEqual(dependenciasDaCarta({ ...carta, description_html: '<p>Sem dependências.</p>' }, { blocked_by: [] }, mapa), []);
  assert.equal(dependenciasDaCarta(origem, { blocked_by: [{ related_work_item: DEP }] }, mapa)[0].estado, 'pendente');
  assert.equal(dependenciasDaCarta(origem, { blocked_by: [{ project_id: PROJETO, issue_id: DEP }] }, mapa)[0].id, 'PAINEL-32');
  const outra = { id: CARTA, sigla: 'PAINEL', sequence_id: 30, state: { name: 'Done', group: 'completed' } };
  mapa.set(CARTA, outra);
  assert.deepEqual(dependenciasDaCarta(origem, { blocked_by: [{ issue_id: CARTA }] }, mapa).map(x => x.estado), ['concluida', 'não formalizada'],
    'uma relação formal com outra carta não valida a dependência mencionada');
  assert.equal(dependenciasDaCarta({ ...origem, description_html: '<p>Depende de: PAINEL-32 e PAINEL-30</p>' },
    { blocked_by: [{ issue_id: DEP }, { issue_id: CARTA }] }, mapa).length, 2);
  assert.equal(dependenciasDaCarta({ ...origem, description_html: '<p>Depende de: decisão humana</p>' },
    { blocked_by: [{ issue_id: DEP }] }, mapa).at(-1).estado, 'não formalizada');
  assert.equal(dependenciasDaCarta({ ...origem, description_html: '<p>Sem dependências.</p>' },
    { blocked_by: [{ issue_id: DEP }] }, mapa).at(-1).estado, 'contraditória');
  alvo.state = { name: 'Done', group: 'completed' };
  assert.equal(dependenciasDaCarta(origem, { blocked_by: [{ related_work_item: DEP }] }, mapa)[0].estado, 'concluida');
  assert.equal(dependenciasDaCarta(origem, null, mapa)[0].estado, 'desconhecida');
  assert.equal(dependenciasDaCarta(origem, { blocked_by: 'ilegível' }, mapa)[0].estado, 'desconhecida');
  assert.equal(dependenciasDaCarta({ ...carta, description_html: null }, { blocked_by: [] }, mapa)[0].estado, 'não auditada');
  const fraseIncidental = { ...carta, description_html: '<p>homeProxy.js (novo, sem dependências)</p>' };
  assert.deepEqual(dependenciasDaCarta(fraseIncidental, { blocked_by: [{ issue_id: DEP }] }, mapa).map(x => x.estado), ['concluida'],
    'menção a pacotes npm não contradiz relações do Plane');
  assert.equal(dependenciasDaCarta(fraseIncidental, { blocked_by: [] }, mapa)[0].estado, 'não auditada',
    'menção incidental não declara independência da carta');
  assert.equal(dependenciasDaCarta({ ...carta, description_html: '<p>Sem dependências: homeProxy.js só usa Node.</p>' },
    { blocked_by: [] }, mapa)[0].estado, 'não auditada', 'a declaração precisa ocupar a linha inteira');
  assert.deepEqual(dependenciasDaCarta({ ...carta, description_html: '<p>Dependências: nenhuma.</p>' }, { blocked_by: [] }, mapa), []);
});

test('contrato rejeita downgrade e comando perigoso; solicitação não pode inventar comando', () => {
  assert.match(validarContrato({ ...contrato, agentes: [{ ...contrato.agentes[0], esforco: 'high' }] }, PROJETO).join(' '), /esforço/);
  assert.match(validarContrato({ ...contrato, comandos: [{ id: 'jogo', executavel: 'npm', argumentos: ['run', 'playtest'] }] }, PROJETO).join(' '), /comandos/);
  assert.throws(() => comandoPermitido(contrato, 'deploy'), /proibido/);
  assert.equal(comandoPermitido(contrato, 'teste').id, 'teste');
});

test('contrato só admite comandos de teste estáticos, sem eval, flags extras ou travessia', () => {
  const validos = [
    { id: 'docs', executavel: 'python3', argumentos: ['scripts/check_docs.py'] },
    { id: 'planejamento', executavel: 'node', argumentos: ['scripts/check-planning.mjs'] },
    { id: 'testes-planejamento', executavel: 'node', argumentos: ['--test', 'scripts/planning.test.mjs'] },
    { id: 'testes', executavel: 'npm', argumentos: ['test'] },
  ];
  assert.equal(validos.every(comandoEstaticoSeguro), true);
  for (const argumentos of [
    ['-e', 'process.exit(0)'], ['--import', 'scripts/check-planning.mjs'],
    ['scripts/../outro.mjs'], ['--test', '../outro.test.mjs'],
    ['--test', 'scripts/planning.test.mjs', '--inspect'],
  ]) assert.equal(comandoEstaticoSeguro({ id: 'teste', executavel: 'node', argumentos }), false);
  assert.equal(comandoEstaticoSeguro({ id: 'teste', executavel: 'python3', argumentos: ['-c', 'print(1)'] }), false);
  assert.equal(comandoEstaticoSeguro({ id: 'teste', executavel: 'npm', argumentos: ['run', 'test'] }), false);
  assert.match(validarContrato({ ...contrato, comandos: [validos[0], validos[0]] }, PROJETO).join(' '), /comandos/);
  assert.match(validarContrato({ ...contrato, agentes: [contrato.agentes[0], contrato.agentes[0]] }, PROJETO).join(' '), /agentes/);
  assert.match(validarContrato({ ...contrato, agentes: [{ ...contrato.agentes[0], modelo: '--fallback-model' }] }, PROJETO).join(' '), /agentes/);
  assert.throws(() => comandoPermitido({ ...contrato, comandos: [{ id: 'teste', executavel: 'node', argumentos: ['-e', '1'] }] }, 'teste'), /proibido/);
});

// Reescrito na F2 (29/10/2026): as flags vêm do plano da frota, conferido contra o catálogo fechado.
test('prévia de CLI conserva modelo e esforço do plano, sem fallback ou spawn', () => {
  const papeis = {
    orquestracao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max' },
    codificacao_testes: { provedor: 'openai', modelo: 'gpt-6-astra', esforco: 'xhigh' },
    validacao: { provedor: 'claude', modelo: 'claude-opus-5', esforco: 'high' },
  };
  const plano = { papeis };
  assert.deepEqual(argumentosModeloCli(plano, 'orquestracao'), {
    executavel: 'claude', argumentos: ['--model', 'claude-opus-5', '--effort', 'max'],
  });
  assert.deepEqual(argumentosModeloCli(plano, 'codificacao_testes'), {
    executavel: 'codex', argumentos: ['exec', '--model', 'gpt-6-astra', '--config', 'model_reasoning_effort=xhigh'],
  });
  assert.deepEqual(argumentosModeloCli(plano, 'validacao').argumentos, ['--model', 'claude-opus-5', '--effort', 'high']);
  assert.throws(() => argumentosModeloCli({ papeis: { ...papeis, codificacao_testes: { ...papeis.codificacao_testes, modelo: 'gpt-6-other' } } },
    'codificacao_testes'), /fora do catálogo/);
  assert.throws(() => argumentosModeloCli({ papeis: { ...papeis, codificacao_testes: { ...papeis.codificacao_testes, modelo: 'gpt-6-luna', esforco: 'ultra' } } },
    'codificacao_testes'), /fora do catálogo/);
  assert.throws(() => argumentosModeloCli(plano, 'desconhecido'), /papel/);
  assert.throws(() => argumentosModeloCli({ papeis: { ...papeis, zelador: papeis.orquestracao } }, 'zelador'), /papel/);
});

test('lease serializa concorrência, idempotência, expiração e recuperação', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-test-'));
  let tempo = Date.parse('2026-10-11T12:00:00Z');
  try {
    const estado = criarEstadoOrquestracao({ diretorio: raiz, agora: () => tempo, duracaoLeaseMs: 1000 });
    const disputas = await Promise.allSettled([
      estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'a' }),
      estado.reservar({ cartaId: CARTA, agente: 'OpenAI', chaveIdempotencia: 'b' }),
    ]);
    assert.equal(disputas.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(disputas.filter(x => x.status === 'rejected').length, 1);
    const primeiro = disputas.find(x => x.status === 'fulfilled').value;
    const duplicada = await estado.reservar({ cartaId: CARTA, agente: primeiro.lease.agente, chaveIdempotencia: primeiro.lease.chaveIdempotencia });
    assert.equal(duplicada.duplicada, true);
    tempo += 1001;
    const segundo = await estado.reservar({ cartaId: CARTA, agente: 'OpenAI', chaveIdempotencia: 'c' });
    assert.notEqual(segundo.lease.tentativaId, primeiro.lease.tentativaId);
    assert.equal((await estado.lerHistorico(CARTA)).filter(x => x.tipo === 'RECUPERACAO').length, 1);
    await assert.rejects(estado.concluir({ cartaId: CARTA, tentativaId: primeiro.lease.tentativaId, resultado: 'OK' }), /não possui/);
    const resultado = await estado.concluir({ cartaId: CARTA, tentativaId: segundo.lease.tentativaId, resultado: 'SIMULADO' });
    assert.equal((await estado.concluir({ cartaId: CARTA, tentativaId: segundo.lease.tentativaId, resultado: 'SIMULADO' })).tentativaId, resultado.tentativaId);
    assert.equal(await estado.lerLease(CARTA), null);
    const trava = path.join(raiz, '.trava');
    await fs.mkdir(trava);
    await fs.writeFile(path.join(trava, 'dono.json'), JSON.stringify({ pid: 999999999 }));
    await fs.utimes(trava, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    assert.equal((await estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'apos-interrupcao' })).duplicada, false);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('retomada reconcilia resultado persistido e lease órfão sem duplicar touchpoints', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-retomada-'));
  let tempo = Date.parse('2026-10-20T12:00:00Z');
  try {
    const estado = criarEstadoOrquestracao({ diretorio: raiz, agora: () => tempo, duracaoLeaseMs: 1000 });
    const primeira = await estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'primeira' });
    await estado.renovar({ cartaId: CARTA, tentativaId: primeira.lease.tentativaId });
    assert.equal((await estado.lerHistorico(CARTA)).filter(x => x.tipo === 'LEASE_RENOVADO').length, 1);
    // Interrupção exatamente depois de persistir RESULTADO e antes do unlink.
    await estado.registrarEvento({ tipo: 'RESULTADO', cartaId: CARTA,
      tentativaId: primeira.lease.tentativaId, resultado: 'OK' });
    const retomadas = await Promise.all([estado.reconciliar(CARTA), estado.reconciliar(CARTA)]);
    assert.deepEqual(retomadas.map(x => x.situacao).sort(), ['concluida', 'livre']);
    assert.equal(await estado.lerLease(CARTA), null);
    assert.equal((await estado.lerHistorico(CARTA)).filter(x => x.tipo === 'RECUPERACAO').length, 1);
    assert.equal((await estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'primeira' })).duplicada, true);

    // Interrupção entre a troca atômica do lease e o primeiro touchpoint.
    const orfaId = '8d213c45-90cb-4777-b3d2-17ab4eaa1ddd';
    const orfa = { cartaId: orfaId, tentativaId: '6fa5b79f-0ca9-490f-9341-35bc780a9f29',
      agente: 'OpenAI', chaveIdempotencia: 'orfa', expiraEm: new Date(tempo - 1).toISOString() };
    await fs.mkdir(path.join(raiz, 'leases'), { recursive: true });
    await fs.writeFile(path.join(raiz, 'leases', `${orfaId}.json`), JSON.stringify(orfa));
    const recuperada = await estado.recuperarInterrupcoes();
    assert.deepEqual(recuperada.map(x => x.situacao), ['expirado']);
    assert.equal(await estado.lerLease(orfaId), null);
    const eventos = await estado.lerHistorico(orfaId);
    assert.deepEqual(eventos.map(x => x.tipo), ['TENTATIVA', 'RECUPERACAO']);
    assert.equal(eventos[0].resultado, 'RECUPERADA_SEM_TOUCHPOINT');
    assert.deepEqual(await estado.recuperarInterrupcoes(), []);
    assert.equal((await estado.reservar({ cartaId: orfaId, agente: 'OpenAI', chaveIdempotencia: 'orfa' })).duplicada, true);

    const ativaId = '517284e0-16fb-4c6b-85e3-3a86a15d04bb';
    await fs.writeFile(path.join(raiz, 'leases', `${ativaId}.json`), JSON.stringify({ ...orfa,
      cartaId: ativaId, expiraEm: new Date(tempo + 1000).toISOString() }));
    assert.equal((await estado.reconciliar(ativaId)).situacao, 'ativo');
    assert.notEqual(await estado.lerLease(ativaId), null);
    assert.deepEqual(await estado.lerHistorico(ativaId), []);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('lease de execução real expirado fica em revisão; nunca reexecuta por TTL', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-real-expirado-'));
  let tempo = Date.parse('2026-10-20T12:00:00Z');
  try {
    const estado = criarEstadoOrquestracao({ diretorio: raiz, agora: () => tempo, duracaoLeaseMs: 1000 });
    const primeira = await estado.reservar({ cartaId: CARTA, agente: 'Claude', chaveIdempotencia: 'real-1', modoReal: true });
    tempo += 1001;
    assert.equal((await estado.reconciliar(CARTA)).situacao, 'revisao');
    assert.equal((await estado.reconciliar(CARTA)).situacao, 'revisao');
    assert.equal((await estado.lerHistorico(CARTA)).filter(x => x.resultado === 'EXECUCAO_INCONCLUSA').length, 1);
    assert.equal((await estado.lerLease(CARTA)).tentativaId, primeira.lease.tentativaId);
    await assert.rejects(estado.reservar({ cartaId: CARTA, agente: 'OpenAI', chaveIdempotencia: 'real-2', modoReal: true }), /revisão humana/);
    assert.match(avaliarCarta(carta, { contrato, lease: await estado.lerLease(CARTA), agora: tempo }).motivos.join(' '), /execução inconclusa/);
    await estado.concluir({ cartaId: CARTA, tentativaId: primeira.lease.tentativaId, resultado: 'FALHOU' });
    assert.equal(await estado.lerLease(CARTA), null);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('fila integra Plane, contrato local e simulação sem executar', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-fila-'));
  try {
    await fs.mkdir(path.join(raiz, 'painel-admin'));
    await fs.writeFile(path.join(raiz, 'painel-admin', '.orquestrador.json'), JSON.stringify(contrato));
    const consultas = [];
    const consultar = async url => {
      consultas.push(url);
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'painel admin', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [{ ...carta, name: 'Fazer algo', sequence_id: 99, project: PROJETO, parent: null, description_html: '<p>Sem dependências.</p>', updated_at: '2026-10-11T00:00:00Z' }] };
      if (url.includes('/relations/')) return { blocked_by: [] };
      if (url.endsWith(`/${CARTA}/`)) return { id: CARTA };
      if (url.includes('/comments/')) return { results: [{ id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', actor: AUTOR,
        comment_html: codificarGate({ projetoId: PROJETO, cartaId: CARTA,
          chaveIdempotencia: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', versaoCarta: '2026-10-11T00:00:00Z',
          gate: 'READY TO DEV', justificativa: 'Trabalho revisado para desenvolvimento.',
          evidencias: ['Escopo definido e sem dependências formais.'] }) }], next_page_results: false };
      throw new Error(`consulta inesperada ${url}`);
    };
    const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
    const servico = criarServicoOrquestracao({ consultar, raiz, estado,
      projetoEscrita: PROJETO, autorEscrita: AUTOR });
    // N6: sem frota a fila não diz "elegível"; diz por quê.
    const semFrotaNaFila = await servico.fila();
    assert.equal(semFrotaNaFila.itens[0].elegivel, false);
    assert.deepEqual(semFrotaNaFila.itens[0].motivos, ['frota ausente: nada despacha sem frota válida']);
    await gravarFrota(path.join(raiz, 'estado'));
    const fila = await servico.fila();
    assert.equal(fila.itens[0].elegivel, true);
    assert.equal(fila.projetos.find(p => p.id === PROJETO).candidatas, 1);
    assert.equal(fila.projetos.find(p => p.id === PROJETO).acessivel, true);
    assert.match(fila.projetos.find(p => p.nome === 'CK3 Bannerlord').impedimento, /Sem acesso de leitura/);
    assert.equal(fila.projetos.find(p => p.nome === 'SupervisorHandoff').cartas, 0);
    assert.equal(semFrotaNaFila.frota.estado, 'ausente');
    assert.equal(fila.frota.estado, 'ok');
    const comFrota = await servico.simular(CARTA, 'teste');
    assert.equal(comFrota.executaria, true);
    assert.equal(comFrota.plano.frota.versao, 1);
    await assert.rejects(servico.simular(CARTA, 'outro'), /proibido/);
    assert.ok(consultas.some(x => x.includes('/relations/')));
    assert.deepEqual(await estado.lerHistorico(CARTA), []);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});

test('pré-checagem DEV revela pendências de carta sem gate, sem alterar Plane ou lease', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-previa-'));
  try {
    const consultas = [];
    let etiquetas = [];
    const consultar = async url => {
      consultas.push(url);
      if (url.startsWith('/projects/?')) return { results: [{ id: PROJETO, name: 'painel admin', identifier: 'PAINEL' }] };
      if (url.includes('/work-items/?')) return { results: [
        { ...carta, labels: etiquetas, name: 'Implementar', sequence_id: 99, project: PROJETO, parent: null, description_html: '<p>Depende de: PAINEL-98</p>', updated_at: '2026-10-11T00:00:00Z' },
        { ...carta, id: DEP, labels: [], name: 'Base', sequence_id: 98, project: PROJETO, parent: null, description_html: '', updated_at: '2026-10-11T00:00:00Z' },
      ] };
      if (url.includes('/relations/')) return { blocked_by: [{ related_work_item: DEP }] };
      throw new Error(`consulta inesperada ${url}`);
    };
    const estado = criarEstadoOrquestracao({ diretorio: path.join(raiz, 'estado') });
    const servico = criarServicoOrquestracao({ consultar, raiz, estado });
    const previa = await servico.preavaliar(CARTA, 'READY TO DEV');
    assert.match(previa.ajustesDoGate.join(' '), /IA autorizada ou pessoa pode marcar READY TO DEV/);
    assert.match(previa.pendencias.join(' '), /dependência PAINEL-98/);
    assert.match(previa.pendencias.join(' '), /contrato local ausente/);
    assert.equal(previa.despachoPassaria, false);
    assert.ok(consultas.some(x => x.includes(`${CARTA}/relations/`)));
    assert.ok(!consultas.some(x => x.includes(`${DEP}/relations/`)), 'somente a carta pedida exige consulta extra');
    const teste = await servico.preavaliar(CARTA, 'READY TO TEST');
    assert.match(teste.ajustesDoGate.join(' '), /IA autorizada ou pessoa pode marcar READY TO TEST/);
    assert.match(teste.pendenciasTecnicas.join(' '), /estado inadequado para teste/);
    etiquetas = [{ name: 'READY TO DEV' }, { name: 'READY TO TEST' }];
    const duplo = await servico.preavaliar(CARTA, 'READY TO DEV');
    assert.match(duplo.ajustesDoGate.join(' '), /Resolver gates conflitantes/);
    await assert.rejects(servico.preavaliar(CARTA, 'READY TO DEPLOY'), /gate inválido/);
    assert.equal(await estado.lerLease(CARTA), null);
    assert.deepEqual(await estado.lerHistorico(CARTA), []);
  } finally { await fs.rm(raiz, { recursive: true, force: true }); }
});
