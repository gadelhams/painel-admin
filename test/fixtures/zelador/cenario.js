// Cenário do zelador montado pelas portas reais: estado, frota, play, leases, diário e escritor de verdade; Plane, CLI, sessões e consumo falsos; git de verdade num repositório temporário.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { criarEstadoOrquestracao } from '../../../orquestrador/estado.js';
import { criarServicoOrquestracao } from '../../../orquestrador/fila.js';
import { PlayHangar } from '../../../orquestrador/play.js';
import { criarZelador } from '../../../orquestrador/zelador.js';
import { criarEscritorZelador } from '../../../orquestrador/escritor-zelador-plane.js';
import { gravarFrota, conteudoFrota, tupla } from '../frota/frota.js';
import { criarPlaneFalso } from './plane-falso.js';

export const PROJETO_FALSO = '0f0f0f0f-1111-4222-8333-444455556666';

const git = (pasta, ...args) => execFileSync('git', args, { cwd: pasta, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).toString().trim();

export async function montarCenario({ inicio = Date.parse('2026-10-31T12:00:00Z'), responder = () => ({ vereditos: [] }), consumo = null,
  ocupacao = async () => ({ ocupado: false, motivo: null }), playLigado = true } = {}) {
  let tempo = inicio;
  const agora = () => tempo;
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'zelador-cenario-'));
  const pasta = path.join(raiz, 'proj-falso');
  await fs.mkdir(path.join(pasta, 'docs'), { recursive: true });
  git(raiz, 'init', '-q', '-b', 'main', pasta);
  git(pasta, 'config', 'user.email', 'teste@exemplo'); git(pasta, 'config', 'user.name', 'Teste');
  await fs.writeFile(path.join(pasta, 'docs', 'current.md'), '# Estado\n\nO exportador CSV está pronto.\n');
  await fs.writeFile(path.join(pasta, 'exportador.js'), 'export const csv = () => "a,b";\n');
  git(pasta, 'add', '.'); git(pasta, 'commit', '-q', '-m', 'FALSO-1: exportador CSV pronto');
  const commitFeito = git(pasta, 'rev-parse', 'HEAD');
  git(pasta, 'checkout', '-q', '-b', 'orq/falso-9-abc');
  await fs.writeFile(path.join(pasta, 'rascunho.js'), 'export const x = 1;\n');
  git(pasta, 'add', '.'); git(pasta, 'commit', '-q', '-m', 'ramo de tentativa não integrado');
  const commitForaDoPrincipal = git(pasta, 'rev-parse', 'HEAD');
  git(pasta, 'checkout', '-q', 'main');

  const diretorio = path.join(raiz, 'estado');
  await gravarFrota(diretorio, conteudoFrota({ zelador: tupla('claude', 'high') }));
  const estado = criarEstadoOrquestracao({ diretorio, agora });
  const servico = criarServicoOrquestracao({ consultar: async () => { throw new Error('fila não usada'); }, raiz, estado, agora });
  const projeto = { pasta: 'proj-falso', area: 'ProjetosPessoais', titulo: 'Projeto Falso', plane: PROJETO_FALSO, sigla: 'FALSO' };
  const play = new PlayHangar({ diretorio, comTrava: estado.comTrava, projetos: [projeto], agora });
  if (playLigado) await play.alternar(PROJETO_FALSO, true, '1');
  const plane = criarPlaneFalso({ projetoId: PROJETO_FALSO, sigla: 'FALSO', agora });
  const chaves = path.join(raiz, 'chaves');
  await fs.mkdir(chaves);
  const arquivoChave = path.join(chaves, 'zelador.token');
  await fs.writeFile(arquivoChave, `${plane.chave}\n`, { mode: 0o600 });
  const escritor = criarEscritorZelador({ escopoPermitido: id => play.ligado(id), arquivoChave, fetchImpl: plane.fetchImpl, apiBase: 'http://plane.falso' });
  const pedidos = [];
  const cli = { rodar: async (t, entrada) => { pedidos.push({ tupla: t, entrada }); const r = await responder(entrada, { plane, commitFeito }); return r?.ok === false ? r : { ok: true, texto: JSON.stringify(r), uso: { duracaoMs: 1, custoUsd: 0.01 } }; } };
  const lerConsumo = async () => consumo ?? { claude: { disponivel: true, tipo: 'assinatura', janelas: [{ percentual: 20, janela: '5h', atualizadoEm: new Date(tempo - 60_000).toISOString() }] } };
  const zelador = criarZelador({ servico, estado, play, escritor, diretorio, consultar: plane.consultar, lerConsumo, ocupacao, cli, raiz, agora });
  // O agendador usa o catálogo do play; o cenário só tem o projeto falso.
  const lerDiario = async () => (await zelador.diario.linhas({ janelaMs: 7 * 86_400_000 })).linhas;
  return { raiz, pasta, diretorio, estado, servico, play, plane, escritor, zelador, cli, pedidos, projeto, commitFeito, commitForaDoPrincipal,
    arquivoChave, lerDiario, avancar: ms => { tempo += ms; }, agora, git: (...a) => git(pasta, ...a),
    limpar: () => fs.rm(raiz, { recursive: true, force: true }) };
}
