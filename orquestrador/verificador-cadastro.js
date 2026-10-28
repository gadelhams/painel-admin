// Pergunta ao Cadastro Único se o token ainda vale. O cookie só viaja no stdin.

import os from 'node:os';
import path from 'node:path';
import { criarExecutorSsh } from '../contas.js';
import { ErroAcesso } from './erro-acesso.js';

const SCRIPT_VERIFICAR = [
  'umask 077',
  'f=$(mktemp /tmp/painel-orq-sso.XXXXXX) || exit 97',
  'trap \'rm -f "$f"\' EXIT',
  'sudo grep "^TOKEN_INTERNO=" /opt/conta-astargne/.env'
    + ' | sed "s/^TOKEN_INTERNO=//; s/^[\\"\']\\(.*\\)[\\"\']\\$/\\1/; s/^/header = \\"Authorization: Bearer /; s/\\$/\\"/" > "$f"'
    + ' || exit 97',
  'test -s "$f" || exit 97',
  'curl --max-time 10 -sS -K "$f" -X POST http://127.0.0.1:8790/interno/sessao/verificar'
    + ' -H "content-type: application/json" -d @- -w "\\n%{http_code}"',
].join('; ');

export class VerificadorCadastro {
  constructor({ executar }) {
    this.executar = executar;
    this.args = ['-i', path.join(os.homedir(), '.ssh', 'paroquia-vultr'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
      'linuxuser@astargne.com', SCRIPT_VERIFICAR];
  }

  async verificar(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) throw new ErroAcesso('sessão ausente', 401);
    let resposta;
    try { resposta = await this.executar(this.args, JSON.stringify({ token, app: null })); }
    catch { throw new ErroAcesso('verificação de sessão indisponível', 502); }
    if (resposta.codigo !== 0) throw new ErroAcesso('verificação de sessão indisponível', 502);
    const corte = resposta.stdout.lastIndexOf('\n');
    if (corte < 0) throw new ErroAcesso('verificação de sessão indisponível', 502);
    const status = Number(resposta.stdout.slice(corte + 1).trim());
    if (status === 401) throw new ErroAcesso('sessão inválida ou expirada', 401);
    if (status !== 200) throw new ErroAcesso('verificação de sessão indisponível', 502);
    let corpo;
    try { corpo = JSON.parse(resposta.stdout.slice(0, corte)); }
    catch { throw new ErroAcesso('verificação de sessão indisponível', 502); }
    if (corpo.ok !== true || !/^[1-9]\d{0,9}$/.test(String(corpo.usuario?.id ?? ''))) {
      throw new ErroAcesso('verificação de sessão indisponível', 502);
    }
    return String(corpo.usuario.id);
  }
}

export function criarVerificadorCadastro({ executar = criarExecutorSsh() } = {}) {
  const verificador = new VerificadorCadastro({ executar });
  return token => verificador.verificar(token);
}
