// Sequência da tentativa: isola, instala, pede os três papéis, roda o aceite e fecha o veredito.
// Cada passo mora no módulo da sua responsabilidade. Este arquivo só encadeia.
//
// Só é construído com ORQ_EXECUCAO_HABILITADA=true. Sem a flag, nada aqui roda.
import { spawn as spawnPadrao } from 'node:child_process';
import { constants as FS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { argumentosModeloCli, PAPEIS } from './modelos.js';
import { LIMITES_PADRAO, ambienteLimpo, resolverBinario } from './ambiente-cli.js';
import { inspecionarComando } from './gramatica-cli.js';
import { ProcessoCli } from './processo-cli.js';
import { PapelCli, selecoesDoPlano } from './papel-cli.js';
import { BriefingPapel, cortar } from './briefing-papel.js';
import { IsolamentoGit } from './isolamento-git.js';
import { DependenciasWorktree } from './dependencias-worktree.js';

export { LIMITES_PADRAO, ambienteLimpo, resolverBinario } from './ambiente-cli.js';
export { validarScriptNpm, inspecionarComando } from './gramatica-cli.js';

const BINARIOS_PADRAO = Object.freeze({ claude: 'claude', codex: 'codex', git: 'git', npm: 'npm' });
const LICOES_VIVAS_PADRAO = path.resolve(import.meta.dirname, '../../licoes-vivas');
import { UUID } from './uuid.js';
const DIFF_MAX = 200 * 1024;

export function criarExecutorCli({ diretorioEstado, consultar, binarios = {}, limites = {}, spawn = spawnPadrao,
  ambienteBase = process.env, licoesVivasDir = LICOES_VIVAS_PADRAO, agora = Date.now } = {}) {
  if (!diretorioEstado) throw new Error('diretório de estado obrigatório');
  if (typeof consultar !== 'function') throw new Error('consultar obrigatório');
  const bins = { ...BINARIOS_PADRAO, ...binarios };
  const lim = { ...LIMITES_PADRAO, ...limites };
  const env = ambienteLimpo(ambienteBase);
  const processo = new ProcessoCli({ spawn, env, agora, maxSaidaBytes: lim.maxSaidaBytes });

  async function binario(nome) {
    const caminho = await resolverBinario(bins[nome], env);
    if (!caminho) throw new Error(`binário indisponível: ${nome}`);
    return caminho;
  }

  const git = new IsolamentoGit({ processo, binario });
  const papeisCli = new PapelCli({ processo, binario, limites: lim, licoesVivasDir });
  const briefing = new BriefingPapel();
  const dependencias = new DependenciasWorktree({ processo, binario, limites: lim });

  async function validar({ pasta, contrato, comando, plano }) {
    for (const nome of ['git', ...new Set(PAPEIS.map(p => plano.papeis[p].provedor === 'claude' ? 'claude' : 'codex'))]) await binario(nome);
    const selecoes = selecoesDoPlano(plano);
    for (const papel of PAPEIS) argumentosModeloCli(contrato, selecoes, papel);
    let raiz;
    try { raiz = (await git.git(pasta, 'rev-parse', '--show-toplevel')).trim(); }
    catch { throw new Error('projeto sem repositório git; isolamento por worktree impossível'); }
    if (path.resolve(raiz) !== path.resolve(pasta)) throw new Error('pasta do projeto não é a raiz do repositório git');
    await git.git(pasta, 'status', '--porcelain');
    const inspecao = await inspecionarComando(pasta, comando);
    await fs.mkdir(diretorioEstado, { recursive: true });
    await fs.access(diretorioEstado, FS.W_OK);
    return { inspecao };
  }

  async function executar({ carta, cartaId, projetoId, comandoId, comando, plano, contrato = null, gate: gateDaFila = null, pasta, tentativaId }) {
    if (!UUID.test(tentativaId ?? '')) throw new Error('tentativa inválida');
    const curto = tentativaId.slice(0, 8);
    const logs = path.join(diretorioEstado, 'saidas', tentativaId);
    await fs.mkdir(logs, { recursive: true });
    const projeto = pasta.split(path.sep).filter(Boolean).at(-1);
    await fs.writeFile(path.join(logs, 'plano.json'), JSON.stringify({ carta, cartaId, projetoId, comandoId, comando, papeis: plano.papeis, pasta }, null, 2));
    const evidencia = [];
    const papeis = PAPEIS.map(p => `${p}: ${plano.papeis[p].provedor}/${plano.papeis[p].modelo}/${plano.papeis[p].esforco}`).join(' · ');
    const impedido = (motivo) => ({ resultado: 'impedido',
      resumo: cortar(`Tentativa ${curto} de ${carta} impedida antes de concluir: ${motivo}.`, 2000),
      evidencia: [...evidencia, cortar(motivo, 500), cortar(`logs: ${logs}`, 500)].slice(0, 10) });

    let ramo;
    let worktree;
    try { ({ ramo, worktree } = await git.adicionar(pasta, carta, curto, diretorioEstado)); }
    catch (erro) { return impedido(`worktree não criado: ${erro.message}`); }
    evidencia.push(cortar(`worktree ${worktree} · ramo ${ramo}`, 500));

    const instalacao = await dependencias.instalar(worktree, logs);
    if (instalacao.motivo) return impedido(instalacao.motivo);
    if (instalacao.evidencia) evidencia.push(instalacao.evidencia);

    let cardPlane;
    try { cardPlane = await consultar(`/projects/${projetoId}/work-items/${cartaId}/`); }
    catch (erro) { return impedido(`leitura do card no Plane falhou: ${erro.message}`); }
    const contexto = briefing.contexto({ carta, tentativaId, projeto, cardPlane, gateDaFila, contrato, comando, ramo });
    const comandos = contrato?.comandos ?? [comando];

    const orq = await papeisCli.lancar({ papel: 'orquestracao', contrato, plano, worktree, comandos, logs,
      prompt: briefing.renderizar(await briefing.molde('orquestracao'), { ...contexto, licoes: await papeisCli.licoes('orquestracao') }) });
    if (orq.impedimento) return impedido(orq.impedimento);
    evidencia.push(cortar(`orquestração ${orq.provedor}/${orq.modelo}/${orq.esforco} em ${Math.round(orq.duracaoMs / 1000)} s${orq.custoUsd != null ? ` · US$ ${orq.custoUsd.toFixed(2)}` : ''}`, 500));

    const dev = await papeisCli.lancar({ papel: 'codificacao_testes', contrato, plano, worktree, comandos, logs,
      prompt: briefing.renderizar(await briefing.molde('codificacao_testes'), { ...contexto, briefingOperacional: cortar(orq.texto, 12_000), licoes: await papeisCli.licoes('codificacao_testes') }) });
    if (dev.impedimento) return impedido(dev.impedimento);
    let commit;
    let diffStat;
    let diff;
    try { ({ commit, diffStat, diff } = await git.commitar(worktree, carta, curto)); }
    catch (erro) { return impedido(`commit do worktree falhou: ${erro.message}`); }
    evidencia.push(cortar(`codificação ${dev.provedor}/${dev.modelo}/${dev.esforco} em ${Math.round(dev.duracaoMs / 1000)} s${dev.custoUsd != null ? ` · US$ ${dev.custoUsd.toFixed(2)}` : ''} · ${commit}`, 500));
    await fs.writeFile(path.join(logs, 'diff.patch'), diff, 'utf8');

    let executavelComando;
    try { executavelComando = await resolverBinario(comando.executavel === 'npm' ? bins.npm : comando.executavel, env); } catch { executavelComando = null; }
    if (!executavelComando) return impedido(`executável do comando ${comandoId} indisponível: ${comando.executavel}`);
    const rc = await processo.rodar({ executavel: executavelComando, argumentos: comando.argumentos, cwd: worktree,
      timeoutMs: lim.minutosComando * 60_000, log: path.join(logs, `comando-${comandoId}.log`) });
    const caudaComando = `${rc.stdout}\n${rc.stderr}`.trim().split('\n').slice(-40).join('\n');
    const comandoOk = !rc.expirou && rc.codigo === 0;
    evidencia.push(cortar(`comando ${comandoId} (${contexto.comandoDeAceite}): ${rc.expirou ? 'tempo esgotado' : `código ${rc.codigo}`} em ${Math.round(rc.duracaoMs / 1000)} s`, 500));

    const val = await papeisCli.lancar({ papel: 'validacao', contrato, plano, worktree, comandos, logs,
      prompt: briefing.renderizar(await briefing.molde('validacao'), { ...contexto, briefingOperacional: cortar(orq.texto, 12_000), relatorioDev: cortar(dev.texto, 12_000),
        diffStat, diff: cortar(diff, DIFF_MAX), arquivoDiff: path.join(logs, 'diff.patch'), codigoComando: rc.expirou ? 'tempo esgotado' : String(rc.codigo),
        duracaoComando: `${Math.round(rc.duracaoMs / 1000)} s`, caudaComando: cortar(caudaComando, 8000), licoes: await papeisCli.licoes('validacao') }) });
    if (val.impedimento) return impedido(val.impedimento);
    const vereditos = [...val.texto.matchAll(/VEREDITO:\s*(APROVADO|REPROVADO|INCONCLUSIVO)/g)];
    const veredito = vereditos.at(-1)?.[1] ?? 'INCONCLUSIVO';
    evidencia.push(cortar(`validação ${val.provedor}/${val.modelo}/${val.esforco} em ${Math.round(val.duracaoMs / 1000)} s${val.custoUsd != null ? ` · US$ ${val.custoUsd.toFixed(2)}` : ''} · VEREDITO: ${veredito}`, 500));

    const resultado = comandoOk && veredito === 'APROVADO' ? 'concluido' : 'rejeitado';
    const motivoDev = cortar(val.texto.replace(/VEREDITO:\s*\w+\s*$/, '').trim().split('\n').filter(Boolean).slice(-6).join(' '), 600);
    evidencia.push(cortar(`papéis: ${papeis}`, 500), cortar(`logs: ${logs}`, 500));
    return {
      resultado,
      resumo: cortar(`Tentativa ${curto} de ${carta} (${contexto.gate}): ${commit}; comando ${comandoId} ${comandoOk ? 'passou' : 'falhou'}; validação ${veredito}. ${motivoDev}`, 2000),
      evidencia: evidencia.slice(0, 10),
    };
  }

  return { validar, executar };
}
