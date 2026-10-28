// Inventário do servidor: um ssh de nomes. O valor não volta.

import { CHAVE_SSH, DESTINO_SSH } from './catalogo.js';

export class InventarioServidor {
  constructor({ catalogo, agora, executar, cache, lerLocal }) {
    this.catalogo = catalogo;
    this.agora = agora;
    this.executar = executar;
    this.cache = cache;
    this.lerLocal = lerLocal;
  }

  script() {
    const linhas = [];
    for (const p of this.catalogo) for (const c of p.servidor?.candidatos ?? []) {
      linhas.push(`if sudo test -f '${c}'; then echo "ARQ ${p.projeto.replace(/'/g, '')}|${c}|$(sudo stat -c %a '${c}')"; sudo grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' '${c}' | cut -d= -f1 | sed 's/^/VAR /'; fi`);
    }
    return linhas.join('; ');
  }

  async ler() {
    const r = await this.executar(['-i', CHAVE_SSH, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', DESTINO_SSH, this.script()], '');
    if (r.codigo !== 0) throw new Error('sem acesso ao servidor');
    const arquivos = {};
    let atual = null;
    for (const linha of r.stdout.split('\n')) {
      const arq = /^ARQ ([^|]+)\|([^|]+)\|(\d+)$/.exec(linha);
      if (arq) {
        if (arquivos[arq[1]]) { arquivos[arq[1]].ambiguo = true; arquivos[arq[1]].outros = [...(arquivos[arq[1]].outros ?? []), arq[2]]; atual = null; continue; }
        atual = { arquivo: arq[2], modo: arq[3], nomes: [], lido: true, permissaoFrouxa: (parseInt(arq[3], 8) & 0o077) !== 0 }; arquivos[arq[1]] = atual; continue;
      }
      const v = /^VAR ([A-Za-z_][A-Za-z0-9_]*)$/.exec(linha);
      if (v && atual) atual.nomes.push(v[1]);
    }
    this.cache.atual = { quando: new Date(this.agora()).toISOString(), arquivos };
    return this.lerLocal();
  }
}
