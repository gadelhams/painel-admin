// Cenário da F4b montado pelas portas reais: dois projetos do catálogo (PAINEL e CAD) num Plane falso, fila, despacho, vigília, play, zelador (com o escritor de verdade) e reservas; CLIs, executor, sandbox e sessões falsos. Nada de rede nem de CLI paga.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJETOS } from '../../projetos.js';
import { criarEstadoOrquestracao } from '../../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../../orquestrador/fila.js';
import { PlayHangar } from '../../orquestrador/play.js';
import { criarVigilia } from '../../orquestrador/vigilia.js';
import { criarZelador } from '../../orquestrador/zelador.js';
import { criarEscritorZelador } from '../../orquestrador/escritor-zelador-plane.js';
import { criarElegibilidadeGateZelador } from '../../orquestrador/zelador-gate.js';
import { ReservasCarta } from '../../orquestrador/reservas.js';
import { codificarGate } from '../../orquestrador/gate-plane.js';
import { gravarFrota, conteudoFrota, tupla } from './frota/frota.js';
import { criarPlaneFalso, HUMANO } from './zelador/plane-falso.js';

export { HUMANO };
export const PAINEL = PROJETOS.find(p => p.sigla === 'PAINEL');
export const CAD = PROJETOS.find(p => p.sigla === 'CAD');
// As identidades técnicas de escrita (falsas) de cada projeto.
export const AUTOR = { [PAINEL.plane]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', [CAD.plane]: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };

const git = (pasta, ...args) => execFileSync('git', args, { cwd: pasta, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).toString().trim();
const contratoDe = p => ({ versao: 1, optIn: true, projetoPlane: p.plane, ambiente: 'offline', tiposTeste: ['unitário'], criteriosAceite: ['passou'],
  acoesProibidas: ['deploy'], comandos: [{ id: 'testes', executavel: 'npm', argumentos: ['test'] }],
  agentes: [{ id: 'Claude', provedor: 'claude', modelo: 'claude-opus-5', esforco: 'max', disponivel: true }], vigilia: { maxTentativasPorCarta: 2, tetoPorDia: 6 } });

export async function montarF4b({ inicio = Date.parse('2026-10-31T12:00:00Z'), responder = () => ({ vereditos: [] }), executar = null,
  sandboxOk = true, tetoDia = 12, comCad = true } = {}) {
  let tempo = inicio;
  const agora = () => tempo;
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-f4b-'));
  const projetos = comCad ? [PAINEL, CAD] : [PAINEL];
  for (const p of projetos) {
    const pasta = path.join(raiz, p.pasta);
    await fs.mkdir(path.join(pasta, 'docs'), { recursive: true });
    git(raiz, 'init', '-q', '-b', 'main', pasta);
    git(pasta, 'config', 'user.email', 'teste@exemplo'); git(pasta, 'config', 'user.name', 'Teste');
    await fs.writeFile(path.join(pasta, 'docs', 'current.md'), '# Estado\n\nO exportador CSV tem escopo e aceite escritos.\n');
    await fs.writeFile(path.join(pasta, '.orquestrador.json'), JSON.stringify(contratoDe(p)));
    await fs.writeFile(path.join(pasta, '.gitignore'), '.orquestrador.json\n');
    git(pasta, 'add', 'docs', '.gitignore'); git(pasta, 'commit', '-q', '-m', `${p.sigla}: estado inicial`);
  }
  const planes = new Map(projetos.map(p => [p.plane, criarPlaneFalso({ projetoId: p.plane, sigla: p.sigla, agora })]));
  const plane = planes.get(PAINEL.plane);
  // A Guest lê todos os projetos e a lista de projetos, como o cliente real.
  const consultar = async url => {
    if (url.split('?')[0] === '/projects/') return { results: projetos.map(p => ({ id: p.plane, identifier: p.sigla, name: p.titulo })), next_page_results: false };
    const alvo = [...planes.values()].find(pl => url.startsWith(`/projects/${pl.projetoId}/`));
    if (!alvo) throw new Error(`Plane falso: projeto desconhecido em ${url}`);
    return alvo.consultar(url);
  };
  const diretorio = path.join(raiz, 'estado');
  await gravarFrota(diretorio, conteudoFrota({ zelador: tupla('claude', 'high') }));
  const reservas = new ReservasCarta({ diretorioEstado: raiz, agora });
  const cartaReservada = id => reservas.ocupadaPorOutro(id);
  const estado = criarEstadoOrquestracao({ diretorio, agora, cartaReservada });
  const handoffs = [];
  // Escritores falsos da identidade técnica de cada projeto: gravam no Plane falso como o real.
  const identidadesEscrita = Object.fromEntries(projetos.map(p => {
    const pl = planes.get(p.plane);
    return [p.plane, { autorEscrita: AUTOR[p.plane],
      escritorHandoff: async ({ cartaId, html }) => { handoffs.push(html); return pl.comentar(cartaId, { html, autor: AUTOR[p.plane], externalSource: 'orquestrador-handoff-v1' }).id; },
      escritorGate: async () => ({ comentarioId: randomUUID() }),
      escritorEstado: async ({ cartaId, grupo }) => {
        const c = pl.cartas.get(cartaId);
        c.state = { ...pl.estados.find(e => e.group === grupo) };
        c.updated_at = new Date(agora()).toISOString();
        return { estadoNome: c.state.name, versaoCarta: c.updated_at };
      } }];
  }));
  const executados = [];
  let soltar = () => {};
  const executor = { validar: async () => {}, executar: executar ?? (async (pedido) => {
    executados.push(pedido);
    await new Promise(r => { soltar = r; });
    return { resultado: 'rejeitado', resumo: 'Tentativa terminou com a suíte vermelha.', evidencia: ['comando testes: código 1'] };
  }) };
  let elegibilidade = async () => ({ ok: false, motivo: 'montagem incompleta' });
  const servico = criarServicoOrquestracao({ consultar, raiz, estado, identidadesEscrita, executor, execucaoHabilitada: true, cartaReservada,
    gateZelador: id => elegibilidade(id), agora });
  const play = new PlayHangar({ diretorio, comTrava: estado.comTrava, projetos, agora });
  const sandbox = { sondar: async () => (sandboxOk ? { ok: true, motivo: null } : { ok: false, motivo: 'bwrap ausente em /usr/bin/bwrap' }) };
  elegibilidade = criarElegibilidadeGateZelador({ sandbox, play, contrato: id => servico.contrato(id), identidade: id => servico.identidade(id) });
  const vigilia = criarVigilia({ servico, play, diretorioEstado: diretorio, projetos, agora, tetoDia });
  const chaves = path.join(raiz, 'chaves');
  await fs.mkdir(chaves);
  const arquivoChave = path.join(chaves, 'zelador.token');
  await fs.writeFile(arquivoChave, `${plane.chave}\n`, { mode: 0o600 });
  let zelador = null;
  const escritor = criarEscritorZelador({ escopoPermitido: id => play.ligado(id), escopoRecibo: (id, chave) => zelador.escopoRecibo(id, chave),
    arquivoChave, fetchImpl: (url, o) => planes.get(/projects\/([0-9a-f-]{36})\//.exec(url)?.[1])?.fetchImpl(url, o) ?? plane.fetchImpl(url, o), apiBase: 'http://plane.falso' });
  const pedidos = [];
  const cli = { rodar: async (t, entrada) => { pedidos.push(entrada); const r = await responder(entrada, { plane }); return { ok: true, texto: JSON.stringify(r), uso: { duracaoMs: 1, custoUsd: 0.01 } }; } };
  const lerConsumo = async () => ({ claude: { disponivel: true, tipo: 'assinatura', janelas: [{ percentual: 20, janela: '5h', atualizadoEm: new Date(tempo - 60_000).toISOString() }] } });
  zelador = criarZelador({ servico, estado, play, escritor, diretorio, consultar, lerConsumo, ocupacao: async () => ({ ocupado: false, motivo: null }), cli, raiz, agora,
    projetos, pendenciasMesa: async () => [], elegibilidadeGate: id => elegibilidade(id), cartaReservada });
  const frota = await servico.lerFrota();

  // Um recibo GATE/v1 válido de `autor` com a fonte dele, e a atividade que pôs a etiqueta.
  function gateDe(pl, carta, { autor, fonte = 'orquestrador-gate-v1', gate = 'READY TO DEV' }) {
    const chave = randomUUID();
    pl.comentar(carta.id, { autor, externalSource: fonte, externalId: chave,
      html: codificarGate({ projetoId: pl.projetoId, cartaId: carta.id, chaveIdempotencia: chave, versaoCarta: carta.updated_at, gate,
        justificativa: 'Escopo, aceite e dependências revisados.', evidencias: ['Sem dependências formais.'] }) });
    const etiqueta = pl.label(gate);
    carta.labels.push({ ...etiqueta });
    pl.atividade(carta.id, { field: 'labels', verb: 'updated', old_value: '', new_value: gate, new_identifier: etiqueta.id, actor: autor });
  }
  const pedidoDespacho = (carta, origemDespacho = 'dono') => ({ cartaId: carta.id, comandoId: 'testes', versaoCarta: carta.updated_at,
    frotaVersao: frota.versao, frotaHash: frota.hash, chaveIdempotencia: randomUUID(), usuarioId: '7', origemDespacho });
  const lerDiario = async () => (await zelador.diario.linhas({ janelaMs: 7 * 86_400_000 })).linhas;
  return { raiz, diretorio, estado, servico, play, plane, planes, vigilia, zelador, escritor, reservas, executados, handoffs, pedidos, gateDe, pedidoDespacho,
    lerDiario, consultar, agora, avancar: ms => { tempo += ms; }, soltar: () => soltar(), pasta: p => path.join(raiz, p.pasta),
    limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}
