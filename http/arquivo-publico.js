// Serve um arquivo de publico/ sem sair da pasta.

import path from 'node:path';
import fs from 'node:fs/promises';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export class ArquivoPublico {
  constructor({ publico, json }) {
    this.publico = publico;
    this.json = json;
  }

  async enviar(res, urlPath) {
    const nome = (urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath).slice(1);
    const alvo = path.resolve(this.publico, nome);
    if (!alvo.startsWith(this.publico + path.sep)) {
      this.json.enviar(res, { erro: 'caminho inválido' }, 400);
      return;
    }
    try {
      const conteudo = await fs.readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream' });
      res.end(conteudo);
    } catch {
      this.json.enviar(res, { erro: 'não encontrado' }, 404);
    }
  }
}
