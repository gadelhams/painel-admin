// Git só-leitura do zelador: o retrato do repositório e a conferência das evidências (commit no ramo principal, arquivo rastreado). Sem shell, sem trava do git.
//
// J20: `GIT_OPTIONAL_LOCKS=0` em toda chamada — um `git status` do painel não pode disputar o
// index.lock com a sessão que trabalha no repo. J22/J69: o commit só vale se for ancestral do
// ramo principal; `caminho:linha` só vale com realpath dentro do repo e arquivo rastreado, e
// do arquivo nada além do caminho sai daqui.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

function executarGitReal(args, { cwd }) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: 20_000, maxBuffer: 4 * 1024 * 1024, shell: false,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', LANG: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } },
    (erro, stdout, stderr) => resolve({ codigo: erro ? (Number.isInteger(erro.code) ? erro.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

const SHA = /^[0-9a-f]{7,40}$/i;

export class GitZelador {
  constructor({ executar = executarGitReal } = {}) { this.executar = executar; }

  async git(pasta, args) { return this.executar(args, { cwd: pasta }); }

  // Nome do ramo principal: o HEAD do origin, senão main, senão master.
  async principal(pasta) {
    const r = await this.git(pasta, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (r.codigo === 0 && r.stdout.trim().startsWith('origin/')) return r.stdout.trim().slice('origin/'.length);
    for (const nome of ['main', 'master']) if ((await this.git(pasta, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`])).codigo === 0) return nome;
    return null;
  }

  async retrato(pasta, { maxCurrent = 6000 } = {}) {
    const log = await this.git(pasta, ['log', '-20', '--oneline', '--no-decorate']);
    if (log.codigo !== 0) throw new Error('git log falhou no repositório do projeto');
    const status = await this.git(pasta, ['status', '--short']);
    const frente = await this.git(pasta, ['log', '--oneline', '--no-decorate', '@{upstream}..HEAD']);
    let current = '';
    try { current = (await fs.readFile(path.join(pasta, 'docs', 'current.md'), 'utf8')).slice(0, maxCurrent); } catch { current = '(sem docs/current.md)'; }
    return { log: log.stdout.trim(), status: status.codigo === 0 ? status.stdout.trimEnd() : '(git status falhou)',
      aFrente: frente.codigo === 0 ? frente.stdout.trim() : '(sem upstream)', current, principal: await this.principal(pasta) };
  }

  // Commit existe E é ancestral do ramo principal (J22).
  async commitNoPrincipal(pasta, sha) {
    if (!SHA.test(sha ?? '')) return { ok: false, motivo: 'sha inválido' };
    const principal = await this.principal(pasta);
    if (!principal) return { ok: false, motivo: 'repositório sem ramo principal' };
    const existe = await this.git(pasta, ['cat-file', '-e', `${sha}^{commit}`]);
    if (existe.codigo !== 0) return { ok: false, motivo: `commit ${sha} não existe` };
    const ancestral = await this.git(pasta, ['merge-base', '--is-ancestor', sha, `refs/heads/${principal}`]);
    return ancestral.codigo === 0 ? { ok: true, principal } : { ok: false, motivo: `commit ${sha} fora do ramo ${principal}` };
  }

  // J69: realpath dentro do repo, rastreado pelo git e com a linha existindo. Só o caminho volta.
  async arquivoRastreado(pasta, caminho, linha) {
    if (typeof caminho !== 'string' || !caminho || path.isAbsolute(caminho) || caminho.includes('\0')) return { ok: false, motivo: 'caminho inválido' };
    let raizReal;
    let alvoReal;
    try { raizReal = await fs.realpath(pasta); alvoReal = await fs.realpath(path.join(pasta, caminho)); }
    catch { return { ok: false, motivo: `arquivo ${caminho} não existe` }; }
    if (!alvoReal.startsWith(raizReal + path.sep)) return { ok: false, motivo: `arquivo ${caminho} fora do repositório` };
    const relativo = path.relative(raizReal, alvoReal);
    const rastreado = await this.git(pasta, ['ls-files', '--error-unmatch', '--', relativo]);
    if (rastreado.codigo !== 0) return { ok: false, motivo: `arquivo ${caminho} não é rastreado pelo git` };
    if (linha !== undefined && linha !== null) {
      if (!Number.isInteger(linha) || linha < 1) return { ok: false, motivo: 'linha inválida' };
      const texto = await fs.readFile(alvoReal, 'utf8').catch(() => null);
      if (texto === null || texto.split('\n').length < linha) return { ok: false, motivo: `linha ${linha} além do fim de ${caminho}` };
    }
    return { ok: true, caminho: relativo.split(path.sep).join('/') };
  }

  // J70: ramos orq/* que ainda não entraram no principal (integração pendente).
  async ramosNaoIntegrados(pasta) {
    const principal = await this.principal(pasta);
    if (!principal) return [];
    const r = await this.git(pasta, ['branch', '--list', 'orq/*', '--no-merged', `refs/heads/${principal}`, '--format=%(refname:short)']);
    return r.codigo === 0 ? r.stdout.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20) : ['(ramos ilegíveis)'];
  }
}
