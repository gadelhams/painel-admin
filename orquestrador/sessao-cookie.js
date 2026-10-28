// Lê o cookie astargne_session. Não verifica a sessão no Cadastro Único.

export class SessaoCookie {
  extrair(cabecalho) {
    if (typeof cabecalho !== 'string' || cabecalho.length > 8192) return null;
    const valores = cabecalho.split(';').map(p => p.trim()).filter(p => p.startsWith('astargne_session='));
    if (valores.length !== 1) return null;
    const token = valores[0].slice('astargne_session='.length);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
}

export function extrairSessao(cabecalho) {
  return new SessaoCookie().extrair(cabecalho);
}
