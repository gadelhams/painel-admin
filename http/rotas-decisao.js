// Rotas da mesa de decisão: a carta da gaveta e as aplicações pendentes (GET, chave Guest), gravar e retomar (POST, SSO + duas ações). Não monta o serviço.

const ESCRITA = ['/api/decisao/preparar', '/api/decisao/confirmar'];
const RETOMADA = ['/api/decisao/retomada/preparar', '/api/decisao/retomada/confirmar'];
const LEITURA = ['/api/decisao/carta', '/api/decisao/pendentes'];

export class RotasDecisao {
  constructor({ resposta, servico, apiDecisao, apiRetomada, log = console.error }) {
    this.resposta = resposta;
    this.servico = servico;
    this.apiDecisao = apiDecisao;
    this.apiRetomada = apiRetomada;
    this.log = log;
  }

  async tentar(req, res, url) {
    const { pathname } = url;
    if (![...ESCRITA, ...RETOMADA, ...LEITURA].includes(pathname)) return false;
    res.setHeader('cache-control', 'no-store');
    const api = ESCRITA.includes(pathname) ? this.apiDecisao : RETOMADA.includes(pathname) ? this.apiRetomada : null;
    if (api && req.method === 'POST') {
      const { status, corpo } = await api(req, pathname, (pedido) => this.resposta.corpo(pedido));
      this.resposta.json(res, corpo, status);
    } else if (api) {
      this.resposta.naoPermitido(res, 'POST', `use POST em ${pathname}`);
    } else if (LEITURA.includes(pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      await this.ler(res, pathname, url.searchParams);
    } else {
      this.resposta.naoPermitido(res, 'GET, HEAD', 'use GET');
    }
    return true;
  }

  // A mensagem de recusa é da mesa (nunca dado do Plane nem a chave); o resto vira 502 genérico.
  async ler(res, pathname, parametros) {
    try {
      const corpo = pathname === '/api/decisao/carta'
        ? await this.servico.carta(parametros.get('carta'))
        : { pendentes: await this.servico.pendentes() };
      this.resposta.json(res, corpo);
    } catch (erro) {
      if (Number.isInteger(erro.status) && erro.status >= 400 && erro.status < 600) {
        this.resposta.json(res, { erro: erro.message }, erro.status);
        return;
      }
      this.log('[decisao] leitura falhou:', erro.name);
      this.resposta.json(res, { erro: 'não consegui ler a carta no Plane agora' }, 502);
    }
  }
}
