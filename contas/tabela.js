// Tabela fechada do Cadastro Único. Método e rota nascem aqui; o id entra só depois de validado.

import os from 'node:os';
import path from 'node:path';

export const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
export const DESTINO_SSH = 'linuxuser@astargne.com';
const RE_ID = /^[1-9]\d{0,9}$/;

export const OPERACOES = Object.freeze({
  listarApps: { metodo: 'GET', rota: '/interno/apps' },
  listarUsuarios: { metodo: 'GET', rota: '/interno/usuarios' },
  listarConvites: { metodo: 'GET', rota: '/interno/convites' },
  criarConvite: { metodo: 'POST', rota: '/interno/convites', corpo: true },
  reenviarConvite: { metodo: 'POST', rota: '/interno/convites/:id/reenviar' },
  revogarConvite: { metodo: 'DELETE', rota: '/interno/convites/:id' },
  definirPermissoes: { metodo: 'PUT', rota: '/interno/usuarios/:id/permissoes', corpo: true },
  desativarUsuario: { metodo: 'POST', rota: '/interno/usuarios/:id/desativar' },
  reativarUsuario: { metodo: 'POST', rota: '/interno/usuarios/:id/reativar' },
  redefinirSenha: { metodo: 'POST', rota: '/interno/usuarios/:id/redefinir' },
});

export class ErroContas extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

function scriptRemoto(metodo, rota) {
  return [
    'umask 077',
    'f=$(mktemp /tmp/painel-contas.XXXXXX) || exit 97',
    'trap \'rm -f "$f"\' EXIT',
    'sudo grep "^TOKEN_INTERNO=" /opt/conta-astargne/.env'
      + ' | sed "s/^TOKEN_INTERNO=//; s/^[\\"\']\\(.*\\)[\\"\']\\$/\\1/; s/^/header = \\"Authorization: Bearer /; s/\\$/\\"/" > "$f"'
      + ' || { echo "sem token" >&2; exit 97; }',
    'test -s "$f" || { echo "sem token" >&2; exit 97; }',
    `curl --max-time 10 -sS -K "$f" -X ${metodo} http://127.0.0.1:8790${rota}`
      + ' -H "content-type: application/json" -d @- -w "\\n%{http_code}"',
  ].join('; ');
}

export function montarComando(nome, { id } = {}) {
  if (!Object.hasOwn(OPERACOES, nome)) throw new ErroContas('operação desconhecida', 400);
  const op = OPERACOES[nome];
  let rota = op.rota;
  if (rota.includes(':id')) {
    if (typeof id !== 'string' || !RE_ID.test(id)) throw new ErroContas('id inválido', 400);
    rota = rota.replace(':id', id);
  }
  return {
    args: [
      '-i', CHAVE_SSH,
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      DESTINO_SSH,
      scriptRemoto(op.metodo, rota),
    ],
    precisaCorpo: Boolean(op.corpo),
  };
}
