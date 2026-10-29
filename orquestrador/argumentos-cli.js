// Argumentos fixos de cada CLI. O lançamento mora em papel-cli.js.

import { argumentosModeloCli } from './modelos.js';

const SO_LEITURA = new Set(['orquestracao', 'validacao']);

export class ArgumentosCli {
  static claude(base, { papel, comandos, limites }) {
    // Sem --bare: nele o Claude só autentica por ANTHROPIC_API_KEY, nunca pela assinatura
    // (claude --help 2.1.284; provado em 29/10/2026). --restricted ignora os settings de
    // usuário, projeto e local, e devolve ferramenta de rodar código só se --tools a nomear.
    const fixos = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', ...base.argumentos, '--restricted',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--no-session-persistence', '--disable-slash-commands', '--max-turns', String(limites.maxTurnos),
      '--max-budget-usd', String(limites.tetoUsdPorPapel)];
    if (SO_LEITURA.has(papel)) return [...fixos, '--tools', 'Read', 'Glob', 'Grep', 'LS', '--allowedTools', 'Read', 'Glob', 'Grep', 'LS'];
    const bash = comandos.map(c => `Bash(${c.executavel} ${c.argumentos.join(' ')})`);
    return [...fixos, '--tools', 'Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'LS', 'NotebookEdit', 'Bash',
      '--allowedTools', 'Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'LS', 'NotebookEdit', ...bash,
      'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', '--disallowedTools', 'WebFetch', 'WebSearch', 'Agent'];
  }

  static codex(base, { papel, worktree, ultimaMensagem }) {
    const modelo = base.argumentos[base.argumentos.indexOf('--model') + 1];
    const esforco = base.argumentos.find(a => a.startsWith('model_reasoning_effort=')).split('=')[1];
    return ['exec', '-C', worktree, '--sandbox', SO_LEITURA.has(papel) ? 'read-only' : 'workspace-write', '--color', 'never',
      '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '-o', ultimaMensagem,
      '-m', modelo, '-c', `model_reasoning_effort="${esforco}"`, '-'];
  }

  // As tuplas vêm do plano congelado da frota; o papel zelador não é papel do executor e é recusado ali.
  static de(plano, papel, extras) {
    const base = argumentosModeloCli(plano, papel);
    return plano.papeis[papel].provedor === 'claude' ? ArgumentosCli.claude(base, extras) : ArgumentosCli.codex(base, extras);
  }
}
