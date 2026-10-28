// Retrato do que a CLI devolveu. Os argumentos moram em argumentos-cli.js.

import fs from 'node:fs/promises';
import { cortar } from './briefing-papel.js';

const LIMITE_DE_USO = /(usage limit|rate limit|hit your .{0,20}limit|limit reached|reached your .{0,20}limit|quota|too many requests|\b429\b)/i;

export class RetratoCli {
  static base({ papel, escolha, duracaoMs }) {
    return { papel, provedor: escolha.provedor, modelo: escolha.modelo, esforco: escolha.esforco, duracaoMs, custoUsd: null, texto: '' };
  }

  static limite(r) {
    return LIMITE_DE_USO.test(`${r.stdout}\n${r.stderr}`.slice(-20_000));
  }

  static claude(retrato, r, papel) {
    let dados;
    try { dados = JSON.parse(r.stdout); } catch { dados = null; }
    if (!dados || typeof dados.result !== 'string' || dados.is_error) {
      return { ...retrato, impedimento: `CLI claude do papel ${papel} não devolveu resultado (código ${r.codigo}): ${cortar(r.stderr.trim() || r.stdout.trim(), 200)}` };
    }
    return { ...retrato, texto: dados.result, custoUsd: Number.isFinite(dados.total_cost_usd) ? dados.total_cost_usd : null, turnos: dados.num_turns ?? null };
  }

  static async codex(retrato, r, papel, ultimaMensagem) {
    let texto = '';
    try { texto = (await fs.readFile(ultimaMensagem, 'utf8')).trim(); } catch { texto = ''; }
    if (r.codigo !== 0 || !texto) return { ...retrato, impedimento: `CLI codex do papel ${papel} terminou sem resposta (código ${r.codigo}): ${cortar(r.stderr.trim(), 200)}` };
    return { ...retrato, texto };
  }
}
