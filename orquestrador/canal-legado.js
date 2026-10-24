// Leitura do canal legado (doc 59) do SupervisorHandoff para a aba Orquestração: a prova de
// equivalência que PAINEL-35 exige antes de aposentar o dashboard separado (porta 7791). Um
// processo python descartável por config (`scripts/estado_canal.py`, só leitura: sem fetch,
// sem CLI, sem escrita) devolve um JSON; aqui só se normaliza, se limita e se guarda em cache.
// As AÇÕES daquele dashboard (ciclo, vigiar, rearmar, pausar, e2e) não migram: continuam
// exigindo o "vai" do dono no próprio SupervisorHandoff. Nada do navegador chega ao processo.
import { spawn as spawnPadrao } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const DIRETORIO_PADRAO = path.resolve(import.meta.dirname, '../../SupervisorHandoff');
const CONFIGS_PADRAO = Object.freeze(['config.supervisor.json', 'config.json']);
const FONTE = 'SupervisorHandoff (doc 59, adaptador legado)';
const CAMPOS_LISTA = ['cards', 'pendencias', 'sugestoes', 'integridade', 'blocosLocais', 'touchpoints'];

function normalizar(bruto, config) {
  if (!bruto || typeof bruto !== 'object' || bruto.versao !== 1) throw new Error('forma do JSON inesperada');
  const estado = { config, disponivel: true, motivo: null };
  for (const chave of ['documento', 'repositorio', 'geradoEm', 'commit', 'head', 'origin', 'protocolo', 'ultimoBloco', 'erro']) {
    estado[chave] = bruto[chave] ?? null;
  }
  for (const chave of CAMPOS_LISTA) estado[chave] = Array.isArray(bruto[chave]) ? bruto[chave] : [];
  estado.recusas = bruto.recusas && typeof bruto.recusas === 'object' ? bruto.recusas : {};
  estado.pausas = bruto.pausas && typeof bruto.pausas === 'object' ? bruto.pausas : {};
  estado.trava = { ativa: Boolean(bruto.trava?.ativa), idadeSegundos: Number.isFinite(bruto.trava?.idadeSegundos) ? bruto.trava.idadeSegundos : null };
  estado.execucao = { arquivo: bruto.execucao?.arquivo ?? null, modificadoHa: Number.isFinite(bruto.execucao?.modificadoHa) ? bruto.execucao.modificadoHa : null,
    cauda: typeof bruto.execucao?.cauda === 'string' ? bruto.execucao.cauda.slice(-4000) : '' };
  estado.emCurso = bruto.emCurso && typeof bruto.emCurso === 'object' ? bruto.emCurso : null;
  estado.touchpoints = estado.touchpoints.slice(0, 20);
  return estado;
}

export function criarLeitorCanalLegado({ diretorioSupervisor = DIRETORIO_PADRAO, executavel = 'python3', script = 'scripts/estado_canal.py',
  configs = CONFIGS_PADRAO, timeoutMs = 20_000, maxSaida = 2 * 1024 * 1024, cacheMs = 60_000, spawn = spawnPadrao, agora = Date.now } = {}) {
  let cache = null;

  function lerUm(config) {
    return new Promise(resolve => {
      const indisponivel = motivo => resolve({ config, disponivel: false, motivo });
      const pedacos = [];
      let total = 0;
      let filho;
      try { filho = spawn(executavel, [script, '--config', config], { cwd: diretorioSupervisor, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (erro) { return indisponivel(`leitor legado não iniciou: ${erro.code ?? erro.message}`); }
      const temporizador = setTimeout(() => { try { filho.kill('SIGKILL'); } catch { /* já morreu */ } }, timeoutMs);
      let estourou = false;
      filho.stdout.on('data', p => { total += p.length; if (total <= maxSaida) pedacos.push(p); else estourou = true; });
      filho.stderr.on('data', () => { /* ruído do parser; o JSON vai pelo stdout */ });
      filho.on('error', erro => { clearTimeout(temporizador); indisponivel(`leitor legado não iniciou: ${erro.code ?? erro.message}`); });
      filho.on('close', (codigo, sinal) => {
        clearTimeout(temporizador);
        if (sinal) return indisponivel(`leitor legado excedeu ${Math.round(timeoutMs / 1000)} s`);
        if (codigo !== 0) return indisponivel(`leitor legado terminou com código ${codigo}`);
        if (estourou) return indisponivel('saída do leitor legado acima do teto');
        try { resolve(normalizar(JSON.parse(Buffer.concat(pedacos).toString('utf8')), config)); }
        catch (erro) { indisponivel(`saída do leitor legado ilegível: ${erro.message}`); }
      });
    });
  }

  return async function lerCanalLegado() {
    if (cache && agora() - cache.quando < cacheMs) return cache.valor;
    const canais = [];
    for (const config of configs) {
      const existe = await fs.access(path.join(diretorioSupervisor, config)).then(() => true, () => false);
      canais.push(existe ? await lerUm(config) : { config, disponivel: false, motivo: 'config ausente nesta máquina' });
    }
    const valor = { fonte: FONTE, atualizadoEm: new Date(agora()).toISOString(), diretorio: diretorioSupervisor, canais,
      observacao: 'Leitura equivalente ao dashboard 7791. Ações do ciclo (ciclo, vigiar, rearmar, pausar, e2e) não migram: continuam exigindo autorização do dono no SupervisorHandoff.' };
    cache = { quando: agora(), valor };
    return valor;
  };
}
