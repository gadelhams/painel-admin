// Testes do módulo contas.js (aba Contas). Nunca chamam ssh: o executor é
// injetado (I5) e captura args + stdin, devolvendo saída pré-gravada no
// formato que o script remoto produz (corpo JSON, "\n", status HTTP).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  OPERACOES,
  ErroContas,
  montarComando,
  interpretarSaida,
  redigirSegredo,
  criarClienteContas,
  criarExecutorSsh,
  resolverRotaContas,
  criarManipuladorContas,
} from '../contas.js';

const CHAVE = path.join(os.homedir(), '.ssh', 'paroquia-vultr');

// O script remoto esperado, byte a byte — se mudar de propósito, mude aqui
// junto: é o contrato entre o painel e o servidor. Cada pedaço abaixo
// responde a um achado do cético (13/09/2026): mktemp+trap (arquivo só-dono
// que some em qualquer saída), `|| exit 97` e `test -s` (sudo/token ausente
// não vira 401 silencioso), sed que tira aspas envolventes, `--max-time 10
// -sS` (erro do curl no stderr, morre antes do timeout do painel).
function scriptEsperado(metodo, rota) {
  return 'umask 077; '
    + 'f=$(mktemp /tmp/painel-contas.XXXXXX) || exit 97; '
    + 'trap \'rm -f "$f"\' EXIT; '
    + 'sudo grep "^TOKEN_INTERNO=" /opt/conta-astargne/.env'
    + ' | sed "s/^TOKEN_INTERNO=//; s/^[\\"\']\\(.*\\)[\\"\']\\$/\\1/; s/^/header = \\"Authorization: Bearer /; s/\\$/\\"/" > "$f"'
    + ' || { echo "sem token" >&2; exit 97; }; '
    + 'test -s "$f" || { echo "sem token" >&2; exit 97; }; '
    + `curl --max-time 10 -sS -K "$f" -X ${metodo} http://127.0.0.1:8790${rota}`
    + ' -H "content-type: application/json" -d @- -w "\\n%{http_code}"';
}

function argsEsperados(metodo, rota) {
  return ['-i', CHAVE, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'linuxuser@astargne.com', scriptEsperado(metodo, rota)];
}

// Executor falso: grava cada chamada e devolve a saída programada.
function executorFalso(saida = { codigo: 0, stdout: '{}\n200', stderr: '' }) {
  const chamadas = [];
  const executar = async (args, stdin) => {
    chamadas.push({ args, stdin });
    if (saida instanceof Error) throw saida;
    return typeof saida === 'function' ? saida(args, stdin) : saida;
  };
  return { executar, chamadas };
}

function coletorDeLog() {
  const linhas = [];
  return { log: (l) => linhas.push(String(l)), linhas };
}

describe('tabela fechada e montagem do comando (I3)', () => {
  test('cada operação da tabela gera método e rota exatos; nada fora dela passa', () => {
    const esperado = {
      listarApps: ['GET', '/interno/apps'],
      listarUsuarios: ['GET', '/interno/usuarios'],
      listarConvites: ['GET', '/interno/convites'],
      criarConvite: ['POST', '/interno/convites'],
      reenviarConvite: ['POST', '/interno/convites/7/reenviar'],
      revogarConvite: ['DELETE', '/interno/convites/7'],
      definirPermissoes: ['PUT', '/interno/usuarios/7/permissoes'],
      desativarUsuario: ['POST', '/interno/usuarios/7/desativar'],
      reativarUsuario: ['POST', '/interno/usuarios/7/reativar'],
      redefinirSenha: ['POST', '/interno/usuarios/7/redefinir'],
    };
    assert.deepEqual(Object.keys(OPERACOES).sort(), Object.keys(esperado).sort());
    for (const [nome, [metodo, rota]] of Object.entries(esperado)) {
      assert.deepEqual(montarComando(nome, { id: '7' }).args, argsEsperados(metodo, rota), nome);
    }
    assert.throws(() => montarComando('apagarBanco'), (e) => e instanceof ErroContas && e.status === 400);
    assert.throws(() => montarComando('__proto__'), (e) => e instanceof ErroContas && e.status === 400);
    assert.throws(() => montarComando('constructor'), (e) => e instanceof ErroContas && e.status === 400);
  });

  test('só as operações com corpo mandam JSON pelo stdin', () => {
    assert.equal(montarComando('criarConvite').precisaCorpo, true);
    assert.equal(montarComando('definirPermissoes', { id: '1' }).precisaCorpo, true);
    assert.equal(montarComando('listarUsuarios').precisaCorpo, false);
    assert.equal(montarComando('desativarUsuario', { id: '1' }).precisaCorpo, false);
  });

  test('id inválido → ErroContas 400 antes de montar qualquer comando', () => {
    for (const id of ['abc', '1e3', '-1', '0', '01', '1.5', ' 1', '1 ', '12345678901', '', undefined, null, 7, '7/../8']) {
      assert.throws(
        () => montarComando('reenviarConvite', { id }),
        (e) => e instanceof ErroContas && e.status === 400 && e.message === 'id inválido',
        `id ${JSON.stringify(id)} deveria ser recusado`,
      );
    }
    assert.equal(montarComando('reenviarConvite', { id: '1234567890' }).args.at(-1).includes('/interno/convites/1234567890/reenviar'), true);
  });
});

describe('dado do usuário só pelo stdin (I2)', () => {
  test('e-mail com injeção de shell vira só conteúdo JSON no stdin; o comando é byte a byte o fixo', async () => {
    const { executar, chamadas } = executorFalso({ codigo: 0, stdout: '{"convite":{"id":9}}\n201', stderr: '' });
    const cliente = criarClienteContas({ executar, log: () => {} });
    const corpo = { email: "'; rm -rf /tmp; echo '", nome: '$(whoami) `id` && :', apps: ['filosofia'] };
    const r = await cliente.chamar('criarConvite', { corpo });

    assert.equal(chamadas.length, 1);
    assert.deepEqual(chamadas[0].args, argsEsperados('POST', '/interno/convites'));
    assert.equal(chamadas[0].stdin, JSON.stringify(corpo));
    for (const arg of chamadas[0].args) {
      assert.equal(arg.includes('rm -rf'), false);
      assert.equal(arg.includes('whoami'), false);
    }
    assert.deepEqual(r, { status: 201, corpo: { convite: { id: 9 } } });
  });

  test('permissões: id validado entra na rota, apps só no stdin', async () => {
    const { executar, chamadas } = executorFalso({ codigo: 0, stdout: '{"apps":["jogos"]}\n200', stderr: '' });
    const cliente = criarClienteContas({ executar, log: () => {} });
    await cliente.chamar('definirPermissoes', { id: '3', corpo: { apps: ['jogos; reboot'] } });
    assert.deepEqual(chamadas[0].args, argsEsperados('PUT', '/interno/usuarios/3/permissoes'));
    assert.equal(chamadas[0].stdin, '{"apps":["jogos; reboot"]}');
  });

  test('operação sem corpo manda stdin vazio (o curl -d @- lê zero bytes)', async () => {
    const { executar, chamadas } = executorFalso({ codigo: 0, stdout: '{"ok":true}\n200', stderr: '' });
    const cliente = criarClienteContas({ executar, log: () => {} });
    await cliente.chamar('desativarUsuario', { id: '2', corpo: { email: 'ignorado@x.com' } });
    assert.equal(chamadas[0].stdin, '');
  });
});

describe('token nunca no PC (I1)', () => {
  test('um TOKEN_INTERNO no ambiente do PC não entra no comando, no stdin nem na resposta', async () => {
    const anterior = process.env.TOKEN_INTERNO;
    process.env.TOKEN_INTERNO = 'VAZOU-DO-AMBIENTE';
    try {
      const { executar, chamadas } = executorFalso({ codigo: 0, stdout: '{"usuarios":[]}\n200', stderr: '' });
      const cliente = criarClienteContas({ executar, log: () => {} });
      const r = await cliente.chamar('listarUsuarios');
      const tudo = JSON.stringify([chamadas, r]);
      assert.equal(tudo.includes('VAZOU-DO-AMBIENTE'), false);
      // O script remoto contém o rótulo "Bearer " (é ele quem monta o
      // cabeçalho, lá), mas nunca um valor depois dele.
      assert.match(chamadas[0].args.at(-1), /Bearer \/; s\//);
    } finally {
      if (anterior === undefined) delete process.env.TOKEN_INTERNO;
      else process.env.TOKEN_INTERNO = anterior;
    }
  });

  test('stderr com bearer (defesa em profundidade) é redigido no log e nunca chega à resposta', async () => {
    const { executar } = executorFalso({ codigo: 255, stdout: '', stderr: 'curl: header Authorization: Bearer SEGREDO-abc123 recusado\n' });
    const { log, linhas } = coletorDeLog();
    const cliente = criarClienteContas({ executar, log });
    await assert.rejects(cliente.chamar('listarApps'), (e) => e instanceof ErroContas && e.status === 502 && e.message === 'sem acesso ao servidor');
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].includes('SEGREDO-abc123'), false, `log vazou: ${linhas[0]}`);
    assert.match(linhas[0], /Bearer \*\*\*/);
  });

  test('redigirSegredo cobre variações de caixa e espaço', () => {
    assert.equal(redigirSegredo('x Authorization: bearer   tok.en_1 y'), 'x Authorization: Bearer *** y');
    assert.equal(redigirSegredo('sem nada'), 'sem nada');
    assert.equal(redigirSegredo(undefined), '');
  });
});

describe('mapeamento status/corpo e erro de ssh → 502', () => {
  test('corpo JSON + última linha = status', () => {
    assert.deepEqual(interpretarSaida({ codigo: 0, stdout: '{"apps":[{"id":"jogos"}]}\n200', stderr: '' }, () => {}), { status: 200, corpo: { apps: [{ id: 'jogos' }] } });
    assert.deepEqual(interpretarSaida({ codigo: 0, stdout: '{"erro":"Usuário não encontrado."}\n404', stderr: '' }, () => {}), { status: 404, corpo: { erro: 'Usuário não encontrado.' } });
    assert.deepEqual(interpretarSaida({ codigo: 0, stdout: '{"erro":"Sem permissão."}\n403', stderr: '' }, () => {}), { status: 403, corpo: { erro: 'Sem permissão.' } });
    // Corpo com quebra de linha interna: só a ÚLTIMA linha é o status.
    assert.deepEqual(interpretarSaida({ codigo: 0, stdout: '{"a":\n1}\n200', stderr: '' }, () => {}), { status: 200, corpo: { a: 1 } });
    assert.deepEqual(interpretarSaida({ codigo: 0, stdout: '\n200', stderr: '' }, () => {}), { status: 200, corpo: {} });
  });

  test('ssh caiu, script sem token (97), curl sem status (000/7), ou corpo não-JSON → ErroContas 502', () => {
    const casos = [
      { codigo: 255, stdout: '', stderr: 'Permission denied (publickey).' },
      { codigo: null, stdout: '', stderr: '' }, // morto por timeout
      // O que o script remoto produz quando sudo falha ou a chave não está no .env
      // (provado localmente contra um central falso, RELATORIO §C das correções).
      { codigo: 97, stdout: '', stderr: 'sem token\n' },
      // O que o curl -sS produz com o central fora: exit 7, "\n000" no stdout.
      { codigo: 7, stdout: '\n000', stderr: 'curl: (7) Failed to connect to 127.0.0.1:8790' },
      { codigo: 0, stdout: '\n000', stderr: '' },
      { codigo: 0, stdout: 'sem status nenhum', stderr: '' },
      { codigo: 0, stdout: '<html>nginx</html>\n502', stderr: '' },
    ];
    for (const caso of casos) {
      const { log, linhas } = coletorDeLog();
      assert.throws(() => interpretarSaida(caso, log), (e) => e instanceof ErroContas && e.status === 502 && e.message === 'sem acesso ao servidor', JSON.stringify(caso));
      assert.ok(linhas.length >= 1, `sem log para ${JSON.stringify(caso)}`);
      if (caso.stderr) assert.ok(linhas.some((l) => l.includes(caso.stderr.trim())), `stderr não foi ao log: ${JSON.stringify(caso)}`);
    }
  });

  // O bearer nasce no servidor, do .env do próprio central: 401 nunca é
  // resposta legítima para o painel — é o encanamento do token quebrado.
  // O primeiro caso é o estado que o script ANTIGO produzia com sudo
  // falhando (exit 0 do `rm -f`, arquivo vazio, curl sem header, stderr do
  // sudo descartado) e que o painel repassava como 401 legítimo.
  test('401 do central → 502 "token interno recusado", com o stderr no log mesmo com exit 0', () => {
    const casos = [
      { codigo: 0, stdout: '{"erro":"não autorizado"}\n401', stderr: 'sudo: a password is required\n' },
      { codigo: 0, stdout: '\n401', stderr: '' },
      { codigo: 0, stdout: '{"erro":"não autorizado"}\n401', stderr: '' },
    ];
    for (const caso of casos) {
      const { log, linhas } = coletorDeLog();
      assert.throws(
        () => interpretarSaida(caso, log),
        (e) => e instanceof ErroContas && e.status === 502 && e.message === 'sem acesso ao servidor (token interno recusado)',
        JSON.stringify(caso),
      );
      assert.ok(linhas.some((l) => /token interno/.test(l)), `log sem o motivo: ${linhas}`);
      if (caso.stderr) assert.ok(linhas.some((l) => l.includes('sudo: a password is required')), `stderr do sudo perdido: ${linhas}`);
    }
  });

  test('stderr não-vazio com exit 0 e status são → resposta passa, mas o stderr vai ao log (redigido)', () => {
    const { log, linhas } = coletorDeLog();
    const r = interpretarSaida({ codigo: 0, stdout: '{"ok":true}\n200', stderr: 'aviso qualquer Authorization: Bearer SEGREDO-zzz\n' }, log);
    assert.deepEqual(r, { status: 200, corpo: { ok: true } });
    assert.equal(linhas.length, 1);
    assert.match(linhas[0], /stderr com exit 0/);
    assert.match(linhas[0], /aviso qualquer/);
    assert.equal(linhas[0].includes('SEGREDO-zzz'), false);
    // Sem stderr, nada vai ao log: o caminho feliz continua silencioso.
    const silencio = coletorDeLog();
    interpretarSaida({ codigo: 0, stdout: '{}\n200', stderr: '' }, silencio.log);
    assert.equal(silencio.linhas.length, 0);
  });

  test('spawn que nem inicia (ssh ausente) → 502, e o log não repete o stack', async () => {
    const { executar } = executorFalso(Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' }));
    const { log, linhas } = coletorDeLog();
    const cliente = criarClienteContas({ executar, log });
    await assert.rejects(cliente.chamar('listarApps'), (e) => e.status === 502);
    assert.equal(linhas.length, 1);
    assert.match(linhas[0], /ENOENT/);
  });
});

// O executor de verdade (spawn, stdin, EOF, timeout, teto), com um binário
// falso: o próprio node rodando `-e`. É o mesmo encanamento que roda contra
// o ssh.exe — só o executável muda (achado 3 do cético: cobertura zero).
describe('executarSsh com binário falso (node -e)', () => {
  const NODE = process.execPath;
  // Lê o stdin ATÉ O EOF e devolve como {"eco": <texto>} + "\n200" — se o
  // painel não fechar o stdin, este processo nunca termina.
  const ECO = 'const d=[];process.stdin.on("data",c=>d.push(c)).on("end",()=>{process.stdout.write(JSON.stringify({eco:Buffer.concat(d).toString("utf8")})+"\\n200")})';
  const JSON_ACENTOS = JSON.stringify({ email: 'joão.ção@exemplo.com', nome: 'Ágüe\nlinha 2\r\nlinha 3 — “aspas” ’ ç Ç', apps: ['filosofia', 'jogos'] });

  test('stdin recebe o JSON inteiro (acentos, quebras) e é fechado com EOF; a saída passa por interpretarSaida', async () => {
    const executar = criarExecutorSsh({ binario: NODE, timeoutMs: 5_000 });
    const saida = await executar(['-e', ECO], JSON_ACENTOS);
    assert.equal(saida.codigo, 0);
    assert.equal(saida.sinal, null);
    assert.deepEqual(interpretarSaida(saida, () => {}), { status: 200, corpo: { eco: JSON_ACENTOS } });
    // stdin vazio também fecha (operações sem corpo): o eco é "".
    assert.deepEqual(interpretarSaida(await executar(['-e', ECO], ''), () => {}), { status: 200, corpo: { eco: '' } });
  });

  test('cadeia inteira: cliente → executor real (binário falso) → central falso → corpo de volta', async () => {
    // O cliente monta os args do ssh; aqui eles são descartados e o binário
    // falso recebe só o `-e` — o que se prova é o stdin e a interpretação.
    const base = criarExecutorSsh({ binario: NODE, timeoutMs: 5_000 });
    const executar = (_args, stdin) => base(['-e', ECO], stdin);
    const cliente = criarClienteContas({ executar, log: () => {} });
    const corpo = JSON.parse(JSON_ACENTOS);
    const r = await cliente.chamar('criarConvite', { corpo });
    assert.deepEqual(r, { status: 200, corpo: { eco: JSON.stringify(corpo) } });
  });

  test('timeout mata o processo (SIGKILL) e vira 502', async () => {
    const executar = criarExecutorSsh({ binario: NODE, timeoutMs: 300 });
    const inicio = Date.now();
    const saida = await executar(['-e', 'setTimeout(()=>{},3000)'], '');
    const gasto = Date.now() - inicio;
    assert.equal(saida.codigo, null, `codigo=${saida.codigo} sinal=${saida.sinal}`);
    assert.equal(saida.sinal, 'SIGKILL');
    assert.ok(gasto < 2_500, `demorou ${gasto} ms — o timeout não agiu`);
    assert.throws(() => interpretarSaida(saida, () => {}), (e) => e instanceof ErroContas && e.status === 502);
  });

  test('saída acima do teto mata o processo (SIGKILL), guarda no máximo o teto e vira 502', async () => {
    const executar = criarExecutorSsh({ binario: NODE, timeoutMs: 5_000, maxSaida: 1024 });
    const inicio = Date.now();
    // Escreve 4 KiB e fica vivo: se não for morto pelo teto, sai com 0 depois de 3 s.
    const saida = await executar(['-e', 'process.stdout.write("x".repeat(4096));setTimeout(()=>{},3000)'], '');
    const gasto = Date.now() - inicio;
    assert.equal(saida.codigo, null, `codigo=${saida.codigo} sinal=${saida.sinal}`);
    assert.equal(saida.sinal, 'SIGKILL');
    assert.ok(saida.stdout.length <= 1024, `guardou ${saida.stdout.length} bytes`);
    assert.ok(gasto < 2_500, `demorou ${gasto} ms — o teto não agiu`);
    assert.throws(() => interpretarSaida(saida, () => {}), (e) => e instanceof ErroContas && e.status === 502);
  });

  test('binário inexistente → rejeita (o cliente transforma em 502)', async () => {
    const executar = criarExecutorSsh({ binario: 'binario-que-nao-existe-painel-contas', timeoutMs: 1_000 });
    await assert.rejects(executar(['x'], ''), (e) => e.code === 'ENOENT');
    const cliente = criarClienteContas({ executar, log: () => {} });
    await assert.rejects(cliente.chamar('listarApps'), (e) => e instanceof ErroContas && e.status === 502);
  });
});

describe('fronteira HTTP do painel (/api/contas/*)', () => {
  test('resolverRotaContas: tabela fechada, método conta', () => {
    assert.deepEqual(resolverRotaContas('GET', '/api/contas/apps'), { operacao: 'listarApps', id: undefined });
    assert.deepEqual(resolverRotaContas('DELETE', '/api/contas/convites/12'), { operacao: 'revogarConvite', id: '12' });
    assert.deepEqual(resolverRotaContas('PUT', '/api/contas/usuarios/abc/permissoes'), { operacao: 'definirPermissoes', id: 'abc' });
    assert.equal(resolverRotaContas('POST', '/api/contas/apps'), null);
    assert.equal(resolverRotaContas('GET', '/api/contas/usuarios/1/desativar'), null);
    assert.equal(resolverRotaContas('POST', '/api/contas/usuarios/importar'), null, 'importar não existe na tabela do painel');
    assert.equal(resolverRotaContas('POST', '/api/contas/sessao/verificar'), null);
    assert.equal(resolverRotaContas('GET', '/api/contas/'), null);
  });

  // Servidor mínimo com o manipulador real, atacado por fetch de verdade:
  // a asserção é sobre o status e o corpo que o navegador receberia.
  async function comServidor(saida, fn) {
    const { executar, chamadas } = executorFalso(saida);
    const manipular = criarManipuladorContas({ cliente: criarClienteContas({ executar, log: () => {} }) });
    const servidor = http.createServer(async (req, res) => {
      const pedacos = [];
      for await (const p of req) pedacos.push(p);
      const { status, corpo } = await manipular(req.method, new URL(req.url, 'http://x').pathname, Buffer.concat(pedacos).toString('utf8'));
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(corpo));
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const pedir = async (metodo, caminho, corpo) => {
      const r = await fetch(base + caminho, { method: metodo, headers: corpo !== undefined ? { 'content-type': 'application/json' } : {}, body: corpo });
      return { status: r.status, corpo: await r.json() };
    };
    try {
      await fn({ pedir, chamadas });
    } finally {
      await new Promise((r) => servidor.close(r));
    }
  }

  test('GET usuários repassa status e corpo do central', () => comServidor(
    { codigo: 0, stdout: '{"usuarios":[{"id":1,"email":"a@b.c","nome":"A","ativo":true,"criado_em":"2026-09-12T00:00:00.000Z","apps":["jogos"]}]}\n200', stderr: '' },
    async ({ pedir, chamadas }) => {
      assert.deepEqual(await pedir('GET', '/api/contas/usuarios'), {
        status: 200,
        corpo: { usuarios: [{ id: 1, email: 'a@b.c', nome: 'A', ativo: true, criado_em: '2026-09-12T00:00:00.000Z', apps: ['jogos'] }] },
      });
      assert.deepEqual(chamadas[0].args, argsEsperados('GET', '/interno/usuarios'));
    },
  ));

  test('id inválido → 400 no painel e o ssh NÃO é chamado (I3)', () => comServidor(
    { codigo: 0, stdout: '{"ok":true}\n200', stderr: '' },
    async ({ pedir, chamadas }) => {
      assert.deepEqual(await pedir('POST', '/api/contas/convites/abc/reenviar'), { status: 400, corpo: { erro: 'id inválido' } });
      assert.deepEqual(await pedir('POST', '/api/contas/usuarios/1e3/desativar'), { status: 400, corpo: { erro: 'id inválido' } });
      assert.deepEqual(await pedir('DELETE', '/api/contas/convites/-1'), { status: 400, corpo: { erro: 'id inválido' } });
      assert.deepEqual(await pedir('PUT', '/api/contas/usuarios/0/permissoes', '{"apps":[]}'), { status: 400, corpo: { erro: 'id inválido' } });
      assert.equal(chamadas.length, 0, 'nenhum ssh deveria ter sido disparado');
      assert.deepEqual(await pedir('POST', '/api/contas/usuarios/5/reativar'), { status: 200, corpo: { ok: true } });
      assert.equal(chamadas.length, 1);
      assert.deepEqual(chamadas[0].args, argsEsperados('POST', '/interno/usuarios/5/reativar'));
    },
  ));

  test('rota fora da tabela → 404; corpo não-JSON ou não-objeto → 400, sem ssh', () => comServidor(
    { codigo: 0, stdout: '{}\n200', stderr: '' },
    async ({ pedir, chamadas }) => {
      assert.deepEqual(await pedir('GET', '/api/contas/nada'), { status: 404, corpo: { erro: 'não encontrado' } });
      assert.deepEqual(await pedir('POST', '/api/contas/usuarios/importar', '{}'), { status: 404, corpo: { erro: 'não encontrado' } });
      assert.deepEqual(await pedir('POST', '/api/contas/convites', '{not json'), { status: 400, corpo: { erro: 'corpo inválido: mande JSON' } });
      assert.deepEqual(await pedir('POST', '/api/contas/convites', '[1,2]'), { status: 400, corpo: { erro: 'corpo inválido: mande um objeto JSON' } });
      assert.deepEqual(await pedir('PUT', '/api/contas/usuarios/1/permissoes', ''), { status: 400, corpo: { erro: 'corpo inválido: mande JSON' } });
      assert.equal(chamadas.length, 0);
    },
  ));

  test('erro de ssh → 502 {erro:"sem acesso ao servidor"} — corpo inteiro pinado', () => comServidor(
    { codigo: 255, stdout: '', stderr: 'ssh: connect to host astargne.com port 22: Connection timed out' },
    async ({ pedir }) => {
      assert.deepEqual(await pedir('GET', '/api/contas/convites'), { status: 502, corpo: { erro: 'sem acesso ao servidor' } });
    },
  ));

  test('401 do central → 502 {erro:"sem acesso ao servidor (token interno recusado)"} — nunca repassado como 401', () => comServidor(
    { codigo: 0, stdout: '{"erro":"não autorizado"}\n401', stderr: 'sudo: a password is required\n' },
    async ({ pedir }) => {
      assert.deepEqual(await pedir('GET', '/api/contas/usuarios'), { status: 502, corpo: { erro: 'sem acesso ao servidor (token interno recusado)' } });
    },
  ));

  test('script sem token (exit 97) → 502 {erro:"sem acesso ao servidor"}', () => comServidor(
    { codigo: 97, stdout: '', stderr: 'sem token\n' },
    async ({ pedir }) => {
      assert.deepEqual(await pedir('GET', '/api/contas/apps'), { status: 502, corpo: { erro: 'sem acesso ao servidor' } });
    },
  ));

  test('criar convite: corpo do navegador vai inteiro ao stdin; 201 e o convite voltam como vieram', () => comServidor(
    { codigo: 0, stdout: '{"convite":{"id":4,"email":"x@y.z","nome":null,"apps":["player"],"expiraEm":"2026-09-20T00:00:00.000Z","link":"https://astargne.com/convite/tok","enviado":false,"erro":"provedor fora do ar"}}\n201', stderr: '' },
    async ({ pedir, chamadas }) => {
      const r = await pedir('POST', '/api/contas/convites', '{"email":"x@y.z","apps":["player"]}');
      assert.equal(r.status, 201);
      assert.deepEqual(r.corpo.convite, { id: 4, email: 'x@y.z', nome: null, apps: ['player'], expiraEm: '2026-09-20T00:00:00.000Z', link: 'https://astargne.com/convite/tok', enviado: false, erro: 'provedor fora do ar' });
      assert.equal(chamadas[0].stdin, '{"email":"x@y.z","apps":["player"]}');
    },
  ));

  test('erro de domínio do central (409, 400) passa como está, sem virar 502', () => comServidor(
    { codigo: 0, stdout: '{"erro":"Já existe uma conta com esse e-mail."}\n409', stderr: '' },
    async ({ pedir }) => {
      assert.deepEqual(await pedir('POST', '/api/contas/convites', '{"email":"g@x.com","apps":["jogos"]}'), { status: 409, corpo: { erro: 'Já existe uma conta com esse e-mail.' } });
    },
  ));
});
