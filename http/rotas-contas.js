// Repassa o Cadastro Único. Escrita só com sessão SSO; o corpo só é lido depois dela, e só quando a rota está na tabela fechada.
import { resolverRotaContas } from '../contas.js';

export class RotasContas {
  constructor({ resposta, contas, autorizar }) {
    this.resposta = resposta;
    this.contas = contas;
    // Escrita na aba Contas exige a sessão SSO do dono (N5, 29/10/2026), como as outras
    // ações privilegiadas: sem ela o executor local alcançaria o CadastroUnico pelo loopback.
    this.autorizar = autorizar;
  }

  async tentar(req, res, url) {
    if (!url.pathname.startsWith('/api/contas/')) return false;
    // Rota fora da tabela fechada responde 404 sem ler o corpo.
    if (!resolverRotaContas(req.method, url.pathname)) { this.resposta.json(res, { erro: 'não encontrado' }, 404); return true; }
    if (req.method !== 'GET') {
      if (typeof this.autorizar !== 'function') { this.resposta.json(res, { erro: 'ação privilegiada não configurada' }, 503); return true; }
      try { await this.autorizar(req); }
      catch (erro) {
        this.resposta.json(res, { erro: typeof erro.status === 'number' ? erro.message : 'verificação de sessão indisponível' }, typeof erro.status === 'number' ? erro.status : 502);
        return true;
      }
    }
    const corpoTexto = req.method === 'GET' ? '' : await this.resposta.corpo(req);
    const { status, corpo } = await this.contas(req.method, url.pathname, corpoTexto);
    this.resposta.json(res, corpo, status);
    return true;
  }
}
