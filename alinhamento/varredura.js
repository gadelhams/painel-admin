// Percorre os projetos e junta o resultado. Cache, fios e sinais moram nos módulos ao lado.

import path from 'node:path';
import os from 'node:os';
import { PROJETOS } from '../projetos.js';
import { RAIZ, dirDoProjeto } from '../coletores.js';
import { criarClientePlane, lerWorkspacePlane } from '../plane.js';
import { LIMIAR_FIO, gitPadrao, portaoDocsPadrao } from './medidas.js';
import { CacheAlinhamento } from './cache.js';
import { MedidorFios } from './fios.js';
import { SinaisProjeto } from './sinais.js';

export function criarAlinhamento({
  projetos = PROJETOS, raiz = RAIZ,
  diretorioEstado = path.join(os.homedir(), '.local', 'state', 'painel-admin'),
  lerPlane = lerWorkspacePlane,
  consultarPlane = null,
  dirDe = dirDoProjeto,
  git = gitPadrao, portaoDocs = portaoDocsPadrao,
  agora = Date.now, intervaloMs = 30 * 60_000, concorrencia = 4, log = console.error,
} = {}) {
  const cache = new CacheAlinhamento(diretorioEstado);
  let ultimo = null;
  let emCurso = null;
  let temporizador = null;
  let cliente = consultarPlane;

  function consultar() {
    if (cliente) return cliente;
    const chave = process.env.PLANE_API_KEY?.trim();
    if (!chave) throw new Error('sem PLANE_API_KEY no .env do painel');
    cliente = criarClientePlane({ chave });
    return cliente;
  }

  const fios = new MedidorFios({ consultar, cache, concorrencia, log });
  const sinais = new SinaisProjeto({ dirDe, git, portaoDocs });

  async function varrer() {
    if (emCurso) return emCurso;
    emCurso = (async () => {
      const inicio = agora();
      let plane = null; let erroPlane = null; let medidos = 0; let medicao = {};
      try {
        plane = await lerPlane();
        ({ medidos, fios: medicao } = await fios.medir(plane.issues));
      } catch (erro) { erroPlane = erro.message; log(`[alinhamento] Plane: ${erro.message}`); }
      const resultado = [];
      for (const p of projetos) {
        if (p.congelado) continue;
        try { resultado.push(await sinais.de(p, plane, medicao)); }
        catch (erro) { resultado.push({ pasta: p.pasta, titulo: p.titulo, docs: {}, sinais: [{ tipo: 'erro', gravidade: 'alta', texto: `varredura falhou: ${erro.message}` }] }); }
      }
      const totais = {};
      for (const r of resultado) for (const s of r.sinais) totais[s.tipo] = (totais[s.tipo] ?? 0) + 1;
      ultimo = { varridoEm: new Date(agora()).toISOString(), duracaoMs: agora() - inicio, erroPlane, cartasMedidas: medidos,
        limiarFio: LIMIAR_FIO, totais, total: Object.values(totais).reduce((a, b) => a + b, 0), projetos: resultado };
      const c = await cache.ler(); c.varridoEm = ultimo.varridoEm; c.resultado = ultimo;
      await cache.gravar().catch((e) => log(`[alinhamento] cache: ${e.message}`));
      return ultimo;
    })().finally(() => { emCurso = null; });
    return emCurso;
  }

  async function ler({ forcar = false } = {}) {
    if (ultimo && !forcar) return ultimo;
    const c = await cache.ler();
    if (c.resultado && !forcar) { ultimo = c.resultado; return ultimo; }
    return varrer();
  }

  function iniciar() {
    if (temporizador) return;
    varrer().catch((e) => log(`[alinhamento] ${e.message}`));
    temporizador = setInterval(() => { varrer().catch((e) => log(`[alinhamento] ${e.message}`)); }, intervaloMs);
    temporizador.unref?.();
  }
  function parar() { clearInterval(temporizador); temporizador = null; }

  return { varrer, ler, iniciar, parar };
}
