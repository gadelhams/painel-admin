// Estado local, documentos e git de um projeto.

export class RotasProjetos {
  constructor({ resposta, coletores }) {
    this.resposta = resposta;
    this.coletores = coletores;
  }

  async tentar(_req, res, url) {
    const { pathname } = url;
    const json = (corpo, status) => this.resposta.json(res, corpo, status);
    if (pathname === '/api/projetos') {
      json(await this.coletores.estadoProjetos());
    } else if (pathname.startsWith('/api/projetos/') && pathname.endsWith('/docs')) {
      const pasta = decodeURIComponent(pathname.slice('/api/projetos/'.length, -'/docs'.length));
      const arquivo = url.searchParams.get('arquivo');
      json(arquivo ? await this.coletores.lerModeladorProjeto(pasta, arquivo) : await this.coletores.docsProjeto(pasta));
    } else if (pathname.startsWith('/api/projetos/') && pathname.endsWith('/git')) {
      const pasta = decodeURIComponent(pathname.slice('/api/projetos/'.length, -'/git'.length));
      json(await this.coletores.gitDetalhado(pasta));
    } else {
      return false;
    }
    return true;
  }
}
