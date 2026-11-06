// Monta o painel REAL (montagem.js) com falsos em toda porta externa e um diretório de estado temporário; não sobe processo nem toca ssh, Plane, LLM, voz ou CLI de verdade.
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { montarPainel } from '../montagem.js';
import { ErroAcesso } from '../orquestrador/sso.js';

export const DONO = '1';
// Token no formato do cookie do Cadastro Único; só o SSO falso o reconhece.
export const TOKEN_DONO = 'd'.repeat(43);
export const BORDA = 'painel.vpn.astargne.com';

// Cookie que o portão da borda aceita (o selo, com cache, ainda diz "dono") e o autorizador da
// ação recusa (a verificação sem cache diz 401): a sessão que caiu depois de o dono entrar.
export const TOKEN_PORTAO = 'p'.repeat(43);
const COOKIES = { nenhuma: null, portao: TOKEN_PORTAO, dono: TOKEN_DONO };

// Os cabeçalhos do pior caso que passa pela guarda e pela origem privilegiada. `sessao` tem
// nome, não booleano, porque o portão (PAINEL-64) mudou o que "sem sessão" prova:
// - 'portao' (padrão): passa no portão e NÃO vale na ação — só o autorizador da rota barra;
// - 'nenhuma': sem cookie — quem barra é o portão, antes de qualquer rota;
// - 'dono': vale nos dois.
export function cabecalhosDaBorda({ tipo = 'application/json', sessao = 'portao' } = {}) {
  if (!Object.hasOwn(COOKIES, sessao)) throw new Error(`cabecalhosDaBorda: sessao "${sessao}" não existe; use nenhuma, portao ou dono`);
  return { host: BORDA, origin: `https://${BORDA}`, 'sec-fetch-site': 'same-origin', 'content-type': tipo,
    ...(COOKIES[sessao] ? { cookie: `astargne_session=${COOKIES[sessao]}` } : {}) };
}

export async function montarComFalsos({ ambiente = { ORQ_OWNER_USER_ID: DONO }, externos = {}, porta = 7777, sementes = {} } = {}) {
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'painel-montagem-'));
  for (const [nome, conteudo] of Object.entries(sementes)) {
    await fs.mkdir(path.dirname(path.join(diretorio, nome)), { recursive: true });
    await fs.writeFile(path.join(diretorio, nome), typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
  }
  const chamadas = [];
  const logs = [];
  // Qualquer acesso a uma porta externa fica registrado: quem testa recusa exige lista vazia.
  const espiao = nome => new Proxy({}, { get: (_, prop) => (prop === 'then' ? undefined
    : (...a) => { chamadas.push(`${nome}.${String(prop)}`); return Promise.resolve({}); }) });
  const funcao = (nome, retorno) => async (...a) => { chamadas.push(nome); return typeof retorno === 'function' ? retorno(...a) : retorno; };
  const verificarSessao = token => {
    if (token === TOKEN_DONO) return DONO;
    throw new ErroAcesso('sessão inválida ou expirada', 401);
  };
  const painel = montarPainel({
    ambiente, porta, diretorioEstado: diretorio, log: (...a) => logs.push(a.join(' ')),
    externos: {
      executarSsh: funcao('ssh', { codigo: 0, stdout: '{}\n200', stderr: '' }),
      leituraSsh: espiao('ssh-leitura'),
      sso: { verificar: funcao('sso.verificar', verificarSessao),
        identificar: funcao('sso.identificar', t => ({ id: t === TOKEN_PORTAO ? DONO : verificarSessao(t), nome: 'Dono', email: 'dono@exemplo' })) },
      fetchPlane: funcao('plane.fetch', () => { throw new Error('Plane falso'); }),
      consultarPlane: espiao('plane'),
      conversar: funcao('conversar'),
      transcrever: funcao('transcrever', { texto: '' }),
      fetchVoz: funcao('voz.fetch', () => { throw new Error('voz falsa'); }),
      spawnCli: funcao('spawn'),
      coletores: espiao('coletores'),
      agora: () => Date.parse('2026-10-31T12:00:00Z'),
      diretorioCodex: path.join(diretorio, 'codex'),
      // As chaves das identidades do catálogo nunca vêm do ~/.config/plane real num teste.
      diretorioChaves: path.join(diretorio, 'chaves'),
      ...externos,
    },
  });
  return { painel, chamadas, logs, diretorio, limpar: () => fs.rm(diretorio, { recursive: true, force: true }) };
}

// http.Server de verdade numa porta efêmera; a porta só existe depois do listen, e a guarda
// confere o Host contra ela — por isso a montagem vem depois.
export async function servirComFalsos(opcoes = {}) {
  let atender = null;
  const servidor = http.createServer((req, res) => atender(req, res));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const porta = servidor.address().port;
  const montado = await montarComFalsos({ ...opcoes, porta });
  atender = montado.painel.atender;
  const pedir = (metodo, caminho, { cabecalhos = {}, corpo } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho,
      headers: { host: `127.0.0.1:${porta}`, ...cabecalhos } }, res => {
      const pedacos = [];
      res.on('data', p => pedacos.push(p));
      res.on('end', () => {
        const texto = Buffer.concat(pedacos).toString('utf8');
        let json = null;
        try { json = JSON.parse(texto); } catch { /* estático não é JSON */ }
        resolve({ status: res.statusCode, cabecalhos: res.headers, texto, corpo: json });
      });
    });
    req.on('error', reject);
    req.end(corpo);
  });
  return { ...montado, porta, pedir,
    fechar: async () => { servidor.closeAllConnections(); await new Promise(r => servidor.close(r)); await montado.limpar(); } };
}
