// Escolhe as configs do canal legado e guarda o cache. A forma e o processo moram ao lado.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn as spawnPadrao } from 'node:child_process';
import { FormaCanalLegado } from './forma-canal-legado.js';
import { ProcessoCanalLegado } from './processo-canal-legado.js';

const DIRETORIO_PADRAO = path.resolve(import.meta.dirname, '../../SupervisorHandoff');
const CONFIGS_PADRAO = Object.freeze(['config.supervisor.json', 'config.json']);
const FONTE = 'SupervisorHandoff (doc 59, adaptador legado)';

export function criarLeitorCanalLegado({ diretorioSupervisor = DIRETORIO_PADRAO, executavel = 'python3', script = 'scripts/estado_canal.py',
  configs = CONFIGS_PADRAO, timeoutMs = 20_000, maxSaida = 2 * 1024 * 1024, cacheMs = 60_000, spawn = spawnPadrao, agora = Date.now } = {}) {
  const forma = new FormaCanalLegado();
  const processo = new ProcessoCanalLegado({
    diretorioSupervisor, executavel, script, timeoutMs, maxSaida, spawn,
    normalizar: (bruto, config) => forma.normalizar(bruto, config),
  });
  let cache = null;

  return async function lerCanalLegado() {
    if (cache && agora() - cache.quando < cacheMs) return cache.valor;
    const canais = [];
    for (const config of configs) {
      const existe = await fs.access(path.join(diretorioSupervisor, config)).then(() => true, () => false);
      canais.push(existe ? await processo.ler(config) : { config, disponivel: false, motivo: 'config ausente nesta máquina' });
    }
    const valor = { fonte: FONTE, atualizadoEm: new Date(agora()).toISOString(), diretorio: diretorioSupervisor, canais,
      observacao: 'Leitura equivalente ao dashboard 7791. Ações do ciclo (ciclo, vigiar, rearmar, pausar, e2e) não migram: continuam exigindo autorização do dono no SupervisorHandoff.' };
    cache = { quando: agora(), valor };
    return valor;
  };
}
