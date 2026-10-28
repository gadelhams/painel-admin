// Consulta SSH só de leitura da produção.

export class RotasSsh {
  constructor({ resposta, ssh }) {
    this.resposta = resposta;
    this.ssh = ssh;
  }

  async tentar(_req, res, url) {
    if (url.pathname !== '/api/producao/ssh') return false;
    this.resposta.json(res, await this.ssh.consultar());
    return true;
  }
}
