// Executor real do portão de despacho: três papéis de IA (orquestração, codificação/testes,
// validação) lançados como CLIs descartáveis num worktree isolado do projeto, mais o
// comando de aceite do contrato. É o que fila.js recebe em `executor` quando
// ORQ_EXECUCAO_HABILITADA=true; sem isso o portão fica desligado e nada aqui roda.
//
// O que este módulo garante: nenhum shell; argumentos fixos por papel (modelo/esforço vêm
// de modelos.js, sem fallback); ambiente dos filhos construído por lista branca (nenhuma
// chave do Painel chega à CLI); escrita só no worktree; timeout mata o grupo de processos;
// saída capada e gravada em log sem segredo; falha de infraestrutura vira `impedido`, nunca
// exceção. O que ele NÃO garante: a varredura dos scripts do contrato é estática e
// heurística — recusa tokens proibidos e metacaracteres de shell, mas não prova que o
// conteúdo de `npm test` ou de um script é seguro, como o padrão ORQUESTRADOR-PROJETOS.md
// deixa dito. O comando de aceite roda sem sandbox, como o usuário do serviço.
import { spawn as spawnPadrao } from 'node:child_process';
import { constants as FS, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { argumentosModeloCli, PAPEIS } from './modelos.js';

export const LIMITES_PADRAO = Object.freeze({
  minutosIa: 45, minutosComando: 20, minutosInstalacao: 10,
  maxSaidaBytes: 4 * 1024 * 1024, maxTurnos: 60, tetoUsdPorPapel: 15,
});
const BINARIOS_PADRAO = Object.freeze({ claude: 'claude', codex: 'codex', git: 'git', npm: 'npm' });
const LICOES_VIVAS_PADRAO = path.resolve(import.meta.dirname, '../../licoes-vivas');
const MOLDES = path.join(import.meta.dirname, 'briefings');
const LICAO_POR_PAPEL = { orquestracao: 'orquestrador.md', codificacao_testes: 'executor.md', validacao: 'cetico.md' };
// Só o que a CLI precisa para autenticar e achar binários; nunca PLANE_*, ELEVENLABS_*,
// XAI_*, ORQ_* ou qualquer *_KEY/*TOKEN*. MISE_* passa porque node/python/claude vêm do mise.
const AMBIENTE_PERMITIDO = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME',
  'CODEX_HOME', 'CLAUDE_CONFIG_DIR']);
const PROIBIDO_EM_SCRIPT = /\b(ssh|scp|rsync|docker|sudo|steam|proton|deploy|curl|wget)\b|\bgit\s+push\b|\brm\s+-rf\b/i;
const INICIOS_DE_SEGMENTO = new Set(['node', 'npm', 'npx', 'vitest', 'tsc', 'oxlint', 'eslint', 'python', 'python3', 'pytest']);
const METACARACTERES = /[|;<>`$()]|(?<!&)&(?!&)/;
const LIMITE_DE_USO = /(usage limit|rate limit|hit your .{0,20}limit|limit reached|reached your .{0,20}limit|quota|too many requests|\b429\b)/i;
const SO_LEITURA = new Set(['orquestracao', 'validacao']);
const MISSAO = { 'READY TO DEV': 'implementar a carta', 'READY TO TEST': 'testar e validar o que já está implementado' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIFF_MAX = 200 * 1024;

export function ambienteLimpo(base = {}) {
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'string' && (AMBIENTE_PERMITIDO.has(k) || k.startsWith('MISE_'))) env[k] = v;
  }
  return { ...env, CI: '1', NO_COLOR: '1' };
}

export async function resolverBinario(nome, env) {
  if (!nome || typeof nome !== 'string') return null;
  const candidatos = nome.includes('/') ? [nome] : (env.PATH ?? '').split(path.delimiter).filter(Boolean).map(d => path.join(d, nome));
  for (const c of candidatos) {
    try { await fs.access(c, FS.X_OK); return c; } catch { /* próximo segmento */ }
  }
  return null;
}

function textoVisivel(html = '') {
  return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Gramática do `scripts.test` do package.json: segmentos por `&&`, cada um começando por um
// executável de teste conhecido; `npm run X` recursa até três níveis. Metacaractere ou token
// proibido recusa com o motivo nomeado.
export function validarScriptNpm(scripts, nome = 'test', profundidade = 0) {
  const linha = scripts?.[nome];
  if (typeof linha !== 'string' || !linha.trim()) throw new Error(`package.json sem scripts.${nome}`);
  if (profundidade > 3) throw new Error('scripts npm aninhados além de três níveis');
  if (METACARACTERES.test(linha)) throw new Error(`scripts.${nome} usa metacaractere de shell`);
  const proibido = PROIBIDO_EM_SCRIPT.exec(linha);
  if (proibido) throw new Error(`scripts.${nome} contém token proibido: ${proibido[0]}`);
  for (const segmento of linha.split('&&').map(s => s.trim()).filter(Boolean)) {
    const [primeiro, segundo, terceiro] = segmento.split(/\s+/);
    if (!INICIOS_DE_SEGMENTO.has(primeiro)) throw new Error(`scripts.${nome}: executável não permitido: ${primeiro}`);
    if (primeiro === 'npm') {
      if (segundo === 'test') { if (nome !== 'test') validarScriptNpm(scripts, 'test', profundidade + 1); continue; }
      if (segundo !== 'run' || !terceiro) throw new Error(`scripts.${nome}: só 'npm test' ou 'npm run <script>' são aceitos`);
      validarScriptNpm(scripts, terceiro, profundidade + 1);
    }
  }
  return linha;
}

export async function inspecionarComando(pasta, comando) {
  if (comando.executavel === 'npm') {
    let pacote;
    try { pacote = JSON.parse(await fs.readFile(path.join(pasta, 'package.json'), 'utf8')); }
    catch { throw new Error('package.json ausente ou ilegível para npm test'); }
    return `npm test → ${validarScriptNpm(pacote.scripts)}`;
  }
  const arquivo = comando.argumentos.at(-1);
  let conteudo;
  try { conteudo = await fs.readFile(path.join(pasta, arquivo), 'utf8'); }
  catch { throw new Error(`script do contrato ausente: ${arquivo}`); }
  const proibido = PROIBIDO_EM_SCRIPT.exec(conteudo);
  if (proibido) throw new Error(`script ${arquivo} contém token proibido: ${proibido[0].trim()}`);
  return `${comando.executavel} ${comando.argumentos.join(' ')} (${conteudo.length} bytes inspecionados)`;
}

function selecoesDoPlano(plano) {
  return Object.fromEntries(PAPEIS.map(p => [p, { provedor: plano.papeis[p].provedor, modelo: plano.papeis[p].modelo, esforco: plano.papeis[p].esforco }]));
}

function argumentosClaude(base, { papel, comandos, limites }) {
  const fixos = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', ...base.argumentos, '--bare',
    '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--disable-slash-commands', '--max-turns', String(limites.maxTurnos),
    '--max-budget-usd', String(limites.tetoUsdPorPapel)];
  if (SO_LEITURA.has(papel)) return [...fixos, '--restricted', '--allowedTools', 'Read', 'Glob', 'Grep', 'LS'];
  const bash = comandos.map(c => `Bash(${c.executavel} ${c.argumentos.join(' ')})`);
  return [...fixos, '--allowedTools', 'Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'LS', 'NotebookEdit', ...bash,
    'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', '--disallowedTools', 'WebFetch', 'WebSearch', 'Agent'];
}

function argumentosCodex(base, { papel, worktree, ultimaMensagem }) {
  // base.argumentos = ['exec','--model',m,'--config','model_reasoning_effort=e'] (modelos.js);
  // a CLI real aceita -m e -c; a ordem abaixo é a pinada pelos testes.
  const modelo = base.argumentos[base.argumentos.indexOf('--model') + 1];
  const esforco = base.argumentos.find(a => a.startsWith('model_reasoning_effort=')).split('=')[1];
  return ['exec', '-C', worktree, '--sandbox', SO_LEITURA.has(papel) ? 'read-only' : 'workspace-write', '--color', 'never',
    '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '-o', ultimaMensagem,
    '-m', modelo, '-c', `model_reasoning_effort="${esforco}"`, '-'];
}

function renderizar(molde, valores) {
  return molde.replace(/\{\{(\w+)\}\}/g, (tudo, chave) => (chave in valores ? String(valores[chave]) : tudo));
}

function cortar(texto, max) {
  const s = String(texto ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function criarExecutorCli({ diretorioEstado, consultar, binarios = {}, limites = {}, spawn = spawnPadrao,
  ambienteBase = process.env, licoesVivasDir = LICOES_VIVAS_PADRAO, agora = Date.now } = {}) {
  if (!diretorioEstado) throw new Error('diretório de estado obrigatório');
  if (typeof consultar !== 'function') throw new Error('consultar obrigatório');
  const bins = { ...BINARIOS_PADRAO, ...binarios };
  const lim = { ...LIMITES_PADRAO, ...limites };
  const env = ambienteLimpo(ambienteBase);

  async function binario(nome) {
    const caminho = await resolverBinario(bins[nome], env);
    if (!caminho) throw new Error(`binário indisponível: ${nome}`);
    return caminho;
  }

  async function git(cwd, ...args) {
    const r = await rodar({ executavel: await binario('git'), argumentos: args, cwd, timeoutMs: 60_000, maxSaidaBytes: 1024 * 1024 });
    if (r.codigo !== 0) throw new Error(`git ${args[0]} falhou (${r.codigo ?? r.sinal}): ${cortar(r.stderr.trim(), 300)}`);
    return r.stdout;
  }

  // spawn sem shell, detached para o timeout matar o grupo inteiro; stdout/stderr capados
  // e, quando há log, gravados em disco. Nunca lança por falha do processo: devolve o retrato.
  function rodar({ executavel, argumentos, cwd, stdin = null, timeoutMs, maxSaidaBytes = lim.maxSaidaBytes, log = null }) {
    return new Promise(resolve => {
      const inicio = agora();
      const saida = { stdout: [], stderr: [] };
      const bytes = { stdout: 0, stderr: 0, descartados: 0 };
      const arquivo = log ? createWriteStream(log, { flags: 'a' }) : null;
      arquivo?.write(`$ ${[executavel, ...argumentos].join(' ')}\n--- cwd ${cwd} ---\n`);
      let filho;
      try { filho = spawn(executavel, argumentos, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true }); }
      catch (erro) { arquivo?.end(); return resolve({ codigo: null, sinal: null, expirou: false, erroSpawn: erro.message, stdout: '', stderr: '', duracaoMs: 0 }); }
      let expirou = false;
      let erroSpawn = null;
      const matar = () => { try { process.kill(-filho.pid, 'SIGKILL'); } catch { try { filho.kill('SIGKILL'); } catch { /* já morreu */ } } };
      const temporizador = setTimeout(() => { expirou = true; matar(); }, timeoutMs);
      for (const fluxo of ['stdout', 'stderr']) {
        filho[fluxo].on('data', pedaco => {
          if (bytes[fluxo] + pedaco.length <= maxSaidaBytes) { saida[fluxo].push(pedaco); bytes[fluxo] += pedaco.length; arquivo?.write(pedaco); }
          else bytes.descartados += pedaco.length;
        });
      }
      filho.on('error', erro => { erroSpawn = erro.message; });
      filho.on('close', (codigo, sinal) => {
        clearTimeout(temporizador);
        arquivo?.end(`\n--- fim: código ${codigo} sinal ${sinal}${expirou ? ' (tempo esgotado)' : ''}${bytes.descartados ? ` (${bytes.descartados} bytes descartados)` : ''} ---\n`);
        resolve({ codigo, sinal, expirou, erroSpawn, stdout: Buffer.concat(saida.stdout).toString('utf8'),
          stderr: Buffer.concat(saida.stderr).toString('utf8'), duracaoMs: agora() - inicio, descartados: bytes.descartados });
      });
      filho.stdin.on('error', () => { /* processo morreu antes de ler o prompt: o retrato diz */ });
      if (stdin !== null) filho.stdin.end(stdin); else filho.stdin.end();
    });
  }

  async function validar({ pasta, contrato, comando, plano }) {
    for (const nome of ['git', ...new Set(PAPEIS.map(p => plano.papeis[p].provedor === 'claude' ? 'claude' : 'codex'))]) await binario(nome);
    const selecoes = selecoesDoPlano(plano);
    for (const papel of PAPEIS) argumentosModeloCli(contrato, selecoes, papel); // sem fallback: lança se indisponível
    let raiz;
    try { raiz = (await git(pasta, 'rev-parse', '--show-toplevel')).trim(); }
    catch { throw new Error('projeto sem repositório git; isolamento por worktree impossível'); }
    if (path.resolve(raiz) !== path.resolve(pasta)) throw new Error('pasta do projeto não é a raiz do repositório git');
    await git(pasta, 'status', '--porcelain');
    const inspecao = await inspecionarComando(pasta, comando);
    await fs.mkdir(diretorioEstado, { recursive: true });
    await fs.access(diretorioEstado, FS.W_OK);
    return { inspecao };
  }

  async function lerLicoes(papel) {
    try { return await fs.readFile(path.join(licoesVivasDir, LICAO_POR_PAPEL[papel]), 'utf8'); }
    catch { return `(lições vivas de ${papel} não encontradas em ${licoesVivasDir}; siga as cláusulas acima)`; }
  }

  async function lancarPapel({ papel, contrato, plano, worktree, prompt, logs, comandos }) {
    const escolha = plano.papeis[papel];
    const base = argumentosModeloCli(contrato, selecoesDoPlano(plano), papel);
    const ultimaMensagem = path.join(logs, `${papel}.ultima.md`);
    const argumentos = escolha.provedor === 'claude' ? argumentosClaude(base, { papel, comandos, limites: lim })
      : argumentosCodex(base, { papel, worktree, ultimaMensagem });
    await fs.writeFile(path.join(logs, `${papel}.prompt.md`), prompt, 'utf8');
    const r = await rodar({ executavel: await binario(escolha.provedor === 'claude' ? 'claude' : 'codex'), argumentos, cwd: worktree,
      stdin: prompt, timeoutMs: lim.minutosIa * 60_000, log: path.join(logs, `${papel}.log`) });
    const retrato = { papel, provedor: escolha.provedor, modelo: escolha.modelo, esforco: escolha.esforco, duracaoMs: r.duracaoMs, custoUsd: null, texto: '' };
    if (r.erroSpawn) return { ...retrato, impedimento: `CLI do papel ${papel} não iniciou: ${r.erroSpawn}` };
    if (r.expirou) return { ...retrato, impedimento: `CLI do papel ${papel} excedeu ${lim.minutosIa} min e foi encerrada` };
    if (LIMITE_DE_USO.test(`${r.stdout}\n${r.stderr}`.slice(-20_000))) return { ...retrato, impedimento: `limite de uso do provedor ${escolha.provedor} no papel ${papel}` };
    if (escolha.provedor === 'claude') {
      let dados;
      try { dados = JSON.parse(r.stdout); } catch { dados = null; }
      if (!dados || typeof dados.result !== 'string' || dados.is_error) {
        return { ...retrato, impedimento: `CLI claude do papel ${papel} não devolveu resultado (código ${r.codigo}): ${cortar(r.stderr.trim() || r.stdout.trim(), 200)}` };
      }
      return { ...retrato, texto: dados.result, custoUsd: Number.isFinite(dados.total_cost_usd) ? dados.total_cost_usd : null, turnos: dados.num_turns ?? null };
    }
    let texto = '';
    try { texto = (await fs.readFile(ultimaMensagem, 'utf8')).trim(); } catch { texto = ''; }
    if (r.codigo !== 0 || !texto) return { ...retrato, impedimento: `CLI codex do papel ${papel} terminou sem resposta (código ${r.codigo}): ${cortar(r.stderr.trim(), 200)}` };
    return { ...retrato, texto };
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

    // b. isolamento
    const ramo = `orq/${String(carta).toLowerCase()}-${curto}`;
    const worktree = path.join(diretorioEstado, 'worktrees', `${carta}-${curto}`);
    try { await git(pasta, 'worktree', 'add', '-b', ramo, worktree, 'HEAD'); }
    catch (erro) { return impedido(`worktree não criado: ${erro.message}`); }
    evidencia.push(cortar(`worktree ${worktree} · ramo ${ramo}`, 500));

    // c. dependências
    const temLock = await fs.access(path.join(worktree, 'package-lock.json')).then(() => true, () => false);
    const temModulos = await fs.access(path.join(worktree, 'node_modules')).then(() => true, () => false);
    if (temLock && !temModulos) {
      let npm;
      try { npm = await binario('npm'); } catch (erro) { return impedido(erro.message); }
      const r = await rodar({ executavel: npm, argumentos: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: worktree,
        timeoutMs: lim.minutosInstalacao * 60_000, log: path.join(logs, 'npm-ci.log') });
      if (r.codigo !== 0) return impedido(`npm ci falhou (${r.expirou ? 'tempo esgotado' : `código ${r.codigo}`})`);
      evidencia.push(`dependências instaladas com npm ci --ignore-scripts em ${Math.round(r.duracaoMs / 1000)} s`);
    }

    // d. contexto da carta
    let cardPlane;
    try { cardPlane = await consultar(`/projects/${projetoId}/work-items/${cartaId}/`); }
    catch (erro) { return impedido(`leitura do card no Plane falhou: ${erro.message}`); }
    const gate = gateDaFila ?? (cardPlane.labels ?? []).map(l => l?.name ?? l).find(n => MISSAO[n]) ?? 'READY TO DEV';
    const comandosTexto = contratoComandos(contrato, comando);
    const contexto = {
      identificador: carta, tentativaId, projeto, titulo: cardPlane.name ?? '', descricao: textoVisivel(cardPlane.description_html) || '(sem descrição)',
      gate, missao: MISSAO[gate] ?? 'implementar a carta', ramo,
      ambiente: contrato?.ambiente ?? 'offline', tiposTeste: (contrato?.tiposTeste ?? []).join('; ') || '—',
      criteriosAceite: (contrato?.criteriosAceite ?? []).join('; ') || '—', acoesProibidas: (contrato?.acoesProibidas ?? []).join('; ') || '—',
      comandos: comandosTexto, comandoDeAceite: `${comando.executavel} ${comando.argumentos.join(' ')}`,
    };
    const comandos = contrato?.comandos ?? [comando];
    const molde = async nome => fs.readFile(path.join(MOLDES, `${nome}.md`), 'utf8');

    // e. orquestração (só leitura)
    const orq = await lancarPapel({ papel: 'orquestracao', contrato, plano, worktree, comandos, logs,
      prompt: renderizar(await molde('orquestracao'), { ...contexto, licoes: await lerLicoes('orquestracao') }) });
    if (orq.impedimento) return impedido(orq.impedimento);
    evidencia.push(cortar(`orquestração ${orq.provedor}/${orq.modelo}/${orq.esforco} em ${Math.round(orq.duracaoMs / 1000)} s${orq.custoUsd != null ? ` · US$ ${orq.custoUsd.toFixed(2)}` : ''}`, 500));

    // f. codificação/testes (escrita no worktree) + commit
    const dev = await lancarPapel({ papel: 'codificacao_testes', contrato, plano, worktree, comandos, logs,
      prompt: renderizar(await molde('codificacao_testes'), { ...contexto, briefingOperacional: cortar(orq.texto, 12_000), licoes: await lerLicoes('codificacao_testes') }) });
    if (dev.impedimento) return impedido(dev.impedimento);
    let commit = 'sem alterações';
    let diffStat = '(sem alterações)';
    let diff = '';
    try {
      if ((await git(worktree, 'status', '--porcelain')).trim()) {
        await git(worktree, 'add', '-A');
        await git(worktree, '-c', 'user.name=Orquestrador', '-c', 'user.email=orquestrador@astargne.local', 'commit', '--no-verify', '-q',
          '-m', `ORQ ${carta}: tentativa ${curto} (codificacao_testes)`);
        const sha = (await git(worktree, 'rev-parse', '--short', 'HEAD')).trim();
        diffStat = (await git(worktree, 'diff', '--stat', 'HEAD~1', 'HEAD')).trim();
        diff = await git(worktree, 'diff', 'HEAD~1', 'HEAD');
        const arquivos = diffStat.split('\n').length - 1;
        commit = `commit ${sha} (${arquivos} arquivo${arquivos === 1 ? '' : 's'})`;
      }
    } catch (erro) { return impedido(`commit do worktree falhou: ${erro.message}`); }
    evidencia.push(cortar(`codificação ${dev.provedor}/${dev.modelo}/${dev.esforco} em ${Math.round(dev.duracaoMs / 1000)} s${dev.custoUsd != null ? ` · US$ ${dev.custoUsd.toFixed(2)}` : ''} · ${commit}`, 500));
    await fs.writeFile(path.join(logs, 'diff.patch'), diff, 'utf8');

    // g. comando de aceite do contrato
    let executavelComando;
    try { executavelComando = await resolverBinario(comando.executavel === 'npm' ? bins.npm : comando.executavel, env); } catch { executavelComando = null; }
    if (!executavelComando) return impedido(`executável do comando ${comandoId} indisponível: ${comando.executavel}`);
    const rc = await rodar({ executavel: executavelComando, argumentos: comando.argumentos, cwd: worktree,
      timeoutMs: lim.minutosComando * 60_000, log: path.join(logs, `comando-${comandoId}.log`) });
    const caudaComando = `${rc.stdout}\n${rc.stderr}`.trim().split('\n').slice(-40).join('\n');
    const comandoOk = !rc.expirou && rc.codigo === 0;
    evidencia.push(cortar(`comando ${comandoId} (${contexto.comandoDeAceite}): ${rc.expirou ? 'tempo esgotado' : `código ${rc.codigo}`} em ${Math.round(rc.duracaoMs / 1000)} s`, 500));

    // h. validação (só leitura)
    const val = await lancarPapel({ papel: 'validacao', contrato, plano, worktree, comandos, logs,
      prompt: renderizar(await molde('validacao'), { ...contexto, briefingOperacional: cortar(orq.texto, 12_000), relatorioDev: cortar(dev.texto, 12_000),
        diffStat, diff: cortar(diff, DIFF_MAX), arquivoDiff: path.join(logs, 'diff.patch'), codigoComando: rc.expirou ? 'tempo esgotado' : String(rc.codigo),
        duracaoComando: `${Math.round(rc.duracaoMs / 1000)} s`, caudaComando: cortar(caudaComando, 8000), licoes: await lerLicoes('validacao') }) });
    if (val.impedimento) return impedido(val.impedimento);
    const vereditos = [...val.texto.matchAll(/VEREDITO:\s*(APROVADO|REPROVADO|INCONCLUSIVO)/g)];
    const veredito = vereditos.at(-1)?.[1] ?? 'INCONCLUSIVO';
    evidencia.push(cortar(`validação ${val.provedor}/${val.modelo}/${val.esforco} em ${Math.round(val.duracaoMs / 1000)} s${val.custoUsd != null ? ` · US$ ${val.custoUsd.toFixed(2)}` : ''} · VEREDITO: ${veredito}`, 500));

    // i. desfecho
    const resultado = comandoOk && veredito === 'APROVADO' ? 'concluido' : 'rejeitado';
    const motivoDev = cortar(val.texto.replace(/VEREDITO:\s*\w+\s*$/, '').trim().split('\n').filter(Boolean).slice(-6).join(' '), 600);
    evidencia.push(cortar(`papéis: ${papeis}`, 500), cortar(`logs: ${logs}`, 500));
    return {
      resultado,
      resumo: cortar(`Tentativa ${curto} de ${carta} (${gate}): ${commit}; comando ${comandoId} ${comandoOk ? 'passou' : 'falhou'}; validação ${veredito}. ${motivoDev}`, 2000),
      evidencia: evidencia.slice(0, 10),
    };
  }

  return { validar, executar };
}

function contratoComandos(contrato, comando) {
  const lista = contrato?.comandos?.length ? contrato.comandos : [comando];
  return lista.map(c => `\`${c.executavel} ${c.argumentos.join(' ')}\` (${c.id})`).join(', ');
}
