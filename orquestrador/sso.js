// Fronteira das ações privilegiadas. A leitura do Painel não usa esta sessão.
// O TOKEN_INTERNO permanece no servidor do Cadastro Único; o cookie viaja
// somente pelo stdin do ssh e nunca aparece em argv, URL, erro ou log.
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { criarExecutorSsh } from '../contas.js';

const ORIGEM = 'https://painel.vpn.astargne.com';
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

export class ErroAcesso extends Error {
  constructor(mensagem, status) { super(mensagem); this.status = status; }
}

export function extrairSessao(cabecalho) {
  if (typeof cabecalho !== 'string' || cabecalho.length > 8192) return null;
  const valores = cabecalho.split(';').map(p => p.trim()).filter(p => p.startsWith('astargne_session='));
  if (valores.length !== 1) return null;
  const token = valores[0].slice('astargne_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function recusaOrigemPrivilegiada(req, tiposConteudo = /^application\/json(?:\s*;|$)/i) {
  if (req.headers.host !== 'painel.vpn.astargne.com' || req.headers.origin !== ORIGEM ||
      req.headers['sec-fetch-site'] !== 'same-origin') return new ErroAcesso('origem privilegiada recusada', 403);
  if (!tiposConteudo.test(req.headers['content-type'] ?? '')) return new ErroAcesso('tipo de conteúdo recusado', 415);
  return null;
}

export function criarVerificadorCadastro({ executar = criarExecutorSsh() } = {}) {
  const args = ['-i', path.join(os.homedir(), '.ssh', 'paroquia-vultr'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    'linuxuser@astargne.com', SCRIPT_VERIFICAR];
  return async token => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) throw new ErroAcesso('sessão ausente', 401);
    let resposta;
    try { resposta = await executar(args, JSON.stringify({ token, app: null })); }
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
  };
}

export function criarAutorizador({ verificar, proprietarioId, tiposConteudo } = {}) {
  return async req => {
    const recusa = recusaOrigemPrivilegiada(req, tiposConteudo);
    if (recusa) throw recusa;
    if (!/^[1-9]\d{0,9}$/.test(String(proprietarioId ?? ''))) throw new ErroAcesso('ação privilegiada não configurada', 503);
    const token = extrairSessao(req.headers.cookie);
    if (!token) throw new ErroAcesso('entre no Cadastro Único para confirmar esta ação', 401);
    const usuarioId = await verificar(token); // Sem cache: revogação vale na próxima requisição.
    if (usuarioId !== String(proprietarioId)) throw new ErroAcesso('usuário sem permissão para confirmar', 403);
    return { usuarioId, sessaoHash: createHash('sha256').update(token).digest('hex') };
  };
}
