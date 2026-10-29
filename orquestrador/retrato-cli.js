// Retrato do que a CLI devolveu e a causa de uma falha (carta, cli ou limite). Os argumentos moram em argumentos-cli.js.

import fs from 'node:fs/promises';
import { cortar } from './briefing-papel.js';

const LIMITE_DE_USO = /(usage limit|rate limit|hit your .{0,20}limit|limit reached|reached your .{0,20}limit|quota|too many requests|\b429\b)/i;
// Infra da CLI ou do modelo: a CLI recusou o modelo/flag na partida ou não autenticou.
const INFRA_CLI = /((unknown|invalid|unsupported|unrecognized) (model|option|argument|flag)|model .{0,60}(not found|does not exist|not available|not supported)|unexpected argument|not logged in|please (log ?in|login|run \/login)|authenticat|unauthori[sz]ed|invalid api key|credential|(oauth )?token (has )?expired|\b401\b)/i;

// Classificação honesta do que a CLI devolveu (J-C/J-D, N1/N2 da correção da F2, 29/10/2026).
// O texto do MODELO nunca entra: uma validação que cita "429" e sai 0 não pausa nada.
// - Claude (`-p --output-format json`): com `is_error: true` o `result` é mensagem do
//   próprio CLI ("Claude AI usage limit reached|<epoch>", "5-hour limit reached ∙
//   resets …"), então é lido, com qualquer código de saída; com `is_error: false` o
//   `result` é do modelo e nunca é lido. Sem JSON, só o stderr e só com saída ≠ 0.
//   O formato exato será conferido no piloto PAINEL-34 (não verificado no CLI real).
// - Codex: o stderr traz a transcrição da sessão (saída de ferramentas como `npm test`),
//   então só a ÚLTIMA linha com o prefixo de erro do próprio CLI (`ERROR`) conta, e só
//   com saída ≠ 0. `codex exec --json` daria eventos estruturados, mas o formato não foi
//   verificado no CLI real e trocar as flags sem prova quebraria o executor.
// Na dúvida, a falha é da carta.
const ERRO_CODEX = /^\s*(?:\[[^\]]*\]\s*)?ERROR\b[:\s]/;

export class RetratoCli {
  static base({ papel, escolha, duracaoMs }) {
    return { papel, provedor: escolha.provedor, modelo: escolha.modelo, esforco: escolha.esforco, duracaoMs, custoUsd: null, texto: '' };
  }

  // O texto do CLI que pode decidir a causa, ou null quando não há nada do CLI para ler.
  static erroDoCli(r, provedor) {
    if (provedor === 'claude') {
      let d = null;
      try { d = JSON.parse(r.stdout); } catch { d = null; }
      if (d && typeof d === 'object' && d.is_error === true) {
        return [typeof d.result === 'string' ? d.result : '', d.subtype, typeof d.error === 'string' ? d.error : d.error?.message,
          d.api_error_status, r.codigo !== 0 ? String(r.stderr ?? '').slice(-4000) : ''].filter(Boolean).join('\n');
      }
      return r.codigo !== 0 ? String(r.stderr ?? '').slice(-4000) : null;
    }
    if (r.codigo === 0) return null;
    return String(r.stderr ?? '').split('\n').filter(l => ERRO_CODEX.test(l)).at(-1) ?? null;
  }

  // 'limite' (pausa o provedor), 'cli' (pausa a versão da frota) ou 'carta' (conta tentativa).
  static causa(r, provedor) {
    if (r.erroSpawn) return 'cli';
    if (r.expirou) return 'carta';
    const erro = RetratoCli.erroDoCli(r, provedor);
    if (!erro) return 'carta';
    if (LIMITE_DE_USO.test(erro)) return 'limite';
    if (INFRA_CLI.test(erro)) return 'cli';
    return 'carta';
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
