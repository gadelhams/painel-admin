// Aba Contas (Fase 5 do PLANO-CADASTRO-UNICO.md, 13/09/2026): administração
// do CadastroUnico a partir do painel. A API interna do central só existe no
// loopback do servidor (127.0.0.1:8790, /interno/*), autenticada por um
// TOKEN_INTERNO que mora em /opt/conta-astargne/.env — e a decisão do dono é
// que esse token NUNCA sai do servidor. Por isso toda ação daqui é executada
// LÁ, via ssh: o script remoto (fixo) lê o token com sudo, grava um arquivo
// de config do curl (umask 077) e o apaga em seguida. O PC só vê a resposta
// HTTP do central — nunca o cabeçalho de autorização.
//
// Invariantes desta fatia (testadas em test/contas.test.js):
//   I1 o token não é lido, guardado nem logado aqui;
//   I2 dado do usuário (e-mail, nome, apps) viaja SÓ pelo stdin do ssh
//      (`curl -d @-`) — jamais interpolado na linha de comando;
//   I3 método e rota vêm da tabela fechada OPERACOES; `:id` é validado
//      como inteiro positivo antes de entrar na string.

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
const DESTINO_SSH = 'linuxuser@astargne.com';
const TIMEOUT_SSH_MS = 15_000;
const MAX_SAIDA = 1024 * 1024;

// Mesma regra do central (CadastroUnico/src/http/interno.js, idDe): inteiro
// positivo de até 10 dígitos. "1e3", "-1", "01" e "abc" ficam de fora.
const RE_ID = /^[1-9]\d{0,9}$/;

// Tabela fechada: só o que está aqui pode ser pedido ao central. Rota com
// `:id` exige o id validado; `corpo: true` marca as operações que mandam
// JSON pelo stdin (as outras mandam stdin vazio — o script remoto é o mesmo).
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

// O script que roda no servidor. Fixo por desenho: método e rota são as
// únicas partes variáveis, e vêm da tabela acima. O ssh recebe a string como
// um argv só (não há shell no PC); quem a interpreta é o shell REMOTO.
//
// Por que cada pedaço existe (correções após o cético, 13/09/2026):
// - `mktemp` sob `umask 077` + `trap … EXIT`: o arquivo de config do curl
//   nasce só-dono e some em qualquer saída, inclusive nas de erro abaixo.
// - Sem `pipefail` no sh remoto, `sudo` falhando deixa a pipeline com exit 0
//   e o arquivo VAZIO — o curl iria sem cabeçalho e o central responderia
//   401, que o painel repassaria como se fosse legítimo. Daí o `test -s`:
//   token ausente/ilegível vira exit 97 + "sem token" no stderr, e o curl
//   nem roda. (`interpretarSaida` ainda trata 401 como 502 por defesa.)
// - O `.env` do central é lido lá por `node --env-file` e por
//   `EnvironmentFile=` do systemd — ambos aceitam `CHAVE=valor` com ou sem
//   aspas; hoje está sem aspas. O sed tira aspas envolventes (" ou ') se
//   um dia aparecerem, senão elas iriam para dentro do bearer.
// - `curl --max-time 10 -sS`: silencioso no progresso, mas o ERRO vai ao
//   stderr (o `-s` sozinho engolia "connection refused"); morre aos 10 s,
//   antes do timeout de 15 s do painel, para que o stderr chegue aqui.
// - `-w "\n%{http_code}"`: status HTTP numa linha própria depois do corpo —
//   é daí que sai o `status` que o painel repassa.
// O exit do script é o do curl (o trap não o altera).
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

// Monta os argumentos do ssh para uma operação da tabela. Lança ErroContas
// 400 para operação desconhecida ou id inválido — ANTES de qualquer ssh.
export function montarComando(nome, { id } = {}) {
  // hasOwn, não indexação direta: "constructor"/"__proto__" resolveriam pelo
  // protótipo e passariam por operação existente.
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

// Executor real: spawn sem shell (os args vão direto ao binário), stdin =
// JSON fechado com EOF (o `curl -d @-` lá do outro lado lê até o fim),
// timeout duro por SIGKILL, teto de saída. Devolve { codigo, sinal, stdout,
// stderr } — quem interpreta é `interpretarSaida`, testável sem processo.
// A fábrica existe para os testes trocarem `ssh` por um `node -e` falso e
// encurtarem timeout/teto: o encanamento (stdin, EOF, kill) é o mesmo que
// roda em produção — só o binário muda.
export function criarExecutorSsh({ binario = 'ssh', timeoutMs = TIMEOUT_SSH_MS, maxSaida = MAX_SAIDA } = {}) {
  return function executar(args, stdin) {
    return new Promise((resolve, reject) => {
      const filho = spawn(binario, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      });
      const stdout = [];
      const stderr = [];
      let tamanho = 0;
      filho.stdout.on('data', (pedaco) => {
        tamanho += pedaco.length;
        if (tamanho > maxSaida) { filho.kill('SIGKILL'); return; }
        stdout.push(pedaco);
      });
      filho.stderr.on('data', (pedaco) => stderr.push(pedaco));
      filho.on('error', reject);
      filho.on('close', (codigo, sinal) => {
        resolve({
          codigo: sinal ? null : codigo,
          sinal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
      filho.stdin.on('error', () => { /* o processo morreu antes de ler; o close reporta */ });
      filho.stdin.end(stdin ?? '');
    });
  };
}

export const executarSsh = criarExecutorSsh();

// Defesa em profundidade: o stderr do ssh não deveria conter o token (o
// script remoto nunca o ecoa), mas o log do painel jamais deve ser o lugar
// onde essa premissa é testada. Qualquer coisa parecida com um bearer vira
// asterisco antes de ir para o console.
export function redigirSegredo(texto) {
  return String(texto ?? '').replace(/Bearer\s+\S+/gi, 'Bearer ***');
}

// Separa a última linha (status HTTP escrito pelo `-w`) do corpo. Qualquer
// forma inesperada — ssh caiu, script saiu com 97 (sem token), curl não
// chegou ao central (000), corpo que não é JSON — vira ErroContas 502: o
// painel não inventa resposta.
//
// 401 do central NUNCA é resposta legítima aqui: o bearer é montado no
// servidor a partir do .env do próprio central, então 401 só acontece quando
// esse encanamento falhou (token vazio, .env trocado sem reiniciar). Repassar
// 401 faria a aba culpar o usuário por um defeito de infra — vira 502 com
// mensagem própria e log.
//
// stderr com exit 0 também vai ao log (redigido): é aviso de algo torto no
// caminho (curl -S, sudo reclamando) que hoje não derruba a chamada mas
// amanhã pode — perder esse rastro foi o que deixou o 401 passar.
export function interpretarSaida({ codigo, stdout, stderr }, log = console.error) {
  const stderrLimpo = redigirSegredo(stderr).trim().slice(0, 300);
  const falhar = (motivo, mensagem = 'sem acesso ao servidor') => {
    log(`[contas] ${motivo} (ssh exit=${codigo}) ${stderrLimpo}`);
    return new ErroContas(mensagem, 502);
  };
  if (codigo !== 0) throw falhar('ssh falhou');
  if (stderrLimpo) log(`[contas] stderr com exit 0: ${stderrLimpo}`);
  const corte = stdout.lastIndexOf('\n');
  const statusTexto = stdout.slice(corte + 1).trim();
  if (corte < 0 || !/^[1-5]\d\d$/.test(statusTexto)) throw falhar('curl não devolveu status');
  const status = Number(statusTexto);
  if (status === 401) throw falhar('central recusou o token interno', 'sem acesso ao servidor (token interno recusado)');
  const texto = stdout.slice(0, corte);
  let corpo;
  try {
    corpo = texto.trim() ? JSON.parse(texto) : {};
  } catch {
    throw falhar('resposta do central não é JSON');
  }
  return { status, corpo };
}

// Cliente: `chamar(nome, { id, corpo })` → { status, corpo } do central, ou
// ErroContas (400 antes do ssh; 502 quando o caminho até o central falhou).
// `executar` é injetável para os testes (I5) — nunca se chama ssh de verdade
// numa suíte.
export function criarClienteContas({ executar = executarSsh, log = console.error } = {}) {
  async function chamar(nome, { id, corpo } = {}) {
    const { args, precisaCorpo } = montarComando(nome, { id });
    const stdin = precisaCorpo ? JSON.stringify(corpo ?? {}) : '';
    let saida;
    try {
      saida = await executar(args, stdin);
    } catch (erro) {
      log(`[contas] ssh não pôde ser iniciado: ${redigirSegredo(erro.message)}`);
      throw new ErroContas('sem acesso ao servidor', 502);
    }
    return interpretarSaida(saida, log);
  }
  return { chamar };
}

// ---------- adaptador HTTP do painel (/api/contas/*) ----------
// Tabela fechada também aqui: cada rota do painel aponta para UMA operação.
// O `([^/]+)` captura o id cru; quem o valida é montarComando (I3).

const ROTAS_HTTP = [
  { metodo: 'GET', padrao: /^\/api\/contas\/apps$/, operacao: 'listarApps' },
  { metodo: 'GET', padrao: /^\/api\/contas\/usuarios$/, operacao: 'listarUsuarios' },
  { metodo: 'GET', padrao: /^\/api\/contas\/convites$/, operacao: 'listarConvites' },
  { metodo: 'POST', padrao: /^\/api\/contas\/convites$/, operacao: 'criarConvite' },
  { metodo: 'POST', padrao: /^\/api\/contas\/convites\/([^/]+)\/reenviar$/, operacao: 'reenviarConvite' },
  { metodo: 'DELETE', padrao: /^\/api\/contas\/convites\/([^/]+)$/, operacao: 'revogarConvite' },
  { metodo: 'PUT', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/permissoes$/, operacao: 'definirPermissoes' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/desativar$/, operacao: 'desativarUsuario' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/reativar$/, operacao: 'reativarUsuario' },
  { metodo: 'POST', padrao: /^\/api\/contas\/usuarios\/([^/]+)\/redefinir$/, operacao: 'redefinirSenha' },
];

// Resolve (método, caminho) → { operacao, id } ou null. Puro, sem I/O.
export function resolverRotaContas(metodo, pathname) {
  for (const rota of ROTAS_HTTP) {
    const m = pathname.match(rota.padrao);
    if (m && rota.metodo === metodo) return { operacao: rota.operacao, id: m[1] };
  }
  return null;
}

// Manipulador puro: (método, caminho, corpo em texto) → { status, corpo }.
// servidor.js só lê o corpo e escreve a resposta; toda a decisão mora aqui,
// o que permite testar a fronteira HTTP sem subir o servidor do painel.
export function criarManipuladorContas({ cliente }) {
  return async function manipular(metodo, pathname, corpoTexto = '') {
    const rota = resolverRotaContas(metodo, pathname);
    if (!rota) return { status: 404, corpo: { erro: 'não encontrado' } };
    let corpo = {};
    if (OPERACOES[rota.operacao].corpo) {
      try {
        corpo = JSON.parse(corpoTexto);
      } catch {
        return { status: 400, corpo: { erro: 'corpo inválido: mande JSON' } };
      }
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
        return { status: 400, corpo: { erro: 'corpo inválido: mande um objeto JSON' } };
      }
    }
    try {
      return await cliente.chamar(rota.operacao, { id: rota.id, corpo });
    } catch (erro) {
      if (erro instanceof ErroContas) return { status: erro.status, corpo: { erro: erro.message } };
      throw erro;
    }
  };
}
