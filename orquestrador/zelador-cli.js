// A CLI do zelador: a tupla do bloco zelador da frota, num diretório vazio novo, sem ferramentas nem persistência de sessão, com o retrato pela stdin e a resposta em JSON. Não valida veredito.
//
// J21/J25/J67: nada do disco do painel ao alcance (cwd vazio, apagado no fim), nenhuma
// ferramenta (Claude: `--tools ""` sob `--restricted`; Codex: sandbox só-leitura no vazio),
// sem MCP, sem slash command, sem transcript (`--no-session-persistence`/`--ephemeral` — a
// CLI do zelador não aparece como sessão viva). A falha é classificada como no executor
// (retrato-cli.js): `limite` pausa o provedor, `cli` pausa a versão no bloco zelador (J61),
// `carta` é só deste job.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RetratoCli } from './retrato-cli.js';
import { tuplaNoCatalogo } from './frota-catalogo.js';
import { ambienteLimpo, resolverBinario } from './ambiente-cli.js';
import { ProcessoCli } from './processo-cli.js';

const LIMITES_ZELADOR = Object.freeze({ minutos: 15, maxTurnos: 4, tetoUsd: 3, maxSaidaBytes: 2 * 1024 * 1024 });

function argumentosZelador(tupla, { saida, cwd }) {
  if (!tuplaNoCatalogo(tupla)) throw new Error('tupla do zelador fora do catálogo');
  if (tupla.provedor === 'claude') {
    return ['-p', '--output-format', 'json', '--model', tupla.modelo, '--effort', tupla.esforco, '--permission-mode', 'dontAsk',
      '--restricted', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--disable-slash-commands',
      '--tools', '', '--max-turns', String(LIMITES_ZELADOR.maxTurnos), '--max-budget-usd', String(LIMITES_ZELADOR.tetoUsd)];
  }
  return ['exec', '-C', cwd, '--sandbox', 'read-only', '--color', 'never', '--ignore-user-config', '--ignore-rules', '--ephemeral',
    '--skip-git-repo-check', '-o', saida, '-m', tupla.modelo, '-c', `model_reasoning_effort="${tupla.esforco}"`, '-'];
}

export class CliZelador {
  constructor({ spawn, ambiente = process.env, binario = null, agora = Date.now, temporario = os.tmpdir() }) {
    this.env = ambienteLimpo(ambiente);
    this.processo = new ProcessoCli({ spawn, env: this.env, agora, maxSaidaBytes: LIMITES_ZELADOR.maxSaidaBytes });
    this.binario = binario ?? (async nome => { const b = await resolverBinario(nome, this.env); if (!b) throw new Error(`${nome} não encontrado no PATH`); return b; });
    this.temporario = temporario;
  }

  // { ok: true, texto, uso } | { ok: false, causa: 'cli'|'limite'|'carta', motivo }
  async rodar(tupla, entrada) {
    const vazio = await fs.mkdtemp(path.join(this.temporario, 'zelador-vazio-'));
    const saidas = await fs.mkdtemp(path.join(this.temporario, 'zelador-saida-'));
    const saida = path.join(saidas, 'ultima.md');
    try {
      let executavel;
      try { executavel = await this.binario(tupla.provedor === 'claude' ? 'claude' : 'codex'); }
      catch (erro) { return { ok: false, causa: 'cli', motivo: erro.message }; }
      const argumentos = argumentosZelador(tupla, { saida, cwd: vazio });
      const r = await this.processo.rodar({ executavel, argumentos, cwd: vazio, stdin: entrada, timeoutMs: LIMITES_ZELADOR.minutos * 60_000 });
      const causa = RetratoCli.causa(r, tupla.provedor);
      if (r.erroSpawn) return { ok: false, causa: 'cli', motivo: `CLI do zelador não iniciou: ${r.erroSpawn}` };
      if (r.expirou) return { ok: false, causa: 'carta', motivo: `CLI do zelador excedeu ${LIMITES_ZELADOR.minutos} min` };
      if (causa !== 'carta') return { ok: false, causa, motivo: causa === 'limite' ? `limite de uso do provedor ${tupla.provedor}` : `CLI ${tupla.provedor} recusou o zelador na partida` };
      const base = RetratoCli.base({ papel: 'zelador', escolha: tupla, duracaoMs: r.duracaoMs });
      const final = tupla.provedor === 'claude' ? RetratoCli.claude(base, r, 'zelador') : await RetratoCli.codex(base, r, 'zelador', saida);
      if (final.impedimento) return { ok: false, causa: 'carta', motivo: final.impedimento };
      return { ok: true, texto: final.texto, uso: { duracaoMs: r.duracaoMs, custoUsd: final.custoUsd ?? null, turnos: final.turnos ?? null } };
    } finally {
      await fs.rm(vazio, { recursive: true, force: true }).catch(() => {});
      await fs.rm(saidas, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// O pedido à CLI: as regras fechadas e o retrato. A CLI só propõe; o painel confere tudo.
export function promptZelador(retratoTexto) {
  return [
    'Você é o droid zelador do Hangar. Leia o retrato só-leitura abaixo (git e cartas abertas do Plane) e dê UM veredito por carta candidata.',
    'Regra (PADROES-BACKLOG.md § Zeladoria de cartas): a verdade vem do repositório, não da carta. Sem evidência, MANTER.',
    'Vereditos: MANTER; ATUALIZAR (troca um trecho EXATO da descrição por texto novo, ou anexa um parágrafo se "trecho" faltar);',
    'FECHAR (o trabalho está no ramo principal: exige evidência commit); CANCELAR (perdeu o sentido ou é duplicata);',
    'IA_DECIDE (decisão já registrada resolve; tira ASTARGNE); DONO (só produto, conta externa, dinheiro, credencial, risco aceito ou o que contradiz decisão do dono: põe ASTARGNE, mais PRODUTO se é rumo; prova humana é TAREFA DONO).',
    'Nunca proponha READY TO DEV/READY TO TEST, módulo, pai, apagar carta ou tirar PRODUTO. Não toque marcador (DONO/(ASTARGNE nem linha "Depende de:".',
    'Escreva texto puro em português, sem HTML, sem segredo, sem marcadores de protocolo (GATE/, HANDOFF/, ZELADOR/, DECISAO/, [ORQ/).',
    'Responda SÓ com um objeto JSON, sem texto em volta:',
    '{"vereditos":[{"carta":"SIGLA-N","veredito":"MANTER|ATUALIZAR|FECHAR|CANCELAR|IA_DECIDE|DONO","evidencias":[{"tipo":"commit","sha":"…"},{"tipo":"arquivo","caminho":"docs/x.md","linha":12},{"tipo":"carta","carta":"SIGLA-N"}],"comentario":"o porquê, com a fonte","trecho":"opcional","novoTrecho":"opcional","labelsTrava":["ASTARGNE"]}]}',
    '', '--- RETRATO ---', retratoTexto,
  ].join('\n');
}
