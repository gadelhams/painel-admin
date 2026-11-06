// Portão de entrada da borda (PAINEL-64): pedido que não é de loopback só segue com a sessão do dono no Cadastro Único. Não autoriza ação privilegiada (isso é do autorizador de cada rota) nem verifica a sessão sozinho (pergunta ao selo).
//
// "De loopback" é o pedido de um processo desta máquina: Host de loopback e nenhum
// cabeçalho de proxy. O Caddy da borda preserva o Host (`painel.vpn.astargne.com`) e
// acrescenta X-Forwarded-*; se um dia a configuração dele trocar o Host, o cabeçalho de
// proxy ainda derruba o pedido no portão. Processo local que forja o Host da borda só
// consegue ficar MAIS restrito. O loopback fica sem login de propósito: é por onde os
// agentes locais, o reservar.mjs e o encaminhamento de porta do VS Code falam com o painel.
//
// O veredito vale na ADMISSÃO do pedido: um turno do C-3PO já aceito não é cortado se a
// sessão cair no meio. O 302 para o login só sai uma vez por tentativa (`volta=1` no
// `next`): se o central e o painel discordarem sobre a sessão, o dono vê uma página com o
// motivo em vez de um laço de redirecionamento.
import { NOME_BORDA } from '../guarda.js';

const LOGIN = 'https://astargne.com/login';
const CENTRAL = 'https://astargne.com/';
const MARCA_VOLTA = 'volta';

// Textos fixos: nada do central nem do pedido entra na página ou no JSON. Nenhum repete a
// mensagem do autorizador ("…para confirmar esta ação"): um teste precisa saber quem barrou.
const RECUSAS = {
  'sem-sessao': { status: 401, login: true, erro: 'login necessário: entre no Cadastro Único para abrir o painel' },
  expirada: { status: 401, login: true, erro: 'login expirado: entre de novo no Cadastro Único para abrir o painel' },
  'outra-conta': { status: 403, erro: 'esta conta do Cadastro Único não abre o painel; saia em astargne.com e entre com a conta do dono' },
  'cookie-ambiguo': { status: 401, erro: 'este navegador guarda mais de um cookie de sessão do astargne.com; apague os cookies do site e entre de novo' },
  indisponivel: { status: 503, erro: 'não consegui conferir o login no Cadastro Único agora; tente de novo em instantes' },
  'sem-dono': { status: 503, erro: 'o painel está sem dono configurado (ORQ_OWNER_USER_ID); pela borda ele não abre' },
};

const pagina = ({ erro, login }, entrar) => `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel — login</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0d1117;color:#e6edf3;max-width:34rem;margin:18vh auto;padding:0 1.25rem}a{color:#e8b54a}</style>
</head><body><h1>Painel administrativo</h1><p>${erro}.</p>
<p><a href="${login ? entrar : CENTRAL}">${login ? 'Entrar no Cadastro Único' : 'Abrir astargne.com'}</a></p></body></html>
`;

export class PortaoBorda {
  constructor({ porta, sessao, resposta, proprietarioId, log = console.error }) {
    this.locais = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`]);
    this.sessao = sessao;
    this.resposta = resposta;
    this.temDono = /^[1-9]\d{0,9}$/.test(String(proprietarioId ?? ''));
    this.log = log;
  }

  deLoopback(req) {
    const h = req.headers ?? {};
    return this.locais.has(String(h.host ?? '').toLowerCase())
      && h['x-forwarded-for'] === undefined && h['x-forwarded-host'] === undefined && h.forwarded === undefined;
  }

  // O endereço de volta é montado sobre a origem fixa da borda: caminho e consulta do pedido
  // entram pelos setters de URL, que não trocam o host (um caminho `//x` não vira outro site).
  entrar(url) {
    const volta = new URL(`https://${NOME_BORDA}/`);
    volta.pathname = url.pathname;
    volta.search = url.search;
    volta.searchParams.set(MARCA_VOLTA, '1');
    return `${LOGIN}?next=${encodeURIComponent(volta.href)}`;
  }

  async veredito(req) {
    if (!this.temDono) return 'sem-dono';
    try { return (await this.sessao.lerParaEntrada(req.headers?.cookie)).estado; }
    catch (erro) {
      this.log(`[portao] leitura de sessão falhou: ${erro?.code ?? erro?.name ?? 'erro'}`);
      return 'indisponivel';
    }
  }

  // Devolve true quando respondeu (o pedido para aqui) e false quando ele pode seguir.
  // `url` é a MESMA instância que o roteador usa para despachar: exceção e rota não divergem.
  async barrar(req, res, url) {
    if (this.deLoopback(req)) return false;
    const leitura = req.method === 'GET' || req.method === 'HEAD';
    // O selo: só diz de quem é o cookie apresentado, e é ele que mostra "entrar" numa aba velha.
    if (leitura && url.pathname === '/api/sessao') return false;
    const estado = await this.veredito(req);
    if (estado === 'dono') return false;
    const recusa = RECUSAS[estado] ?? RECUSAS.indisponivel;
    res.setHeader('cache-control', 'no-store');
    if (!leitura || url.pathname.startsWith('/api/')) {
      this.resposta.json(res, { erro: recusa.erro, portao: estado }, recusa.status);
      return true;
    }
    const entrar = this.entrar(url);
    if (recusa.login && !url.searchParams.has(MARCA_VOLTA)) {
      res.writeHead(302, { location: entrar });
      res.end();
      return true;
    }
    res.writeHead(recusa.status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : pagina(recusa, entrar));
    return true;
  }
}
