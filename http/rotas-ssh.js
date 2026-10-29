// Consulta SSH só de leitura da produção.

export class RotasSsh {
  constructor({ resposta, ssh }) {
    this.resposta = resposta;
    this.ssh = ssh;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/producao/ssh') return false;
    // Só leitura: outro método é recusado aqui mesmo, sem chamar o coletor.
    if (req.method !== 'GET' && req.method !== 'HEAD') { this.resposta.naoPermitido(res, 'GET, HEAD', 'use GET'); return true; }
    this.resposta.json(res, await this.ssh.consultar());
    return true;
  }
}
