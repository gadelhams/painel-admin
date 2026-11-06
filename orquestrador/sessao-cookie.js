// Lê o cookie astargne_session. Não verifica a sessão no Cadastro Único.

const NOME = 'astargne_session=';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class SessaoCookie {
  // { token } quando há exatamente um cookie de sessão bem formado; { ambiguo: true } quando
  // há mais de um (outro subdomínio gravou o seu) ou o cabeçalho é grande demais para ler.
  // O portão precisa da diferença: o central lê o PRIMEIRO cookie e pode achar a sessão boa
  // onde o painel não acha nenhuma — mandar ao login nesse caso é um laço de redirecionamento.
  situacao(cabecalho) {
    if (typeof cabecalho !== 'string') return { token: null, ambiguo: false };
    if (cabecalho.length > 8192) return { token: null, ambiguo: true };
    const valores = cabecalho.split(';').map(p => p.trim()).filter(p => p.startsWith(NOME));
    if (valores.length > 1) return { token: null, ambiguo: true };
    const token = valores.length === 1 ? valores[0].slice(NOME.length) : '';
    return { token: TOKEN.test(token) ? token : null, ambiguo: false };
  }

  extrair(cabecalho) {
    return this.situacao(cabecalho).token;
  }
}

export function situacaoDoCookie(cabecalho) {
  return new SessaoCookie().situacao(cabecalho);
}

export function extrairSessao(cabecalho) {
  return new SessaoCookie().extrair(cabecalho);
}
